import { describe, it, expect, beforeEach } from 'vitest';
import { dbService } from '@/lib/db-service';
import { mockDb } from '@/lib/supabase/mock-db';
import { reconcileScheduledJobs } from '@/lib/queue/worker';

describe('Self-Healing Queue Reconciler', () => {
  const userId = 'reconcile-test-user';

  beforeEach(() => {
    mockDb.campaigns.clear();
    mockDb.leads.clear();
    mockDb.campaignLeads.clear();
    mockDb.emailMessages.clear();
    mockDb.jobQueue.clear();
  });

  it('detects orphaned scheduled messages lacking active jobs and enqueues fresh jobs in valid window', async () => {
    // 1. Setup active campaign
    const campaign = await dbService.createCampaign(userId, {
      name: 'Reconcile Test Campaign',
      status: 'active',
      activated_at: new Date().toISOString(),
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
        days: [1, 2, 3, 4, 5],
        daily_limit: 10,
        hourly_limit: 5,
      },
      followup_config: { max_followups: 0, steps: [] },
    });

    // 2. Insert lead and campaign lead
    await dbService.insertLeads(userId, [
      {
        email: 'lead1@company.com',
        normalized_email: 'lead1@company.com',
        first_name: 'John',
        last_name: 'Smith',
        company: 'Smith Inc',
        job_title: 'CEO',
        website: 'https://company.com',
        notes: '',
        source_import: 'test',
        status: 'active',
        custom_fields: {},
      },
    ]);
    const lead = (await dbService.getLeads(userId, { limit: 1 })).leads[0];
    await dbService.enrollLeadsInCampaign(campaign.id, [lead.id]);
    const cls = await dbService.getCampaignLeads(campaign.id);

    // 3. Create scheduled message whose job was somehow lost / never queued
    const msg = await dbService.createOrUpdateMessage({
      campaign_lead_id: cls[0].id,
      step_number: 0,
      subject: 'Orphaned outreach email',
      body_text: 'Hello John',
      status: 'scheduled',
      scheduled_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // past date
    });

    // Ensure queue has 0 jobs for this message
    const initialJobs = Array.from(mockDb.jobQueue.values()).filter(
      (j) => j.job_type === 'send_email' && (j.payload as any)?.emailMessageId === msg.id
    );
    expect(initialJobs.length).toBe(0);

    // 4. Run reconciliation
    const result = await reconcileScheduledJobs();

    expect(result.checked).toBeGreaterThanOrEqual(1);
    expect(result.orphaned).toBe(1);
    expect(result.reconciled).toBe(1);
    expect(result.reconciledIds).toContain(msg.id);

    // 5. Verify that a send_email job was enqueued
    const repairedJobs = Array.from(mockDb.jobQueue.values()).filter(
      (j) => j.job_type === 'send_email' && (j.payload as any)?.emailMessageId === msg.id
    );
    expect(repairedJobs.length).toBe(1);
    expect(repairedJobs[0].status).toBe('queued');

    // 6. Verify that scheduled_at was updated to a future or valid date
    const updatedMsg = await dbService.getMessage(msg.id);
    expect(new Date(updatedMsg!.scheduled_at!).getTime()).toBeGreaterThan(Date.now() - 60000);

    // 7. Second run should detect 0 orphans
    const secondResult = await reconcileScheduledJobs();
    expect(secondResult.orphaned).toBe(0);
    expect(secondResult.reconciled).toBe(0);
  });

  it('marks orphaned messages as paused if the parent campaign is paused', async () => {
    // 1. Setup paused campaign
    const campaign = await dbService.createCampaign(userId, {
      name: 'Paused Campaign',
      status: 'paused',
      activated_at: null,
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
        days: [1, 2, 3, 4, 5],
        daily_limit: 10,
        hourly_limit: 5,
      },
      followup_config: { max_followups: 0, steps: [] },
    });

    await dbService.insertLeads(userId, [
      {
        email: 'paused_lead@company.com',
        normalized_email: 'paused_lead@company.com',
        first_name: 'Bob',
        last_name: 'Jones',
        company: 'Jones LLC',
        job_title: 'Manager',
        website: 'https://company.com',
        notes: '',
        source_import: 'test',
        status: 'active',
        custom_fields: {},
      },
    ]);
    const lead = (await dbService.getLeads(userId, { limit: 1 })).leads[0];
    await dbService.enrollLeadsInCampaign(campaign.id, [lead.id]);
    const cls = await dbService.getCampaignLeads(campaign.id);

    const msg = await dbService.createOrUpdateMessage({
      campaign_lead_id: cls[0].id,
      step_number: 0,
      subject: 'Paused outreach email',
      body_text: 'Hello Bob',
      status: 'scheduled',
      scheduled_at: new Date().toISOString(),
    });

    const result = await reconcileScheduledJobs();
    expect(result.orphaned).toBe(1);
    expect(result.reconciled).toBe(0); // not enqueued because campaign is paused

    const updatedMsg = await dbService.getMessage(msg.id);
    expect(updatedMsg?.status).toBe('paused');
  });
});
