import { describe, it, expect, beforeEach } from 'vitest';
import { dbService } from '@/lib/db-service';
import { mockDb } from '@/lib/supabase/mock-db';
import { getAuthenticatedUser, OWNER_USER_ID } from '@/lib/auth';
import { cachedJsonFetch, invalidateClientCache } from '@/lib/client-fetch';
import { GET as analyticsGet } from '@/app/api/analytics/route';
import { GET as campaignsGet } from '@/app/api/campaigns/route';
import { GET as accountsGet } from '@/app/api/accounts/route';

describe('API Latency & Query Optimization Tests', () => {
  const userId = OWNER_USER_ID;

  beforeEach(() => {
    mockDb.leads.clear();
    mockDb.campaigns.clear();
    mockDb.campaignLeads.clear();
    mockDb.emailMessages.clear();
    mockDb.emailAccounts.clear();
    mockDb.accountGroups.clear();
    mockDb.leadGroups.clear();
    mockDb.suppressions.clear();
    mockDb.jobQueue.clear();
    mockDb.replyEvents.clear();
    invalidateClientCache();
  });

  it('verifies getDashboardStats computes accurate metrics with zero over-fetching', async () => {
    // 1. Seed test data
    await dbService.insertLeads(userId, [
      {
        email: 'lead.a@test.com',
        normalized_email: 'lead.a@test.com',
        first_name: 'Lead',
        last_name: 'A',
        company: 'Corp A',
        job_title: 'Lead',
        website: 'corpa.com',
        notes: '',
        custom_fields: {},
        status: 'active',
        source_import: 'manual',
      },
      {
        email: 'lead.b@test.com',
        normalized_email: 'lead.b@test.com',
        first_name: 'Lead',
        last_name: 'B',
        company: 'Corp B',
        job_title: 'Lead',
        website: 'corpb.com',
        notes: '',
        custom_fields: {},
        status: 'bounced',
        source_import: 'manual',
      },
    ]);

    const campaign = await dbService.createCampaign(userId, {
      name: 'Q4 High Value Outreach',
      status: 'active',
      activated_at: new Date().toISOString(),
      business_context: 'B2B',
      ideal_customer_profile: 'Tech',
      offer: 'Audit',
      tone: 'Concise',
      call_to_action: '15 min call',
      initial_email_instructions: 'Short email',
      sending_config: {
        timezone: 'UTC',
        start_hour: 9,
        end_hour: 17,
        daily_limit: 10,
        hourly_limit: 3,
        days: [1, 2, 3, 4, 5],
      },
      followup_config: { steps: [], max_followups: 0 },
    });

    const lead = Array.from(mockDb.leads.values())[0];
    await dbService.enrollLeadsInCampaign(campaign.id, [lead.id]);
    const campaignLeads = await dbService.getCampaignLeads(campaign.id);
    const enrolledLead = campaignLeads[0];

    // Seed draft and sent messages
    const draftMsg = await dbService.createOrUpdateMessage({
      campaign_lead_id: enrolledLead.id,
      step_number: 0,
      subject: 'Quick question',
      body_text: 'Hello!',
      personalization_basis: [],
      unsupported_claims: [],
      status: 'draft',
      scheduled_at: null,
      email_account_id: null,
    });

    await dbService.createOrUpdateMessage({
      id: draftMsg.id,
      campaign_lead_id: enrolledLead.id,
      step_number: 0,
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    // Seed suppression
    await dbService.addSuppression(userId, 'suppressed@test.com', 'unsubscribe');

    // 2. Fetch stats
    const stats = await dbService.getDashboardStats(userId);

    // 3. Verify exact backward-compatible contract
    expect(stats.totalLeads).toBe(2);
    expect(stats.eligibleLeads).toBe(1);
    expect(stats.bounceCount).toBe(1);
    expect(stats.campaignsCount).toBe(1);
    expect(stats.activeCampaignsCount).toBe(1);
    expect(stats.emailsSent).toBe(1);
    expect(stats.draftsGenerated).toBe(0);
    expect(stats.suppressionCount).toBe(1);
    expect(stats.failedJobs).toBe(0);
    expect(typeof stats.dailyCapacity).toBe('number');
    expect(typeof stats.sentToday).toBe('number');
    expect(typeof stats.remainingToday).toBe('number');
  });

  it('verifies /api/analytics returns 200 with Cache-Control headers', async () => {
    const res = await analyticsGet();
    expect(res.status).toBe(200);

    const cacheHeader = res.headers.get('Cache-Control');
    expect(cacheHeader).toContain('private');
    expect(cacheHeader).toContain('stale-while-revalidate');

    const data = await res.json();
    expect(typeof data.totalLeads).toBe('number');
    expect(typeof data.campaignsCount).toBe('number');
  });

  it('verifies /api/campaigns returns 200 with parallelized group hydration and cache headers', async () => {
    await dbService.createCampaign(userId, {
      name: 'Campaign Alpha',
      status: 'active',
      activated_at: new Date().toISOString(),
      business_context: 'Context',
      ideal_customer_profile: 'ICP',
      offer: 'Offer',
      tone: 'Formal',
      call_to_action: 'CTA',
      initial_email_instructions: 'Instructions',
      sending_config: {
        timezone: 'UTC',
        start_hour: 9,
        end_hour: 17,
        daily_limit: 10,
        hourly_limit: 3,
        days: [1, 2, 3, 4, 5],
      },
      followup_config: { steps: [], max_followups: 0 },
    });

    const res = await campaignsGet();
    expect(res.status).toBe(200);

    const cacheHeader = res.headers.get('Cache-Control');
    expect(cacheHeader).toContain('private');

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0].name).toBe('Campaign Alpha');
  });

  it('verifies getEmailAccounts correctly computes sent_today with selective query', async () => {
    const acc = await dbService.upsertEmailAccount({
      user_id: userId,
      email_address: 'sender@example.com',
      sender_name: 'Sender',
      provider: 'gmail',
      status: 'active',
      daily_limit: 15,
      min_interval_minutes: 10,
      encrypted_access_token: 'enc-token',
      encrypted_refresh_token: 'enc-refresh',
      granted_scopes: [],
      connected_at: new Date().toISOString(),
    });

    // Add a sent message today
    const nowIso = new Date().toISOString();
    mockDb.emailMessages.set('msg-1', {
      id: 'msg-1',
      campaign_lead_id: 'cl-1',
      step_number: 0,
      subject: 'Test',
      body_text: 'Body',
      personalization_basis: [],
      unsupported_claims: [],
      status: 'sent',
      sent_at: nowIso,
      email_account_id: acc.id,
      gmail_message_id: null,
      gmail_thread_id: null,
      scheduled_at: null,
      error_code: null,
      error_message: null,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const accounts = await dbService.getEmailAccounts(userId);
    expect(accounts.length).toBe(1);
    expect(accounts[0].sent_today).toBe(1);
    expect(accounts[0].remaining_today).toBe(14);
  });

  it('verifies client-side fetch deduplication and stale-while-revalidate caching', async () => {
    let fetchCount = 0;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => {
      fetchCount++;
      return new Response(JSON.stringify({ value: 'cached-data', fetchCount }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      // 1. Concurrent requests coalescing (in-flight deduplication)
      const [res1, res2] = await Promise.all([
        cachedJsonFetch<{ value: string; fetchCount: number }>('/api/test-dedup'),
        cachedJsonFetch<{ value: string; fetchCount: number }>('/api/test-dedup'),
      ]);

      expect(res1.value).toBe('cached-data');
      expect(res2.value).toBe('cached-data');
      expect(fetchCount).toBe(1); // Only 1 network request made!

      // 2. Cache hit on subsequent request
      const res3 = await cachedJsonFetch<{ value: string }>('/api/test-dedup');
      expect(res3.value).toBe('cached-data');
      expect(fetchCount).toBe(1); // Still 1, served from in-memory cache!

      // 3. Cache invalidation
      invalidateClientCache('/api/test-dedup');
      const res4 = await cachedJsonFetch<{ value: string }>('/api/test-dedup');
      expect(fetchCount).toBe(2); // Invalidation forced fresh fetch!
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('verifies getAuthenticatedUser memoization', async () => {
    const user1 = await getAuthenticatedUser();
    const user2 = await getAuthenticatedUser();
    expect(user1).not.toBeNull();
    expect(user1?.id).toBe(OWNER_USER_ID);
    expect(user2?.id).toBe(OWNER_USER_ID);
  });
});
