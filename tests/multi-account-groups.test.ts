import { describe, it, expect, beforeEach } from 'vitest';
import { dbService } from '@/lib/db-service';
import { OWNER_USER_ID } from '@/lib/auth';
import { GET as accountsGet, POST as accountsPost } from '@/app/api/accounts/route';
import { PATCH as accountPatch, DELETE as accountDelete } from '@/app/api/accounts/[id]/route';
import { GET as groupsGet, POST as groupsPost } from '@/app/api/groups/route';
import { GET as analyticsGet } from '@/app/api/analytics/route';
import { GET as googleStatusGet } from '@/app/api/integrations/google/status/route';
import { handleSendEmailJob } from '@/lib/queue/worker';

describe('Multi-Account Outreach, Grouping, and Per-Inbox Rate Limiting', () => {
  const userId = OWNER_USER_ID;

  beforeEach(async () => {
    // Clean up mock email accounts and groups for fresh state
    const accounts = await dbService.getEmailAccounts(userId);
    for (const acc of accounts) {
      await dbService.deleteEmailAccount(userId, acc.id);
    }
    const groups = await dbService.getAccountGroups(userId);
    for (const grp of groups) {
      await dbService.deleteAccountGroup(grp.id);
    }
  });

  it('allows adding multiple email accounts and calculates aggregate dashboard capacity (e.g., 5 * 18 = 90)', async () => {
    // 1. Add 5 accounts with 18 emails/day limit each
    const addedAccounts = [];
    for (let i = 1; i <= 5; i++) {
      const email = `inbox${i}@coldoutreach.io`;
      const acc = await dbService.upsertEmailAccount({
        user_id: userId,
        email_address: email,
        sender_name: `Sender ${i}`,
        daily_limit: 18,
        min_interval_minutes: 15,
        status: 'active',
        encrypted_access_token: `mock-token-${i}`,
        encrypted_refresh_token: `mock-refresh-${i}`,
      });
      addedAccounts.push(acc);
    }

    expect(addedAccounts.length).toBe(5);

    // 2. Verify account daily stats
    const stats = await dbService.getAccountDailyStats(userId);
    expect(stats.totalAccounts).toBe(5);
    expect(stats.activeAccounts).toBe(5);
    // 5 accounts * 18 emails/day = 90
    expect(stats.dailyCapacity).toBe(90);
    expect(stats.sentToday).toBe(0);
    expect(stats.remainingToday).toBe(90);

    // 3. Verify analytics API returns capacity and remaining sends
    const analyticsRes = await analyticsGet();
    expect(analyticsRes.status).toBe(200);
    const analyticsData = await analyticsRes.json();
    expect(analyticsData.dailyCapacity).toBe(90);
    expect(analyticsData.remainingToday).toBe(90);
    expect(analyticsData.activeAccounts).toBe(5);
  });

  it('groups multiple accounts into an Account Group and assigns a campaign to that group', async () => {
    // 1. Create an Account Group
    const groupReq = new Request('http://localhost:3000/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Domain Alpha Group',
        description: 'Primary inboxes for outbound enterprise campaigns',
      }),
    });
    const groupRes = await groupsPost(groupReq as any);
    expect(groupRes.status).toBe(201);
    const { group } = await groupRes.json();
    expect(group.id).toBeDefined();
    expect(group.name).toBe('Domain Alpha Group');

    // 2. Add 3 accounts assigned to this group
    for (let i = 1; i <= 3; i++) {
      await dbService.upsertEmailAccount({
        user_id: userId,
        email_address: `alpha${i}@domain-alpha.com`,
        sender_name: `Alpha Rep ${i}`,
        group_id: group.id,
        daily_limit: 18,
        min_interval_minutes: 15,
        status: 'active',
        encrypted_access_token: `mock-alpha-${i}`,
        encrypted_refresh_token: `mock-alpha-refresh-${i}`,
      });
    }

    // 3. Verify group accounts count & capacity
    const groups = await dbService.getAccountGroups(userId);
    const targetGroup = groups.find((g) => g.id === group.id);
    expect(targetGroup).toBeDefined();
    expect(targetGroup?.accounts_count).toBe(3);
    // 3 * 18 = 54
    expect(targetGroup?.daily_capacity).toBe(54);

    // 4. Create campaign using this group
    const campaign = await dbService.createCampaign(userId, {
      name: 'Group Targeted Campaign',
      business_context: 'B2B Software',
      ideal_customer_profile: 'VP Engineering',
      offer: 'Modern cloud tools',
      tone: 'Concise',
      call_to_action: '15-min chat',
      initial_email_instructions: 'Keep short',
      account_group_id: group.id,
      sending_config: {
        days: [0, 1, 2, 3, 4, 5, 6],
        start_hour: 0,
        end_hour: 23,
        timezone: 'UTC',
        daily_limit: 54,
        hourly_limit: 10,
      },
      followup_config: {
        max_followups: 1,
        steps: [{ step: 1, delay_days: 3, instructions: 'Follow up' }],
      },
      status: 'active',
      activated_at: new Date().toISOString(),
    });

    expect(campaign.account_group_id).toBe(group.id);
  });

  it('enforces safety intervals and rotates between available inboxes', async () => {
    // 1. Create 2 accounts in a group
    const acc1 = await dbService.upsertEmailAccount({
      user_id: userId,
      email_address: 'rep1@outreach.com',
      daily_limit: 18,
      min_interval_minutes: 15,
      status: 'active',
      encrypted_access_token: 'mock-1',
      encrypted_refresh_token: 'mock-1-ref',
    });

    const acc2 = await dbService.upsertEmailAccount({
      user_id: userId,
      email_address: 'rep2@outreach.com',
      daily_limit: 18,
      min_interval_minutes: 15,
      status: 'active',
      encrypted_access_token: 'mock-2',
      encrypted_refresh_token: 'mock-2-ref',
    });

    const campaign = await dbService.createCampaign(userId, {
      name: 'Rotation Test Campaign',
      business_context: 'Test context',
      ideal_customer_profile: 'Test ICP',
      offer: 'Test Offer',
      tone: 'Professional',
      call_to_action: 'Chat',
      initial_email_instructions: 'Short',
      sending_config: {
        days: [0, 1, 2, 3, 4, 5, 6],
        start_hour: 0,
        end_hour: 23,
        timezone: 'UTC',
        daily_limit: 36,
        hourly_limit: 10,
      },
      followup_config: { max_followups: 0, steps: [] },
      status: 'active',
      activated_at: new Date().toISOString(),
    });

    // Pick 1st account
    const pick1 = await dbService.getAvailableEmailAccountForCampaign(campaign);
    expect(pick1.status).toBe('available');
    if (pick1.status !== 'available') return;
    const selected1 = pick1.account;

    // Simulate sending from selected1 -> sets last_sent_at to now
    await dbService.recordAccountSend(selected1.id);

    // Pick 2nd account immediately -> selected1 is in 15-min cooldown, so it MUST pick the other account!
    const pick2 = await dbService.getAvailableEmailAccountForCampaign(campaign);
    expect(pick2.status).toBe('available');
    if (pick2.status !== 'available') return;
    expect(pick2.account.id).not.toBe(selected1.id);

    // Simulate sending from 2nd account
    await dbService.recordAccountSend(pick2.account.id);

    // Now BOTH accounts sent just now, so both are in cooldown
    const pick3 = await dbService.getAvailableEmailAccountForCampaign(campaign);
    expect(pick3.status).toBe('cooldown');
    if (pick3.status === 'cooldown') {
      expect(pick3.rescheduleAt.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it('enforces maximum 15-18 sends per day per inbox cap', async () => {
    // Create an account with limit of 15 sends/day
    const acc = await dbService.upsertEmailAccount({
      user_id: userId,
      email_address: 'capped@outreach.com',
      daily_limit: 15,
      min_interval_minutes: 10,
      status: 'active',
      encrypted_access_token: 'mock-cap',
      encrypted_refresh_token: 'mock-cap-ref',
    });

    const campaign = await dbService.createCampaign(userId, {
      name: 'Cap Campaign',
      business_context: 'Context',
      ideal_customer_profile: 'ICP',
      offer: 'Offer',
      tone: 'Professional',
      call_to_action: 'Chat',
      initial_email_instructions: 'Short',
      sending_config: {
        days: [0, 1, 2, 3, 4, 5, 6],
        start_hour: 0,
        end_hour: 23,
        timezone: 'UTC',
        daily_limit: 15,
        hourly_limit: 10,
      },
      followup_config: { max_followups: 0, steps: [] },
      status: 'active',
      activated_at: new Date().toISOString(),
    });

    // Create a dummy lead & campaign lead
    const insertLeadRes = await dbService.insertLeads(userId, [{
      normalized_email: 'target@example.com',
      email: 'target@example.com',
      first_name: 'Target',
      last_name: 'Lead',
      company: 'Acme',
      job_title: 'CEO',
      website: 'acme.com',
      notes: '',
      custom_fields: {},
      status: 'active',
      source_import: 'test',
    }]);

    const leadId = (await dbService.getLeads(userId)).leads[0].id;
    await dbService.enrollLeadsInCampaign(campaign.id, [leadId]);
    const cl = (await dbService.getCampaignLeads(campaign.id))[0];

    // Simulate 15 sent messages today from this account
    for (let step = 0; step < 15; step++) {
      await dbService.createOrUpdateMessage({
        campaign_lead_id: cl.id,
        step_number: step + 100, // separate steps
        subject: `Test ${step}`,
        body_text: `Body ${step}`,
        status: 'sent',
        email_account_id: acc.id,
        sent_at: new Date().toISOString(),
      });
    }

    // Verify account daily stats reflect 15 sent, 0 remaining
    const accountStats = await dbService.getEmailAccount(acc.id);
    expect(accountStats?.sent_today).toBe(15);
    expect(accountStats?.remaining_today).toBe(0);

    // Verify campaign sender selector flags daily limit reached
    const checkResult = await dbService.getAvailableEmailAccountForCampaign(campaign);
    expect(checkResult.status).toBe('daily_limit_reached');
  });

  it('manages outreach accounts via API: create, update limits, toggle status, delete', async () => {
    // 1. Create account via POST /api/accounts
    const postReq = new Request('http://localhost:3000/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_address: 'sdr.alex@enterprise.ai',
        sender_name: 'Alex Rivera',
        daily_limit: 18,
        min_interval_minutes: 15,
      }),
    });
    const postRes = await accountsPost(postReq as any);
    expect(postRes.status).toBe(201);
    const postData = await postRes.json();
    expect(postData.account.email_address).toBe('sdr.alex@enterprise.ai');
    expect(postData.account.daily_limit).toBe(18);

    const accountId = postData.account.id;

    // 2. Update account limit to 16 and pause via PATCH /api/accounts/[id]
    const patchReq = new Request(`http://localhost:3000/api/accounts/${accountId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        daily_limit: 16,
        status: 'paused',
      }),
    });
    const patchRes = await accountPatch(patchReq as any, { params: Promise.resolve({ id: accountId }) });
    expect(patchRes.status).toBe(200);
    const patchData = await patchRes.json();
    expect(patchData.account.daily_limit).toBe(16);
    expect(patchData.account.status).toBe('paused');

    // 3. Delete account via DELETE /api/accounts/[id]
    const delReq = new Request(`http://localhost:3000/api/accounts/${accountId}`, { method: 'DELETE' });
    const delRes = await accountDelete(delReq as any, { params: Promise.resolve({ id: accountId }) });
    expect(delRes.status).toBe(200);

    const accountsAfter = await dbService.getEmailAccounts(userId);
    expect(accountsAfter.find((a) => a.id === accountId)).toBeUndefined();
  });

  it('supports Google integration status endpoint when connecting mail account', async () => {
    // 1. Initial status before connection
    const statusBefore = await googleStatusGet();
    expect(statusBefore.status).toBe(200);
    const bodyBefore = await statusBefore.json();
    expect(bodyBefore.connected).toBe(false);

    // 2. Connect a Gmail account
    await dbService.upsertEmailAccount({
      user_id: userId,
      provider: 'gmail',
      email_address: 'founder@mycompany.com',
      sender_name: 'Founder',
      daily_limit: 18,
      min_interval_minutes: 15,
      status: 'active',
      encrypted_access_token: 'valid-access-token',
      encrypted_refresh_token: 'valid-refresh-token',
      token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      granted_scopes: ['https://www.googleapis.com/auth/gmail.send'],
    });

    // 3. Status check after connection
    const statusAfter = await googleStatusGet();
    expect(statusAfter.status).toBe(200);
    const bodyAfter = await statusAfter.json();
    expect(bodyAfter.connected).toBe(true);
    expect(bodyAfter.email).toBe('founder@mycompany.com');
    expect(bodyAfter.token_expired).toBe(false);
  });
});
