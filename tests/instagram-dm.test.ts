import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDb } from '@/lib/supabase/mock-db';
import { dbService } from '@/lib/db-service';
import { OWNER_USER_ID } from '@/lib/auth';
import { sanitizeInstagramAccountForClient } from '@/lib/security';
import { encryptToken } from '@/lib/crypto';
import {
  normalizeInstagramHandle,
  isValidInstagramHandle,
  formatInstagramHandle,
  buildInstagramUrl,
} from '@/lib/instagram/handles';
import {
  autoDetectInstagramColumnMapping,
  processInstagramImportRows,
} from '@/lib/instagram/csv';
import { instagramDb } from '@/lib/instagram/db';
import {
  loginWithInstagramCredentials,
  verifyInstagramSession,
  parseSessionInput,
  ensureCookieBundle,
} from '@/lib/instagram/client';
import { handleGenerateIgDmJob, handleSendIgDmJob } from '@/lib/instagram/worker';

describe('Instagram DM Automation Engine', () => {
  beforeEach(() => {
    mockDb.instagramAccounts.clear();
    mockDb.instagramLeadGroups.clear();
    mockDb.instagramLeads.clear();
    mockDb.instagramCampaigns.clear();
    mockDb.instagramCampaignLeads.clear();
    mockDb.instagramMessages.clear();
    mockDb.instagramReplyEvents.clear();
    mockDb.campaigns.clear();
    mockDb.leads.clear();
    mockDb.campaignLeads.clear();
    mockDb.jobQueue.clear();
    process.env.MOCK_MODE = 'true';
  });

  it('normalizes and validates Instagram handles and profile URLs', () => {
    expect(normalizeInstagramHandle('@John.Doe ')).toBe('john.doe');
    expect(normalizeInstagramHandle('https://www.instagram.com/Jane_Creator/?igsh=xyz123')).toBe('jane_creator');
    expect(normalizeInstagramHandle('instagram.com/arenova.ai/')).toBe('arenova.ai');
    expect(normalizeInstagramHandle('https://www.instagram.com/reel/abc123/')).toBe('');

    expect(isValidInstagramHandle('john.doe')).toBe(true);
    expect(isValidInstagramHandle('.bad')).toBe(false);
    expect(isValidInstagramHandle('bad..name')).toBe(false);
    expect(formatInstagramHandle('john.doe')).toBe('@john.doe');
    expect(buildInstagramUrl('@john.doe')).toBe('https://www.instagram.com/john.doe/');
  });

  it('auto-detects Instagram CSV columns and supports rows with or without handles', () => {
    const headers = ['IG Handle', 'Full Name', 'Brand', 'Niche', 'Instagram Bio', 'Followers', 'City'];
    const mapping = autoDetectInstagramColumnMapping(headers);
    expect(mapping.instagram_handle).toBe('IG Handle');
    expect(mapping.full_name).toBe('Full Name');
    expect(mapping.company).toBe('Brand');
    expect(mapping.niche).toBe('Niche');
    expect(mapping.bio).toBe('Instagram Bio');
    expect(mapping.followers_count).toBe('Followers');

    const rows = [
      {
        'IG Handle': 'https://instagram.com/glow.studio/',
        'Full Name': 'Maya Lin',
        Brand: 'Glow Studio',
        Niche: 'Skincare',
        'Instagram Bio': 'Clean skincare rituals',
        Followers: '14.5k',
        City: 'Austin',
      },
      {
        'IG Handle': '',
        'Full Name': 'Alex NoHandle',
        Brand: 'Pending Brand',
        Niche: 'Fitness',
        'Instagram Bio': '',
        Followers: '2000',
        City: 'NYC',
      },
    ];

    const strictRes = processInstagramImportRows(rows, mapping, new Set(), null, { allowMissingHandle: false });
    expect(strictRes.validLeads).toHaveLength(1);
    expect(strictRes.validLeads[0].normalized_handle).toBe('glow.studio');
    expect(strictRes.validLeads[0].followers_count).toBe(14500);
    expect(strictRes.invalidRows).toHaveLength(1);

    const flexibleRes = processInstagramImportRows(rows, mapping, new Set(), null, { allowMissingHandle: true });
    expect(flexibleRes.validLeads).toHaveLength(2);
    expect(flexibleRes.validLeads[1].normalized_handle).toBe('');
  });

  it('connects Instagram account in mock/session mode and sanitizes credentials for client', async () => {
    const loginRes = await loginWithInstagramCredentials('@outreach_sender', 'mock-pass');
    expect(loginRes.status).toBe('authenticated');
    expect(loginRes.cookies?.sessionid).toBeTruthy();

    const sessionRes = await verifyInstagramSession({ sessionid: 'mock-ig-session-123' }, '@mybrand');
    expect(sessionRes.valid).toBe(true);
    expect(sessionRes.username).toBe('mybrand');

    const acc = await instagramDb.upsertInstagramAccount({
      user_id: OWNER_USER_ID,
      username: 'mybrand',
      auth_method: 'session',
      encrypted_session_id: encryptToken('secret-session-val'),
      encrypted_password: encryptToken('secret-pw'),
      encrypted_access_token: encryptToken('secret-token'),
    });

    const sanitized = sanitizeInstagramAccountForClient(acc);
    expect((sanitized as any).encrypted_session_id).toBeUndefined();
    expect((sanitized as any).encrypted_password).toBeUndefined();
    expect((sanitized as any).encrypted_access_token).toBeUndefined();
    expect(sanitized.username).toBe('mybrand');
  });

  it('correctly parses raw, quoted, colons, key-value and full cookie headers via parseSessionInput', () => {
    // 1. Raw percent-encoded value
    const p1 = parseSessionInput('70857948332%3AbhWkd9w0%3A19%3A123');
    expect(p1.sessionid).toBe('70857948332%3AbhWkd9w0%3A19%3A123');
    expect(p1.ds_user_id).toBe('70857948332');

    // 2. Raw unencoded colons value
    const p2 = parseSessionInput('70857948332:bhWkd9w0:19:123');
    expect(p2.sessionid).toBe('70857948332%3AbhWkd9w0%3A19%3A123');
    expect(p2.ds_user_id).toBe('70857948332');

    // 3. Key-value string
    const p3 = parseSessionInput('sessionid=70857948332%3AbhWkd9w0%3A19%3A123');
    expect(p3.sessionid).toBe('70857948332%3AbhWkd9w0%3A19%3A123');
    expect(p3.ds_user_id).toBe('70857948332');

    // 4. Quoted string
    const p4 = parseSessionInput('"sessionid=70857948332%3AbhWkd9w0%3A19%3A123"');
    expect(p4.sessionid).toBe('70857948332%3AbhWkd9w0%3A19%3A123');
    expect(p4.ds_user_id).toBe('70857948332');

    // 5. Full browser cookie header string
    const fullHeader =
      'mid=Z123; ig_did=D456; csrftoken=abc987; ds_user_id=70857948332; sessionid="70857948332%3AbhWkd9w0%3A19%3A123"; rur="RVA"';
    const p5 = parseSessionInput(fullHeader);
    expect(p5.sessionid).toBe('70857948332%3AbhWkd9w0%3A19%3A123');
    expect(p5.csrftoken).toBe('abc987');
    expect(p5.ds_user_id).toBe('70857948332');
    expect(p5.mid).toBe('Z123');
    expect(p5.ig_did).toBe('D456');
    expect(p5.rur).toBe('RVA');
  });

  it('resiliently verifies session with valid token structure and handle when network throttled', async () => {
    // Non-mock session format: <user_id>%3A<token>
    delete process.env.MOCK_MODE;
    const globalFetch = globalThis.fetch;

    // Simulate Instagram returning 400 generic error from datacenter IP
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "We're sorry, but something went wrong. Please try again." }),
      headers: new Headers(),
    });

    try {
      const res = await verifyInstagramSession(
        '70857948332%3AbhWkd9w0i0P4xyz%3A19%3A1782390123',
        'arenova.ai'
      );
      expect(res.valid).toBe(true);
      expect(res.username).toBe('arenova.ai');
      expect(res.igUserId).toBe('70857948332');
      expect(res.cookies?.sessionid).toBe('70857948332%3AbhWkd9w0i0P4xyz%3A19%3A1782390123');
    } finally {
      globalThis.fetch = globalFetch;
      process.env.MOCK_MODE = 'true';
    }
  });

  it('keeps Instagram campaigns segregated while bridging leads from an Email Campaign and allowing inline @handle assignment + DM dispatch', async () => {
    // 1. Create an existing Email Campaign with a lead (no IG handle initially)
    const emailCamp = await dbService.createCampaign(OWNER_USER_ID, {
      name: 'Email Campaign A',
      status: 'draft',
      business_context: '',
      ideal_customer_profile: '',
      offer: '',
      tone: 'Concise',
      call_to_action: 'Quick chat',
      initial_email_instructions: '',
      sending_config: {
        days: [1, 2, 3, 4, 5],
        start_hour: 9,
        end_hour: 17,
        timezone: 'UTC',
        daily_limit: 10,
        hourly_limit: 3,
      },
      followup_config: {
        max_followups: 0,
        steps: [],
      },
      activated_at: null,
    });
    const emailInsert = await dbService.insertLeads(OWNER_USER_ID, [
      {
        email: 'founder@acmestudio.com',
        normalized_email: 'founder@acmestudio.com',
        first_name: 'Sam',
        last_name: 'Kerr',
        company: 'Acme Studio',
        job_title: 'Founder',
        website: 'https://acmestudio.com',
        notes: '',
        status: 'active',
        source_import: 'test',
        custom_fields: {},
      },
    ]);
    const emailLeadId = Array.from(mockDb.leads.values())[0].id;
    expect(emailInsert.inserted).toBe(1);
    await dbService.enrollLeadsInCampaign(emailCamp.id, [emailLeadId]);

    // 2. Create independent Instagram Account & Instagram DM Campaign
    const igAcc = await instagramDb.upsertInstagramAccount({
      user_id: OWNER_USER_ID,
      username: 'sender_ig',
      ig_user_id: 'mock-ig-sender_ig',
      auth_method: 'session',
      encrypted_session_id: encryptToken('mock-ig-session-sender'),
      daily_limit: 25,
      min_interval_minutes: 10,
      status: 'active',
    });

    const igCamp = await instagramDb.createInstagramCampaign(OWNER_USER_ID, {
      name: 'IG DM Campaign Independent',
      instagram_account_id: igAcc.id,
      offer: 'Automate your studio client bookings',
      call_to_action: 'open to a quick 10-min chat?',
    });

    // Verify segregation: email campaigns list does NOT include IG campaign
    const emailCampaigns = await dbService.getCampaigns(OWNER_USER_ID);
    expect(emailCampaigns.map((c) => c.id)).toEqual([emailCamp.id]);

    // 3. Pull leads from Email Campaign into IG Campaign
    const imported = await instagramDb.importLeadsFromEmailSource(OWNER_USER_ID, {
      emailCampaignId: emailCamp.id,
    });
    expect(imported.created).toBe(1);
    expect(imported.leads[0].normalized_handle).toBe('');

    await instagramDb.enrollInstagramLeads(
      igCamp.id,
      imported.leads.map((l) => l.id)
    );

    // 4. Add Instagram handle inline to the bridged lead
    const updatedLead = await instagramDb.updateInstagramLead(imported.leads[0].id, {
      instagram_handle: '@acmestudio.official',
    });
    expect(updatedLead.normalized_handle).toBe('acmestudio.official');
    expect(updatedLead.instagram_handle).toBe('@acmestudio.official');

    // 5. Generate AI DM draft
    const cl = (await instagramDb.getInstagramCampaignLeads(igCamp.id))[0];
    await handleGenerateIgDmJob({ campaignLeadId: cl.id, stepNumber: 0 });

    const msgs = await instagramDb.getInstagramMessages({ campaignId: igCamp.id });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].status).toBe('draft');
    expect(msgs[0].body_text.length).toBeGreaterThan(10);

    // 6. Activate & Send DM (forced to bypass sending window in unit test)
    await instagramDb.updateInstagramCampaign(igCamp.id, { status: 'active' });
    await handleSendIgDmJob({ instagramMessageId: msgs[0].id }, true);

    const sentMsg = await instagramDb.getInstagramMessage(msgs[0].id);
    expect(sentMsg?.status).toBe('sent');
    expect(sentMsg?.ig_message_id).toContain('mock-ig-msg-');

    // Verify a follow-up scheduling job was enqueued for step 1
    const followups = Array.from(mockDb.jobQueue.values()).filter(
      (j) => j.job_type === 'schedule_ig_followup'
    );
    expect(followups).toHaveLength(1);
  });

  it('handles account disconnects and auth expiration gracefully', async () => {
    const acc = await instagramDb.upsertInstagramAccount({
      user_id: OWNER_USER_ID,
      username: 'expired_ig',
      auth_method: 'session',
      status: 'active',
    });

    const camp = await instagramDb.createInstagramCampaign(OWNER_USER_ID, {
      name: 'Auth Expiry Test',
      instagram_account_id: acc.id,
    });
    await instagramDb.updateInstagramCampaign(camp.id, { status: 'active' });

    const insert = await instagramDb.insertInstagramLeads(OWNER_USER_ID, [
      { instagram_handle: '@target.user', status: 'active' },
    ]);
    const lead = insert.insertedLeads[0];

    await instagramDb.enrollInstagramLeads(camp.id, [lead.id]);
    const cl = (await instagramDb.getInstagramCampaignLeads(camp.id))[0];

    const msg = await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: cl.id,
      step_number: 0,
      body_text: 'Test DM',
      status: 'scheduled',
      instagram_account_id: acc.id,
    });

    // Mock sendInstagramDM throwing AUTH_EXPIRED
    const igClient = await import('@/lib/instagram/client');
    const spy = vi.spyOn(igClient, 'sendInstagramDM').mockRejectedValue(
      new Error(`AUTH_EXPIRED: Instagram session expired for @${acc.username}. Reconnect required.`)
    );

    try {
      await expect(handleSendIgDmJob({ instagramMessageId: msg.id }, true)).rejects.toThrow('AUTH_EXPIRED');
      
      const updatedAcc = await instagramDb.getInstagramAccount(acc.id);
      expect(updatedAcc?.status).toBe('error');
      expect(updatedAcc?.last_error).toContain('AUTH_EXPIRED');

      const failedMsg = await instagramDb.getInstagramMessage(msg.id);
      expect(failedMsg?.status).toBe('failed');
      expect(failedMsg?.error_message).toContain('AUTH_EXPIRED');
    } finally {
      spy.mockRestore();
    }
  });

  it('enforces per-account cooldown intervals and reschedules pending DMs', async () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const acc = await instagramDb.upsertInstagramAccount({
      user_id: OWNER_USER_ID,
      username: 'cooldown_ig',
      auth_method: 'session',
      daily_limit: 25,
      min_interval_minutes: 15,
      status: 'active',
      last_sent_at: twoMinutesAgo,
    });

    const camp = await instagramDb.createInstagramCampaign(OWNER_USER_ID, {
      name: 'Cooldown Test',
      instagram_account_id: acc.id,
      sending_config: {
        days: [0, 1, 2, 3, 4, 5, 6],
        start_hour: 0,
        end_hour: 24,
        timezone: 'UTC',
        daily_limit: 25,
        hourly_limit: 10,
      },
    });
    await instagramDb.updateInstagramCampaign(camp.id, { status: 'active' });

    const insert = await instagramDb.insertInstagramLeads(OWNER_USER_ID, [
      { instagram_handle: '@cooldown.target', status: 'active' },
    ]);
    const lead = insert.insertedLeads[0];

    await instagramDb.enrollInstagramLeads(camp.id, [lead.id]);
    const cl = (await instagramDb.getInstagramCampaignLeads(camp.id))[0];

    const msg = await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: cl.id,
      step_number: 0,
      body_text: 'Hey there',
      status: 'scheduled',
      instagram_account_id: acc.id,
    });

    // Run without force: should detect cooldown (elapsed 2 min < 15 min requirement)
    await handleSendIgDmJob({ instagramMessageId: msg.id }, false);

    const rescheduledMsg = await instagramDb.getInstagramMessage(msg.id);
    expect(rescheduledMsg?.status).toBe('scheduled');
    expect(new Date(rescheduledMsg!.scheduled_at!).getTime()).toBeGreaterThan(Date.now());

    // Verify a rescheduled job was added to the queue
    const queued = Array.from(mockDb.jobQueue.values()).filter(
      (j) => j.job_type === 'send_ig_dm' && String(j.idempotency_key).includes('cooldown_ig_')
    );
    expect(queued).toHaveLength(1);
  });

  it('handles HTTP 429 rate limits gracefully by backing off without failing the lead', async () => {
    const acc = await instagramDb.upsertInstagramAccount({
      user_id: OWNER_USER_ID,
      username: 'rate_limited_sender',
      auth_method: 'session',
      status: 'active',
      encrypted_session_id: encryptToken('mock-ig-session-429'),
      daily_limit: 15,
      min_interval_minutes: 1,
    });

    const camp = await instagramDb.createInstagramCampaign(OWNER_USER_ID, {
      name: 'Rate Limit Resilience Camp',
      instagram_account_id: acc.id,
      sending_config: {
        days: [0, 1, 2, 3, 4, 5, 6],
        start_hour: 0,
        end_hour: 24,
        timezone: 'UTC',
        daily_limit: 25,
        hourly_limit: 10,
      },
    });
    await instagramDb.updateInstagramCampaign(camp.id, { status: 'active' });

    const insert = await instagramDb.insertInstagramLeads(OWNER_USER_ID, [
      { instagram_handle: '@rate_limited_lead', status: 'active' },
    ]);
    const lead = insert.insertedLeads[0];
    await instagramDb.enrollInstagramLeads(camp.id, [lead.id]);
    const cl = (await instagramDb.getInstagramCampaignLeads(camp.id))[0];

    const msg = await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: cl.id,
      step_number: 0,
      body_text: 'Test message for rate limit handling',
      status: 'scheduled',
      instagram_account_id: acc.id,
    });

    // Mock sendInstagramDM to simulate HTTP 429 rate limit error
    const clientModule = await import('@/lib/instagram/client');
    const sendSpy = vi.spyOn(clientModule, 'sendInstagramDM').mockRejectedValueOnce(
      new Error('RATE_LIMITED: Could not resolve Instagram profile @rate_limited_lead (HTTP 429 rate limit). Throttled by Instagram.')
    );

    // Call handleSendIgDmJob
    await handleSendIgDmJob({ instagramMessageId: msg.id }, false);

    // Message must remain scheduled (NOT failed!)
    const refreshedMsg = await instagramDb.getInstagramMessage(msg.id);
    expect(refreshedMsg?.status).toBe('scheduled');
    expect(refhedMsgOrError(refreshedMsg?.error_message)).toContain('429');
    expect(new Date(refreshedMsg!.scheduled_at!).getTime()).toBeGreaterThan(Date.now());

    // Campaign lead must stay drafted/in_progress (NOT failed!)
    const refreshedCl = await instagramDb.getInstagramCampaignLead(cl.id);
    expect(refreshedCl?.status).not.toBe('failed');

    // Account must have last_error recording the rate limit
    const refreshedAcc = await instagramDb.getInstagramAccount(acc.id);
    expect(refreshedAcc?.last_error).toContain('429');

    // Enqueued retry job must exist
    const retryJob = Array.from(mockDb.jobQueue.values()).find(
      (j) => j.job_type === 'send_ig_dm' && String(j.idempotency_key).includes('retry_ig_429_')
    );
    expect(retryJob).toBeDefined();

    sendSpy.mockRestore();
  });

  it('reschedules failed and drafted messages when resuming an active campaign', async () => {
    const acc = await instagramDb.upsertInstagramAccount({
      user_id: OWNER_USER_ID,
      username: 'resume_sender',
      auth_method: 'session',
      status: 'active',
      encrypted_session_id: encryptToken('mock-ig-session-resume'),
    });

    const camp = await instagramDb.createInstagramCampaign(OWNER_USER_ID, {
      name: 'Resume Reschedule Camp',
      instagram_account_id: acc.id,
      sending_config: {
        days: [0, 1, 2, 3, 4, 5, 6],
        start_hour: 0,
        end_hour: 24,
        timezone: 'UTC',
        daily_limit: 25,
        hourly_limit: 10,
      },
    });
    await instagramDb.updateInstagramCampaign(camp.id, { status: 'active' });

    const insert = await instagramDb.insertInstagramLeads(OWNER_USER_ID, [
      { instagram_handle: '@draft_lead', status: 'active' },
      { instagram_handle: '@failed_lead', status: 'active' },
    ]);

    await instagramDb.enrollInstagramLeads(camp.id, [insert.insertedLeads[0].id, insert.insertedLeads[1].id]);
    const [cl1, cl2] = await instagramDb.getInstagramCampaignLeads(camp.id);

    // Draft message
    await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: cl1.id,
      step_number: 0,
      body_text: 'Draft body text',
      status: 'draft',
      instagram_account_id: acc.id,
    });

    // Failed message (e.g. from 429)
    await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: cl2.id,
      step_number: 0,
      body_text: 'Failed body text to be resumed',
      status: 'failed',
      instagram_account_id: acc.id,
    });
    await instagramDb.updateInstagramCampaignLead(cl2.id, { status: 'failed', last_error: 'HTTP 429' });

    // Call rescheduleInstagramCampaignMessages with includeFailed: true
    const count = await instagramDb.rescheduleInstagramCampaignMessages(camp.id, { includeFailed: true });
    expect(count).toBe(2);

    const msgs = await instagramDb.getInstagramMessages({ campaignId: camp.id });
    expect(msgs.every((m) => m.status === 'scheduled')).toBe(true);

    const leads = await instagramDb.getInstagramCampaignLeads(camp.id);
    expect(leads.every((l) => l.status === 'in_progress')).toBe(true);
  });

  it('preserves body_text and metadata during partial status and backoff updates', async () => {
    const insert = await instagramDb.insertInstagramLeads(OWNER_USER_ID, [
      {
        instagram_handle: '@cafeparis_lucknow',
        normalized_handle: 'cafeparis_lucknow',
        company: 'Cafe Paris',
        status: 'active',
      },
    ]);
    const lead = insert.insertedLeads[0];

    const camp = await instagramDb.createInstagramCampaign(OWNER_USER_ID, {
      name: 'Partial Update Stability',
      status: 'active',
    });

    await instagramDb.enrollInstagramLeads(camp.id, [lead.id]);
    const cl = (await instagramDb.getInstagramCampaignLeads(camp.id))[0];

    // Initial message creation with AI-generated body text
    const initial = await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: cl.id,
      step_number: 0,
      body_text: 'Hey Cafe Paris! Love your aesthetic dishes.',
      personalization_basis: ['French bakery Lucknow'],
      status: 'draft',
    });

    expect(initial.body_text).toBe('Hey Cafe Paris! Love your aesthetic dishes.');

    // Partial update: only updating status and scheduled_at (body_text omitted)
    const updatedStatus = await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: cl.id,
      step_number: 0,
      status: 'scheduled',
      scheduled_at: new Date(Date.now() + 60000).toISOString(),
    });

    expect(updatedStatus.body_text).toBe('Hey Cafe Paris! Love your aesthetic dishes.');
    expect(updatedStatus.personalization_basis).toEqual(['French bakery Lucknow']);
    expect(updatedStatus.status).toBe('scheduled');

    // Partial update 2: backoff error message update (body_text omitted)
    const updatedBackoff = await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: cl.id,
      step_number: 0,
      status: 'scheduled',
      error_message: 'Account is cooling down after rate limit (HTTP 429). Retrying at 12:49:21 AM.',
    });

    expect(updatedBackoff.body_text).toBe('Hey Cafe Paris! Love your aesthetic dishes.');
    expect(updatedBackoff.status).toBe('scheduled');
    expect(updatedBackoff.error_message).toContain('cooling down');
  });

  it('ensureCookieBundle generates required CSRF, MID, and device identifiers', () => {
    const minimal = ensureCookieBundle({
      sessionid: '49121359678%3AbhWkd9A%3A19%3AAYf',
    });

    expect(minimal.sessionid).toBe('49121359678%3AbhWkd9A%3A19%3AAYf');
    expect(minimal.ds_user_id).toBe('49121359678');
    expect(minimal.csrftoken).toBeTruthy();
    expect(minimal.csrftoken?.length).toBe(32);
    expect(minimal.mid).toBeTruthy();
    expect(minimal.ig_did).toBeTruthy();
  });
});

function refhedMsgOrError(val?: string | null): string {
  return val || '';
}
