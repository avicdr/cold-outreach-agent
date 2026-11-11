import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyEmail, verifyEmailExists, verifyEmailBatch } from '@/lib/verification/reacher';
import { verifyLeadById, verifyLeadsBatch, verifyAllUnverifiedLeads } from '@/lib/verification/service';
import { dbService } from '@/lib/db-service';
import { handleSendEmailJob } from '@/lib/queue/worker';
import { Lead, Campaign, EmailAccount, EmailMessage } from '@/types/database';

describe('Simple Email Verification & Bounce Prevention Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Syntax & Rule Validation', () => {
    it('flags malformed or syntactically invalid emails as invalid', async () => {
      const invalidEmails = [
        'plainaddress',
        '@missingusername.com',
        'username@.com',
        'username@domain..com',
        'spaces in@email.com',
        '',
      ];

      for (const email of invalidEmails) {
        const result = await verifyEmail(email, { skipCache: true });
        expect(result.is_reachable).toBe('invalid');
        expect(result.syntax.is_valid_syntax).toBe(false);

        const existsCheck = await verifyEmailExists(email);
        expect(existsCheck.valid).toBe(false);
      }
    });

    it('validates correct RFC email syntax', async () => {
      const result = await verifyEmail('test.founder@gmail.com', { skipCache: true });
      expect(result.syntax.is_valid_syntax).toBe(true);
      expect(result.syntax.domain).toBe('gmail.com');
      expect(result.syntax.username).toBe('test.founder');
    });
  });

  describe('2. Disposable Email Detection', () => {
    it('detects and flags disposable temporary email addresses as invalid', async () => {
      const disposableEmails = [
        'scam@mailinator.com',
        'temp@guerrillamail.com',
        'user@tempmail.com',
        'burn@10minutemail.com',
        'anon@yopmail.com',
      ];

      for (const email of disposableEmails) {
        const result = await verifyEmail(email, { skipCache: true });
        expect(result.is_reachable).toBe('invalid');
        expect(result.misc.is_disposable).toBe(true);
        expect(result.error).toContain('Disposable');
      }
    });
  });

  describe('3. DNS MX Record Deliverability', () => {
    it('validates real domain with MX records (e.g. google.com)', async () => {
      const result = await verifyEmail('contact@google.com', { skipCache: true });
      expect(result.mx.accepts_mail).toBe(true);
      expect(result.mx.records.length).toBeGreaterThan(0);
      expect(result.is_reachable).not.toBe('invalid');

      const existsCheck = await verifyEmailExists('contact@google.com');
      expect(existsCheck.valid).toBe(true);
    });

    it('flags domains with nonexistent DNS or no MX records as invalid', async () => {
      const result = await verifyEmail('nobody@this-domain-surely-does-not-exist-99991823.xyz', {
        skipCache: true,
      });
      expect(result.is_reachable).toBe('invalid');
      expect(result.mx.accepts_mail).toBe(false);
      expect(result.error).toContain('(MX) records');

      const existsCheck = await verifyEmailExists('nobody@this-domain-surely-does-not-exist-99991823.xyz');
      expect(existsCheck.valid).toBe(false);
    });

    it('rejects domains with RFC 7505 Null MX record or missing mail exchange', async () => {
      // test with known null mx or domain with website but no MX
      const result = await verifyEmail('test@inlet.ai', { skipCache: true });
      expect(result.is_reachable).toBe('invalid');
      expect(result.mx.accepts_mail).toBe(false);
    });
  });

  describe('4. Batch Verification', () => {
    it('verifies multiple emails with controlled concurrency', async () => {
      const emails = [
        'user1@mailinator.com', // disposable -> invalid
        'invalid@@broken.com', // syntax -> invalid
        'info@google.com', // real MX -> safe
      ];

      const results = await verifyEmailBatch(emails, 3);
      expect(results.size).toBe(3);
      expect(results.get('user1@mailinator.com')?.is_reachable).toBe('invalid');
      expect(results.get('invalid@@broken.com')?.is_reachable).toBe('invalid');
      expect(results.get('info@google.com')?.mx.accepts_mail).toBe(true);
    });
  });

  describe('5. Lead Verification Service & Database Mutation', () => {
    it('verifies a lead, updates status, and prevents send for invalid addresses', async () => {
      const testUserId = 'test-verifier-user-1';

      // Insert test lead with disposable/invalid email
      const { inserted } = await dbService.insertLeads(testUserId, [
        {
          email: 'disposable_target@mailinator.com',
          normalized_email: 'disposable_target@mailinator.com',
          first_name: 'Fake',
          last_name: 'Lead',
          company: 'Spam Co',
          job_title: 'CEO',
          website: 'https://spam.local',
          notes: '',
          status: 'active',
          source_import: 'test',
          custom_fields: {},
        },
      ]);
      expect(inserted).toBe(1);

      const { leads } = await dbService.getLeads(testUserId, { search: 'disposable_target' });
      const targetLead = leads[0];
      expect(targetLead).toBeDefined();

      // Verify the lead
      const { lead: verifiedLead, result } = await verifyLeadById(targetLead.id);
      expect(result.is_reachable).toBe('invalid');
      expect(verifiedLead.verification_status).toBe('invalid');
      expect(verifiedLead.status).toBe('bounced');
      expect(verifiedLead.is_verified).toBe(true);

      // Verify lead is added to global suppression list
      const suppressions = await dbService.getSuppressedNormalizedEmails(testUserId);
      expect(suppressions.has('disposable_target@mailinator.com')).toBe(true);
    });
  });

  describe('6. Worker Pre-Flight Bounce Prevention Interceptor', () => {
    it('intercepts undeliverable lead in worker before sending, marks bounced, and cancels message', async () => {
      const testUserId = 'worker-bounce-protect-user';

      // 1. Create active sender account
      const senderAccount: EmailAccount = {
        id: `acc-bounce-${Date.now()}`,
        user_id: testUserId,
        provider: 'smtp',
        email_address: 'sender@mycompany.com',
        daily_limit: 50,
        min_interval_minutes: 0,
        status: 'active',
        encrypted_access_token: 'secret',
        encrypted_refresh_token: 'refresh',
        token_expires_at: null,
        granted_scopes: [],
        last_sync_at: null,
        connected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await dbService.upsertEmailAccount(senderAccount);

      // 2. Create campaign
      const campaign = await dbService.createCampaign(testUserId, {
        name: 'PreFlight Bounce Protection Campaign',
        user_id: testUserId,
        email_account_id: senderAccount.id,
        followup_config: { max_followups: 0, steps: [] },
        sending_config: {
          days: [0, 1, 2, 3, 4, 5, 6],
          start_hour: 0,
          end_hour: 23,
          timezone: 'UTC',
          daily_limit: 100,
        },
        status: 'active',
      } as any);

      // 3. Create lead with disposable/dead email
      await dbService.insertLeads(testUserId, [
        {
          email: 'bouncing_target@mailinator.com',
          normalized_email: 'bouncing_target@mailinator.com',
          first_name: 'John',
          last_name: 'Bounce',
          company: 'NonExistent Corp',
          job_title: 'Owner',
          website: 'https://none.test',
          notes: '',
          status: 'active',
          source_import: 'bounce_test',
          custom_fields: {},
        },
      ]);
      const { leads } = await dbService.getLeads(testUserId, { search: 'bouncing_target' });
      const deadLead = leads[0];

      // 4. Enroll lead in campaign
      await dbService.enrollLeadsInCampaign(campaign.id, [deadLead.id]);
      const campaignLeads = await dbService.getCampaignLeads(campaign.id);
      const cl = campaignLeads[0];

      // 5. Create scheduled message
      const msg = await dbService.createOrUpdateMessage({
        campaign_lead_id: cl.id,
        step_number: 0,
        subject: 'Quick check',
        body_text: 'Hello!',
        status: 'scheduled',
        scheduled_at: new Date().toISOString(),
      });

      // 6. Execute handleSendEmailJob
      await handleSendEmailJob({ emailMessageId: msg.id }, true);

      // 7. Verify that message was CANCELLED and NOT sent
      const updatedMsg = await dbService.getMessage(msg.id);
      expect(updatedMsg?.status).toBe('cancelled');

      // 8. Verify that dead lead was flagged as bounced and suppressed
      const updatedLead = await dbService.getLead(deadLead.id);
      expect(updatedLead?.status).toBe('bounced');
      expect(updatedLead?.verification_status).toBe('invalid');

      const suppressions = await dbService.getSuppressedNormalizedEmails(testUserId);
      expect(suppressions.has('bouncing_target@mailinator.com')).toBe(true);

      // 9. Verify sender account sent_today was NOT incremented (sender inbox untouched!)
      const accountAfter = await dbService.getEmailAccount(senderAccount.id);
      expect(accountAfter?.sent_today || 0).toBe(0);
    });
  });
});
