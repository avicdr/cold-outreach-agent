import { describe, it, expect, beforeEach } from 'vitest';
import { verifySmtp, sendSmtpEmail } from '@/lib/smtp/client';
import { dbService } from '@/lib/db-service';
import { handleSendEmailJob } from '@/lib/queue/worker';
import { encryptToken } from '@/lib/crypto';
import crypto from 'crypto';

describe('SMTP & Titan Integration', () => {
  const userId = 'user-titan-test-' + Date.now();

  it('verifies SMTP credentials in test/mock mode', async () => {
    const result = await verifySmtp({
      host: 'smtp.titan.email',
      port: 465,
      secure: true,
      user: 'test@mycompany.com',
      pass: 'mock-password-123',
    });

    expect(result.success).toBe(true);
  });

  it('dispatches emails via sendSmtpEmail with headers and unsubscribe link', async () => {
    const sendResult = await sendSmtpEmail(
      {
        host: 'smtp.titan.email',
        port: 465,
        secure: true,
        user: 'founder@mycompany.com',
        pass: 'mock-pass',
      },
      {
        from: '"Founder" <founder@mycompany.com>',
        to: 'lead@target.com',
        subject: 'Quick question about your clinic',
        bodyText: 'Hi doctor, loved your website.',
        unsubscribeUrl: 'https://outreach.app/unsubscribe?token=abc',
      }
    );

    expect(sendResult).toHaveProperty('id');
    expect(sendResult).toHaveProperty('threadId');
    expect(sendResult.id).toContain('titan.email');
  });

  it('stores and retrieves a GoDaddy Titan SMTP account correctly in dbService', async () => {
    const account = await dbService.upsertEmailAccount({
      user_id: userId,
      email_address: 'outreach@mytitandomain.com',
      sender_name: 'Dr. Titan',
      provider: 'smtp',
      daily_limit: 18,
      min_interval_minutes: 15,
      status: 'active',
      smtp_host: 'smtp.titan.email',
      smtp_port: 465,
      smtp_secure: true,
      smtp_username: 'outreach@mytitandomain.com',
      encrypted_smtp_password: encryptToken('TitanSecretPassword123!'),
      encrypted_access_token: encryptToken('TitanSecretPassword123!'),
      imap_host: 'imap.titan.email',
      imap_port: 993,
    });

    expect(account.id).toBeDefined();
    expect(account.provider).toBe('smtp');
    expect(account.smtp_host).toBe('smtp.titan.email');
    expect(account.smtp_port).toBe(465);

    const retrieved = await dbService.getEmailAccount(account.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.provider).toBe('smtp');
    expect(retrieved?.smtp_host).toBe('smtp.titan.email');
  });

  it('worker sends email job using Titan SMTP provider when configured', async () => {
    const workerUserId = 'user-titan-worker-' + Date.now() + '-' + Math.random().toString(36).substring(7);
    // 1. Setup account
    const emailAccount = await dbService.upsertEmailAccount({
      user_id: workerUserId,
      email_address: `sender-${Date.now()}@titanbusiness.com`,
      sender_name: 'Titan Outreach',
      provider: 'smtp',
      daily_limit: 18,
      min_interval_minutes: 15,
      status: 'active',
      smtp_host: 'smtp.titan.email',
      smtp_port: 465,
      smtp_secure: true,
      smtp_username: `sender-${Date.now()}@titanbusiness.com`,
      encrypted_smtp_password: encryptToken('mock-titan-pass'),
      encrypted_access_token: encryptToken('mock-titan-pass'),
    });

    // 2. Setup Campaign & Lead
    const campaign = await dbService.createCampaign(workerUserId, {
      name: 'Titan Clinic Outreach',
      business_context: 'Medical aesthetic marketing',
      ideal_customer_profile: 'Medspa owners',
      offer: 'Lead generation',
      tone: 'Concise, direct, highly professional',
      call_to_action: '15-minute quick discovery call',
      initial_email_instructions: 'Keep it strictly under 100 words.',
      status: 'active',
      activated_at: new Date().toISOString(),
      followup_config: { max_followups: 0, steps: [] },
      sending_config: {
        days: [0, 1, 2, 3, 4, 5, 6],
        start_hour: 0,
        end_hour: 24,
        timezone: 'UTC',
        daily_limit: 50,
        hourly_limit: 20,
      },
    });
    await dbService.updateCampaign(campaign.id, { status: 'active' });

    const leadRes = await dbService.insertLeads(workerUserId, [
      {
        email: `clinic-${Date.now()}@example.com`,
        normalized_email: `clinic-${Date.now()}@example.com`,
        first_name: 'Dr.',
        last_name: 'Roberts',
        company: 'Downtown Aesthetics',
        job_title: 'Owner',
        website: 'https://example.com',
        notes: '',
        custom_fields: {},
        status: 'active',
        source_import: 'test',
      },
    ]);

    const lead = (await dbService.getLeads(workerUserId, { limit: 1 })).leads[0];
    await dbService.enrollLeadsInCampaign(campaign.id, [lead.id]);
    const campaignLeads = await dbService.getCampaignLeads(campaign.id);
    const campaignLead = campaignLeads[0];

    const message = await dbService.createOrUpdateMessage({
      campaign_lead_id: campaignLead.id,
      step_number: 0,
      subject: 'Partnership Inquiry',
      body_text: 'Hi Dr. Roberts, would love to connect.',
      status: 'scheduled',
      scheduled_at: new Date(Date.now() - 1000).toISOString(),
    });

    // 3. Execute worker job
    await handleSendEmailJob({ emailMessageId: message.id }, true);

    // 4. Verify message sent
    const updatedMessage = await dbService.getMessage(message.id);
    expect(updatedMessage?.status).toBe('sent');
    expect(updatedMessage?.email_account_id).toBe(emailAccount.id);
    expect(updatedMessage?.gmail_message_id).toBeDefined();
    expect(updatedMessage?.sent_at).toBeDefined();
  });
});
