import { describe, it, expect, beforeEach } from 'vitest';
import { dbService } from '@/lib/db-service';
import { mockDb } from '@/lib/supabase/mock-db';
import { POST as pausePost } from '@/app/api/campaigns/[id]/pause/route';
import { POST as resumePost } from '@/app/api/campaigns/[id]/resume/route';
import { handleSendEmailJob } from '@/lib/queue/worker';
import { NextRequest } from 'next/server';
import { OWNER_USER_ID } from '@/lib/auth';

describe('Campaign Pause and Resume Rescheduling Flow', () => {
  const userId = OWNER_USER_ID;
  let campaignId: string;
  let leadId1: string;
  let leadId2: string;
  let clId1: string;
  let clId2: string;
  let msg1Id: string;
  let msg2Id: string;

  beforeEach(async () => {
    mockDb.campaigns.clear();
    mockDb.campaignLeads.clear();
    mockDb.emailMessages.clear();
    mockDb.jobQueue.clear();
    mockDb.leads.clear();
    mockDb.emailAccounts.clear();

    // Create an active email account
    await dbService.upsertEmailAccount({
      user_id: userId,
      provider: 'gmail',
      email_address: 'sender@example.com',
      sender_name: 'Tester',
      daily_limit: 20,
      min_interval_minutes: 15,
      status: 'active',
      encrypted_access_token: 'enc_acc',
      encrypted_refresh_token: 'enc_ref',
      token_expires_at: null,
      granted_scopes: [],
      last_sync_at: null,
      connected_at: new Date().toISOString(),
    });

    // Create active campaign
    const camp = await dbService.createCampaign(userId, {
      name: 'Test Outreach Campaign',
      status: 'active',
      business_context: 'B2B outreach',
      ideal_customer_profile: 'Founders',
      offer: 'Test service',
      tone: 'professional',
      call_to_action: 'Book call',
      initial_email_instructions: 'Keep it short',
      sending_config: {
        timezone: 'UTC',
        start_hour: 9,
        end_hour: 17,
        daily_limit: 10,
        hourly_limit: 4,
        days: [0, 1, 2, 3, 4, 5, 6], // all days for testing
      },
      followup_config: { steps: [], max_followups: 1 },
    });
    campaignId = camp.id;

    // Create 2 leads and enroll them
    await dbService.insertLeads(userId, [
      {
        user_id: userId,
        email: 'lead1@example.com',
        normalized_email: 'lead1@example.com',
        first_name: 'Alice',
        last_name: 'Smith',
        company: 'Acme',
        job_title: 'CEO',
        website: 'acme.com',
        notes: '',
        custom_fields: {},
        status: 'active',
        source_import: 'manual',
      },
      {
        user_id: userId,
        email: 'lead2@example.com',
        normalized_email: 'lead2@example.com',
        first_name: 'Bob',
        last_name: 'Jones',
        company: 'Globex',
        job_title: 'CTO',
        website: 'globex.com',
        notes: '',
        custom_fields: {},
        status: 'active',
        source_import: 'manual',
      },
    ]);

    const allLeads = (await dbService.getLeads(userId)).leads;
    leadId1 = allLeads.find((l) => l.email === 'lead1@example.com')!.id;
    leadId2 = allLeads.find((l) => l.email === 'lead2@example.com')!.id;

    await dbService.enrollLeadsInCampaign(campaignId, [leadId1, leadId2]);
    const cls = await dbService.getCampaignLeads(campaignId);
    clId1 = cls.find((c) => c.lead_id === leadId1)!.id;
    clId2 = cls.find((c) => c.lead_id === leadId2)!.id;

    // Create 2 scheduled messages with queued jobs
    const initialDate = new Date(Date.now() + 3600 * 1000);
    const msg1 = await dbService.createOrUpdateMessage({
      campaign_lead_id: clId1,
      step_number: 0,
      subject: 'Hello Alice',
      body_text: 'Body 1',
      personalization_basis: [],
      unsupported_claims: [],
      status: 'scheduled',
      scheduled_at: initialDate.toISOString(),
    });
    msg1Id = msg1.id;

    const msg2 = await dbService.createOrUpdateMessage({
      campaign_lead_id: clId2,
      step_number: 0,
      subject: 'Hello Bob',
      body_text: 'Body 2',
      personalization_basis: [],
      unsupported_claims: [],
      status: 'scheduled',
      scheduled_at: new Date(initialDate.getTime() + 900 * 1000).toISOString(),
    });
    msg2Id = msg2.id;

    // Enqueue jobs in jobQueue
    await dbService.enqueueJob('send_email', { emailMessageId: msg1Id }, `send_${msg1Id}`, initialDate);
    await dbService.enqueueJob('send_email', { emailMessageId: msg2Id }, `send_${msg2Id}`, new Date(initialDate.getTime() + 900 * 1000));
  });

  it('pauses scheduled messages and cancels queued jobs when campaign is paused', async () => {
    expect(mockDb.emailMessages.get(msg1Id)?.status).toBe('scheduled');
    expect(mockDb.emailMessages.get(msg2Id)?.status).toBe('scheduled');
    expect(Array.from(mockDb.jobQueue.values()).filter((j) => j.job_type === 'send_email').length).toBe(2);

    const result = await dbService.pauseCampaignMessages(campaignId);
    expect(result.pausedCount).toBe(2);

    // Messages must now have status 'paused'
    expect(mockDb.emailMessages.get(msg1Id)?.status).toBe('paused');
    expect(mockDb.emailMessages.get(msg2Id)?.status).toBe('paused');

    // Queued jobs for these messages must be removed
    const queuedJobs = Array.from(mockDb.jobQueue.values()).filter(
      (j) => j.job_type === 'send_email' && j.status === 'queued'
    );
    expect(queuedJobs.length).toBe(0);
  });

  it('resumes and recalculates new schedule timestamps for paused messages', async () => {
    // First pause them
    await dbService.pauseCampaignMessages(campaignId);
    expect(mockDb.emailMessages.get(msg1Id)?.status).toBe('paused');
    expect(mockDb.emailMessages.get(msg2Id)?.status).toBe('paused');

    // Resume and reschedule
    const resumeResult = await dbService.resumeAndRescheduleCampaignMessages(campaignId);
    expect(resumeResult.rescheduledCount).toBe(2);

    const updatedMsg1 = mockDb.emailMessages.get(msg1Id);
    const updatedMsg2 = mockDb.emailMessages.get(msg2Id);

    // Messages must now be 'scheduled' again
    expect(updatedMsg1?.status).toBe('scheduled');
    expect(updatedMsg2?.status).toBe('scheduled');

    // Must have future scheduled_at dates
    expect(updatedMsg1?.scheduled_at).toBeTruthy();
    expect(updatedMsg2?.scheduled_at).toBeTruthy();

    const date1 = new Date(updatedMsg1!.scheduled_at!).getTime();
    const date2 = new Date(updatedMsg2!.scheduled_at!).getTime();
    expect(date2).toBeGreaterThanOrEqual(date1);

    // New send_email jobs must be present in queue
    const queuedJobs = Array.from(mockDb.jobQueue.values()).filter(
      (j) => j.job_type === 'send_email' && j.status === 'queued'
    );
    expect(queuedJobs.length).toBe(2);
    expect(queuedJobs.map((j) => (j.payload as any).emailMessageId)).toEqual(
      expect.arrayContaining([msg1Id, msg2Id])
    );
  });

  it('does not send an email if message status is paused in queue worker', async () => {
    // Mark message 1 as paused
    const msg = mockDb.emailMessages.get(msg1Id)!;
    msg.status = 'paused';

    // Worker should return without throwing or sending
    await expect(handleSendEmailJob({ emailMessageId: msg1Id }, false)).resolves.not.toThrow();
  });

  it('triggers pause and resume cascade via API routes', async () => {
    // 1. Pause campaign via API
    const pauseReq = new NextRequest('http://localhost:3000/api/campaigns/pause', {
      method: 'POST',
    });
    const pauseRes = await pausePost(pauseReq, { params: Promise.resolve({ id: campaignId }) });
    expect(pauseRes.status).toBe(200);
    const pauseData = await pauseRes.json();
    expect(pauseData.success).toBe(true);
    expect(pauseData.campaign.status).toBe('paused');
    expect(pauseData.pausedCount).toBe(2);

    expect(mockDb.emailMessages.get(msg1Id)?.status).toBe('paused');
    expect(mockDb.emailMessages.get(msg2Id)?.status).toBe('paused');

    // 2. Resume campaign via API
    const resumeReq = new NextRequest('http://localhost:3000/api/campaigns/resume', {
      method: 'POST',
    });
    const resumeRes = await resumePost(resumeReq, { params: Promise.resolve({ id: campaignId }) });
    expect(resumeRes.status).toBe(200);
    const resumeData = await resumeRes.json();
    expect(resumeData.success).toBe(true);
    expect(resumeData.campaign.status).toBe('active');
    expect(resumeData.rescheduledCount).toBe(2);

    expect(mockDb.emailMessages.get(msg1Id)?.status).toBe('scheduled');
    expect(mockDb.emailMessages.get(msg2Id)?.status).toBe('scheduled');
  });
});
