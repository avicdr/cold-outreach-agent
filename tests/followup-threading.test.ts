import { describe, it, expect, beforeEach } from 'vitest';
import { dbService } from '@/lib/db-service';
import { handleGenerateEmailJob, handleSendEmailJob } from '@/lib/queue/worker';
import { mockDb } from '@/lib/supabase/mock-db';

describe('Follow-up Threading and Same Inbox Enforcement', () => {
  const userId = 'user-threading-test-' + Date.now();
  let account1: any;
  let account2: any;
  let campaign: any;
  let lead: any;
  let campaignLead: any;

  beforeEach(async () => {
    // 1. Create 2 distinct email inboxes
    account1 = await dbService.upsertEmailAccount({
      user_id: userId,
      email_address: 'inbox1@company.com',
      sender_name: 'Alice from Company',
      provider: 'gmail',
      status: 'active',
      daily_limit: 10,
      min_interval_minutes: 15,
      encrypted_access_token: 'mock-token-inbox-1',
      encrypted_refresh_token: 'mock-refresh-inbox-1',
    });

    account2 = await dbService.upsertEmailAccount({
      user_id: userId,
      email_address: 'inbox2@company.com',
      sender_name: 'Bob from Company',
      provider: 'gmail',
      status: 'active',
      daily_limit: 10,
      min_interval_minutes: 15,
      encrypted_access_token: 'mock-token-inbox-2',
      encrypted_refresh_token: 'mock-refresh-inbox-2',
    });

    // 2. Create a campaign with follow-up steps
    campaign = await dbService.createCampaign(userId, {
      name: 'Threaded Outreach Campaign',
      business_context: 'B2B enterprise partnership outreach',
      ideal_customer_profile: 'VP of Partnerships',
      offer: 'Strategic co-marketing and integration',
      tone: 'Concise, direct, highly professional',
      call_to_action: '15-minute quick discovery call',
      initial_email_instructions: 'Keep it strictly under 100 words.',
      status: 'active',
      activated_at: new Date().toISOString(),
      followup_config: {
        max_followups: 2,
        steps: [
          { step: 1, delay_days: 3, instructions: 'Follow up politely on the previous idea' },
        ],
      },
      sending_config: {
        start_hour: 0,
        end_hour: 24,
        timezone: 'UTC',
        days: [0, 1, 2, 3, 4, 5, 6],
        daily_limit: 50,
        hourly_limit: 10,
      },
    });

    // 3. Create a lead and enroll in campaign
    const email = `prospect-${Date.now()}@targetcorp.com`;
    await dbService.insertLeads(userId, [
      {
        email,
        normalized_email: email,
        first_name: 'Jane',
        last_name: 'Doe',
        company: 'Target Corp',
        job_title: 'VP',
        website: 'https://targetcorp.com',
        notes: '',
        custom_fields: {},
        status: 'active',
        source_import: 'test',
      },
    ]);
    const { leads: fetchedLeads } = await dbService.getLeads(userId, { limit: 1 });
    lead = fetchedLeads[0];

    const enrolled = await dbService.enrollLeadsInCampaign(campaign.id, [lead.id]);
    expect(enrolled.enrolled).toBe(1);

    const leads = await dbService.getCampaignLeads(campaign.id);
    campaignLead = leads[0];
  });

  it('guarantees follow-up draft inherits email_account_id, thread_id, and Re: subject from step 0', async () => {
    // 1. Simulate Step 0 already sent via account 1
    const step0 = await dbService.createOrUpdateMessage({
      campaign_lead_id: campaignLead.id,
      step_number: 0,
      subject: 'Partnership discussion with Target Corp',
      body_text: 'Hi Jane, wanted to connect regarding partnership opportunities.',
      status: 'sent',
      email_account_id: account1.id,
      gmail_message_id: 'mock_msg_initial_123',
      gmail_thread_id: 'thread_xyz_987',
      sent_at: new Date(Date.now() - 3600000).toISOString(),
    });

    expect(step0.status).toBe('sent');
    expect(step0.email_account_id).toBe(account1.id);
    expect(step0.gmail_thread_id).toBe('thread_xyz_987');

    // 2. Run handleGenerateEmailJob for step 1
    await handleGenerateEmailJob({ campaignLeadId: campaignLead.id, stepNumber: 1 });

    // 3. Verify step 1 message
    const step1 = await dbService.getMessageByLeadAndStep(campaignLead.id, 1);
    expect(step1).toBeDefined();
    expect(step1?.step_number).toBe(1);
    expect(step1?.subject).toBe('Re: Partnership discussion with Target Corp');
    expect(step1?.email_account_id).toBe(account1.id);
    expect(step1?.gmail_thread_id).toBe('thread_xyz_987');
  });

  it('sends follow-up using the EXACT same email account ID and thread ID as step 0 even when other accounts are available', async () => {
    // 1. Step 0 was sent via Account 1 with thread_xyz_987
    await dbService.createOrUpdateMessage({
      campaign_lead_id: campaignLead.id,
      step_number: 0,
      subject: 'Quick question for Jane',
      body_text: 'Original email body',
      status: 'sent',
      email_account_id: account1.id,
      gmail_message_id: 'msg_initial_abc',
      gmail_thread_id: 'thread_xyz_987',
      sent_at: new Date(Date.now() - 3600000).toISOString(),
    });

    // Make account 2 look "fresher" by giving account 1 some send history
    account1.sent_today = 1;
    account2.sent_today = 0;

    // 2. Create follow-up message (step 1)
    const step1Draft = await dbService.createOrUpdateMessage({
      campaign_lead_id: campaignLead.id,
      step_number: 1,
      subject: 'Re: Quick question for Jane',
      body_text: 'Just following up on my previous note.',
      status: 'scheduled',
      scheduled_at: new Date().toISOString(),
      email_account_id: account1.id,
      gmail_thread_id: 'thread_xyz_987',
    });

    // 3. Execute sending of the follow-up email
    await handleSendEmailJob({ emailMessageId: step1Draft.id }, true);

    // 4. Verify the sent follow-up
    const step1Sent = await dbService.getMessage(step1Draft.id);
    expect(step1Sent?.status).toBe('sent');
    // MUST BE ACCOUNT 1 (NOT ACCOUNT 2)
    expect(step1Sent?.email_account_id).toBe(account1.id);
    // MUST BE ON SAME THREAD
    expect(step1Sent?.gmail_thread_id).toBe('thread_xyz_987');
    // MUST HAVE Re: SUBJECT
    expect(step1Sent?.subject).toBe('Re: Quick question for Jane');
  });

  it('aborts sending follow-up if initial step 0 was never sent', async () => {
    // Step 0 was drafted or cancelled, NOT sent
    await dbService.createOrUpdateMessage({
      campaign_lead_id: campaignLead.id,
      step_number: 0,
      subject: 'Draft that never went out',
      body_text: 'Draft body',
      status: 'cancelled',
      scheduled_at: new Date().toISOString(),
    });

    const step1Draft = await dbService.createOrUpdateMessage({
      campaign_lead_id: campaignLead.id,
      step_number: 1,
      subject: 'Re: Draft that never went out',
      body_text: 'Following up on nothing',
      status: 'scheduled',
      scheduled_at: new Date().toISOString(),
    });

    // Attempting to send follow-up should cancel it gracefully
    await handleSendEmailJob({ emailMessageId: step1Draft.id }, true);

    const step1After = await dbService.getMessage(step1Draft.id);
    expect(step1After?.status).toBe('cancelled');
  });

  it('reschedules follow-up for the original account rather than switching inboxes when in cooldown', async () => {
    // Step 0 sent via account 1
    await dbService.createOrUpdateMessage({
      campaign_lead_id: campaignLead.id,
      step_number: 0,
      subject: 'Hello Jane',
      body_text: 'Initial outreach',
      status: 'sent',
      email_account_id: account1.id,
      gmail_message_id: 'msg_initial_111',
      gmail_thread_id: 'thread_111',
      sent_at: new Date(Date.now() - 3600000).toISOString(),
    });

    // Account 1 just sent another email 2 minutes ago (interval is 15 mins)
    account1.last_sent_at = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await dbService.updateEmailAccount(account1.id, {
      last_sent_at: account1.last_sent_at,
    });

    const step1Draft = await dbService.createOrUpdateMessage({
      campaign_lead_id: campaignLead.id,
      step_number: 1,
      subject: 'Re: Hello Jane',
      body_text: 'Following up',
      status: 'scheduled',
      scheduled_at: new Date().toISOString(),
      email_account_id: account1.id,
      gmail_thread_id: 'thread_111',
    });

    // Execute send (without force, testing interval rate limit)
    await handleSendEmailJob({ emailMessageId: step1Draft.id }, false);

    const step1Rescheduled = await dbService.getMessage(step1Draft.id);
    expect(step1Rescheduled?.status).toBe('scheduled');
    // Must remain locked to account1
    expect(step1Rescheduled?.email_account_id).toBe(account1.id);
    // Scheduled time must be delayed into the future for account 1
    const scheduledTime = new Date(step1Rescheduled!.scheduled_at!).getTime();
    expect(scheduledTime).toBeGreaterThan(Date.now());
  });

  it('gracefully falls back to available campaign inbox and auto-repairs step 0 if initial outreach email is missing email_account_id', async () => {
    // 1. Step 0 was sent prior to multi-account tracking, so email_account_id is null
    const step0 = await dbService.createOrUpdateMessage({
      campaign_lead_id: campaignLead.id,
      step_number: 0,
      subject: 'Legacy outreach email',
      body_text: 'Sent before multi-account tracking',
      status: 'sent',
      email_account_id: null,
      gmail_message_id: 'legacy_msg_101',
      gmail_thread_id: 'legacy_thread_101',
      sent_at: new Date(Date.now() - 86400000).toISOString(),
    });
    expect(step0.email_account_id).toBeNull();

    // 2. Step 1 is scheduled with null email_account_id
    const step1 = await dbService.createOrUpdateMessage({
      campaign_lead_id: campaignLead.id,
      step_number: 1,
      subject: 'Re: Legacy outreach email',
      body_text: 'Following up on legacy outreach',
      status: 'scheduled',
      scheduled_at: new Date().toISOString(),
      email_account_id: null,
      gmail_thread_id: 'legacy_thread_101',
    });

    // 3. Executing send should NOT throw 'Initial outreach email missing email_account_id'
    // Instead it falls back to an available campaign account, sends successfully, and repairs step 0
    await handleSendEmailJob({ emailMessageId: step1.id }, true);

    const step1Sent = await dbService.getMessage(step1.id);
    expect(step1Sent?.status).toBe('sent');
    expect(step1Sent?.email_account_id).toBeTruthy();
    expect([account1.id, account2.id]).toContain(step1Sent?.email_account_id);

    // Verify step 0 was repaired
    const step0Repaired = await dbService.getMessageByLeadAndStep(campaignLead.id, 0);
    expect(step0Repaired?.email_account_id).toBe(step1Sent?.email_account_id);
  });
});

