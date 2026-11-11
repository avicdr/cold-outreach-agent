import { dbService } from '../db-service';
import { verifyEmail } from './reacher';
import { Lead, EmailVerificationResult, EmailVerificationStatus } from '@/types/database';

export interface BatchVerificationSummary {
  total: number;
  valid: number;
  risky: number;
  invalid: number;
  suppressedBounces: number;
  leads: Array<{
    id: string;
    email: string;
    company: string;
    status: EmailVerificationStatus;
    error?: string;
  }>;
}

/**
 * Verify a single lead by its ID and persist the result in the database.
 * If the email is determined to be invalid (undeliverable/bounced),
 * the lead is automatically marked bounced, added to suppression, and any scheduled messages are cancelled.
 */
export async function verifyLeadById(leadId: string): Promise<{ lead: Lead; result: EmailVerificationResult }> {
  const lead = await dbService.getLead(leadId);
  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  const result = await verifyEmail(lead.email);
  const isInvalid = result.is_reachable === 'invalid';
  const verificationStatus: EmailVerificationStatus = isInvalid
    ? 'invalid'
    : result.is_reachable === 'risky'
    ? 'risky'
    : 'valid';

  const updates: Partial<Lead> = {
    is_verified: true,
    verification_status: verificationStatus,
    verification_details: result,
    verified_at: new Date().toISOString(),
  };

  if (isInvalid) {
    updates.status = 'bounced';

    // 1. Add to suppression list to permanently prevent outgoing emails
    try {
      await dbService.addSuppression(lead.user_id, lead.normalized_email, 'bounce', 'email_verification');
    } catch (suppErr) {
      console.warn(`[Verification] Could not add suppression for ${lead.email}:`, suppErr);
    }

    // 2. Cancel any pending or scheduled messages for this lead
    try {
      const messages = await dbService.getMessages();
      const leadMessages = messages.filter((m) => {
        const cl = (m as any).campaign_lead;
        return cl?.lead_id === lead.id || (m as any).lead?.id === lead.id;
      });

      for (const msg of leadMessages) {
        if (msg.status === 'scheduled' || msg.status === 'draft') {
          msg.status = 'cancelled';
          await dbService.createOrUpdateMessage(msg);
        }
      }
    } catch (cancelErr) {
      console.warn(`[Verification] Could not cancel messages for invalid lead ${lead.email}:`, cancelErr);
    }

    // 3. Log activity
    try {
      await dbService.logActivity(lead.user_id, 'email_bounce_prevented', 'leads', lead.id, {
        email: lead.email,
        company: lead.company,
        reason: result.error || 'Recipient mailbox does not exist or domain has no valid MX records',
      });
    } catch {
      // Safe ignore
    }
  }

  const updatedLead = await dbService.updateLead(lead.id, updates);
  return { lead: updatedLead, result };
}

/**
 * Verify a list of lead IDs in parallel batches.
 */
export async function verifyLeadsBatch(leadIds: string[], concurrency = 4): Promise<BatchVerificationSummary> {
  const summary: BatchVerificationSummary = {
    total: leadIds.length,
    valid: 0,
    risky: 0,
    invalid: 0,
    suppressedBounces: 0,
    leads: [],
  };

  for (let i = 0; i < leadIds.length; i += concurrency) {
    const chunk = leadIds.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map((id) => verifyLeadById(id)));

    for (let j = 0; j < settled.length; j++) {
      const item = settled[j];
      const leadId = chunk[j];

      if (item.status === 'fulfilled') {
        const { lead, result } = item.value;
        const vStatus = lead.verification_status || 'valid';

        if (vStatus === 'valid') summary.valid++;
        else if (vStatus === 'risky') summary.risky++;
        else if (vStatus === 'invalid') {
          summary.invalid++;
          summary.suppressedBounces++;
        }

        summary.leads.push({
          id: lead.id,
          email: lead.email,
          company: lead.company,
          status: vStatus,
          error: result.error,
        });
      } else {
        summary.leads.push({
          id: leadId,
          email: '',
          company: '',
          status: 'invalid',
          error: String(item.reason),
        });
      }
    }
  }

  return summary;
}

/**
 * Bulk verify all unverified leads for a user, optionally filtered by group or campaign.
 */
export async function verifyAllUnverifiedLeads(
  userId: string,
  options?: { groupId?: string; campaignId?: string; limit?: number }
): Promise<BatchVerificationSummary> {
  const maxLimit = options?.limit || 500;
  let targetLeadIds: string[] = [];

  if (options?.campaignId) {
    const campaignLeads = await dbService.getCampaignLeads(options.campaignId);
    targetLeadIds = campaignLeads
      .map((cl) => cl.lead_id)
      .filter(Boolean);
  } else {
    const { leads } = await dbService.getLeads(userId, {
      groupId: options?.groupId,
      limit: maxLimit,
    });
    // Target leads that are unverified or have unknown status
    targetLeadIds = leads
      .filter((l) => !l.is_verified || l.verification_status === 'unverified' || !l.verification_status)
      .map((l) => l.id);
  }

  return verifyLeadsBatch(targetLeadIds.slice(0, maxLimit));
}

