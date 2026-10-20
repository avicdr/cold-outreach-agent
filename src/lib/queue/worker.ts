import crypto from 'crypto';
import { dbService } from '../db-service';
import { generateInitialEmail, generateFollowupEmail, classifyReply } from '../gemini';
import { sendGmailMessage, pollGmailReplies } from '../gmail/client';
import { refreshAccessToken } from '../gmail/oauth';
import { decryptToken } from '../crypto';
import { generateUnsubscribeToken } from '../unsubscribe-token';
import { env } from '../env';
import { JobQueueItem, SendingConfig, Campaign, Lead } from '@/types/database';

/**
 * Checks if current time is within campaign sending window (days and hours in configured timezone).
 */
export function isWithinSendingWindow(sendingConfig: SendingConfig, date: Date = new Date()): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: sendingConfig.timezone || env.DEFAULT_TIMEZONE,
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const weekdayStr = parts.find((p) => p.type === 'weekday')?.value;
    const hourStr = parts.find((p) => p.type === 'hour')?.value;

    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    const currentDay = weekdayStr ? dayMap[weekdayStr] : date.getUTCDay();
    const currentHour = hourStr ? parseInt(hourStr, 10) : date.getUTCHours();

    const allowedDays = sendingConfig.days || [1, 2, 3, 4, 5];
    if (!allowedDays.includes(currentDay)) {
      return false;
    }

    const startHour = sendingConfig.start_hour ?? 9;
    const endHour = sendingConfig.end_hour ?? 17;

    return currentHour >= startHour && currentHour < endHour;
  } catch {
    // If timezone parsing fails, fall back to true
    return true;
  }
}

/**
 * Process a batch of jobs atomically from the job queue.
 */
export async function processJobQueueBatch(workerId: string = 'worker-main', batchSize = 10) {
  const jobs = await dbService.claimJobs(workerId, batchSize);
  const results: { jobId: string; type: string; status: 'completed' | 'failed'; error?: string }[] = [];

  for (const job of jobs) {
    try {
      await processSingleJob(job);
      await dbService.completeJob(job.id);
      results.push({ jobId: job.id, type: job.job_type, status: 'completed' });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Error processing job ${job.id} (${job.job_type}):`, errorMsg);
      await dbService.failJob(job.id, errorMsg);
      results.push({ jobId: job.id, type: job.job_type, status: 'failed', error: errorMsg });
    }
  }

  return { claimed: jobs.length, results };
}

/**
 * Handles individual job routing.
 */
async function processSingleJob(job: JobQueueItem) {
  switch (job.job_type) {
    case 'generate_email':
      await handleGenerateEmailJob(job.payload as { campaignLeadId: string; stepNumber?: number });
      break;

    case 'send_email':
      await handleSendEmailJob(job.payload as { emailMessageId: string });
      break;

    case 'schedule_followup':
      await handleScheduleFollowupJob(job.payload as { campaignLeadId: string; nextStepNumber: number; delayDays: number });
      break;

    case 'sync_replies':
      await handleSyncRepliesJob(job.payload as { userId: string });
      break;

    case 'process_unsubscribe':
      await handleProcessUnsubscribeJob(job.payload as { userId: string; normalizedEmail: string });
      break;

    case 'cleanup_expired_jobs':
      // Periodic cleanup of completed jobs
      break;

    default:
      throw new Error(`Unsupported job type: ${job.job_type}`);
  }
}

/**
 * 1. Generate Email Draft with Gemini
 */
export async function handleGenerateEmailJob(payload: { campaignLeadId: string; stepNumber?: number }) {
  const { campaignLeadId, stepNumber = 0 } = payload;

  const targetCl = await dbService.getCampaignLead(campaignLeadId);
  if (!targetCl) {
    throw new Error(`Cannot find lead enrollment ${campaignLeadId}`);
  }

  const campaign = await dbService.getCampaign(targetCl.campaign_id);
  if (!campaign) {
    throw new Error(`Cannot find campaign for enrollment ${campaignLeadId}`);
  }

  const lead = targetCl.lead || (await dbService.getLead(targetCl.lead_id));
  if (!lead) {
    throw new Error(`Cannot find lead for enrollment ${campaignLeadId}`);
  }

  const profile = await dbService.getProfile(campaign.user_id);

  if (stepNumber === 0) {
    const draft = await generateInitialEmail({
      lead,
      campaign,
      senderName: profile.sender_name || 'Outreach Team',
    });

    const msg = await dbService.createOrUpdateMessage({
      campaign_lead_id: campaignLeadId,
      step_number: 0,
      subject: draft.subject,
      body_text: draft.body,
      personalization_basis: draft.personalization_basis,
      unsupported_claims: draft.unsupported_claims,
      status: 'draft',
      scheduled_at: new Date().toISOString(),
    });

    // Enqueue sending job if campaign is active
    if (campaign.status === 'active') {
      await dbService.createOrUpdateMessage({
        id: msg.id,
        campaign_lead_id: campaignLeadId,
        step_number: 0,
        status: 'scheduled',
      });
      await dbService.enqueueJob(
        'send_email',
        { emailMessageId: msg.id },
        `send_msg_${msg.id}`,
        new Date()
      );
    }
  } else {
    // Follow-up generation
    const stepConfig = campaign.followup_config.steps.find((s) => s.step === stepNumber);
    const prevMsg = await dbService.getMessageByLeadAndStep(campaignLeadId, stepNumber - 1);

    const draft = await generateFollowupEmail({
      lead,
      campaign,
      stepNumber,
      stepInstructions: stepConfig?.instructions || 'Polite check-in',
      previousSubject: prevMsg?.subject || 'Quick follow up',
      previousBody: prevMsg?.body_text || '',
      senderName: profile.sender_name || 'Outreach Team',
    });

    const msg = await dbService.createOrUpdateMessage({
      campaign_lead_id: campaignLeadId,
      step_number: stepNumber,
      subject: draft.subject,
      body_text: draft.body,
      personalization_basis: draft.personalization_basis,
      unsupported_claims: draft.unsupported_claims,
      status: 'draft',
      scheduled_at: new Date().toISOString(),
    });

    if (campaign.status === 'active') {
      await dbService.createOrUpdateMessage({
        id: msg.id,
        campaign_lead_id: campaignLeadId,
        step_number: stepNumber,
        status: 'scheduled',
      });
      await dbService.enqueueJob(
        'send_email',
        { emailMessageId: msg.id },
        `send_msg_${msg.id}`,
        new Date()
      );
    }
  }
}

/**
 * 2. Send Email with strict pre-flight checks and Gmail API
 */
export async function handleSendEmailJob(payload: { emailMessageId: string }) {
  const { emailMessageId } = payload;
  const message = await dbService.getMessage(emailMessageId);
  if (!message) {
    throw new Error(`Message not found: ${emailMessageId}`);
  }

  // Already sent check
  if (message.status === 'sent') {
    return;
  }

  const campaignLead = (message as any).campaign_lead || (await dbService.getCampaignLead(message.campaign_lead_id));
  if (!campaignLead) {
    throw new Error(`CampaignLead not found: ${message.campaign_lead_id}`);
  }

  const campaign = await dbService.getCampaign(campaignLead.campaign_id);
  if (!campaign) throw new Error('Campaign not found');

  // Pre-flight check: Campaign active
  if (campaign.status !== 'active') {
    throw new Error(`Campaign is ${campaign.status}. Sending suspended.`);
  }

  const lead = campaignLead.lead || message.lead;
  if (!lead) throw new Error('Lead not found for message');

  // Pre-flight check: Lead eligibility
  if (lead.status === 'unsubscribed' || lead.status === 'replied' || lead.status === 'bounced') {
    message.status = 'cancelled';
    await dbService.createOrUpdateMessage(message);
    throw new Error(`Lead status is ${lead.status}. Cancelling send.`);
  }

  // Pre-flight check: Suppression list
  const suppressions = await dbService.getSuppressedNormalizedEmails(campaign.user_id);
  if (suppressions.has(lead.normalized_email)) {
    message.status = 'cancelled';
    await dbService.createOrUpdateMessage(message);
    throw new Error(`Lead ${lead.normalized_email} is on the suppression list.`);
  }

  // Pre-flight check: Sending window
  if (!isWithinSendingWindow(campaign.sending_config)) {
    // Re-schedule for 1 hour later
    const nextRun = new Date(Date.now() + 60 * 60 * 1000);
    await dbService.enqueueJob('send_email', { emailMessageId }, `retry_win_${emailMessageId}_${nextRun.getTime()}`, nextRun);
    return;
  }

  // Check email account
  const emailAccount = await dbService.getConnectedEmailAccount(campaign.user_id);
  if (!emailAccount) {
    throw new Error('No connected Gmail account found for user.');
  }

  // Decrypt token
  let accessToken = '';
  try {
    accessToken = decryptToken(emailAccount.encrypted_access_token);
  } catch {
    accessToken = emailAccount.encrypted_access_token; // Fallback for mock tokens
  }

  // Refresh if expired
  if (emailAccount.token_expires_at && new Date(emailAccount.token_expires_at) < new Date()) {
    try {
      const refreshToken = decryptToken(emailAccount.encrypted_refresh_token);
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      await dbService.upsertEmailAccount({
        ...emailAccount,
        encrypted_access_token: accessToken.startsWith('mock-') ? accessToken : decryptToken(accessToken), // or re-encrypt
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      });
    } catch (err) {
      console.warn('Failed to refresh token, proceeding with existing:', err);
    }
  }

  // Generate signed unsubscribe URL
  const unsubscribeToken = generateUnsubscribeToken({
    userId: campaign.user_id,
    leadId: lead.id,
    normalizedEmail: lead.normalized_email,
    campaignId: campaign.id,
  });
  const unsubscribeUrl = `${env.NEXT_PUBLIC_APP_URL}/unsubscribe?token=${unsubscribeToken}`;

  // Execute Send
  const sendResult = await sendGmailMessage(accessToken, {
    from: emailAccount.email_address,
    to: lead.email,
    subject: message.subject,
    bodyText: message.body_text,
    unsubscribeUrl,
    threadId: message.gmail_thread_id || undefined,
  });

  // Confirmed success: update records
  message.status = 'sent';
  message.gmail_message_id = sendResult.id;
  message.gmail_thread_id = sendResult.threadId;
  message.sent_at = new Date().toISOString();
  await dbService.createOrUpdateMessage(message);

  lead.status = 'contacted';
  await dbService.updateLead(lead.id, { status: 'contacted' });

  campaignLead.status = 'in_progress';
  campaignLead.current_step = message.step_number;
  await dbService.updateCampaign(campaign.id, {});

  // Schedule follow-up if applicable
  const nextStepNum = message.step_number + 1;
  const maxFollowups = campaign.followup_config.max_followups ?? env.DEFAULT_MAX_FOLLOWUPS;
  const nextStepConfig = campaign.followup_config.steps.find((s) => s.step === nextStepNum);

  if (nextStepNum <= maxFollowups && nextStepConfig) {
    const delayDays = nextStepConfig.delay_days || 4;
    const runAt = new Date(Date.now() + delayDays * 86400000);
    await dbService.enqueueJob(
      'schedule_followup',
      { campaignLeadId: campaignLead.id, nextStepNumber: nextStepNum, delayDays },
      `followup_${campaignLead.id}_${nextStepNum}`,
      runAt
    );
  }
}

/**
 * 3. Schedule Follow-up
 */
export async function handleScheduleFollowupJob(payload: { campaignLeadId: string; nextStepNumber: number; delayDays: number }) {
  const { campaignLeadId, nextStepNumber } = payload;
  const cl = await dbService.getCampaignLead(campaignLeadId);
  if (!cl) return;

  // Abort if replied or unsubscribed
  if (cl.status === 'replied' || cl.status === 'unsubscribed' || cl.status === 'completed') {
    return;
  }

  // Enqueue generation for next step
  await dbService.enqueueJob(
    'generate_email',
    { campaignLeadId, stepNumber: nextStepNumber },
    `gen_step_${campaignLeadId}_${nextStepNumber}`,
    new Date()
  );
}

/**
 * 4. Sync Inbound Replies & Classify
 */
export async function handleSyncRepliesJob(payload: { userId: string }) {
  const { userId } = payload;
  const emailAccount = await dbService.getConnectedEmailAccount(userId);
  if (!emailAccount) return;

  let accessToken = '';
  try {
    accessToken = decryptToken(emailAccount.encrypted_access_token);
  } catch {
    accessToken = emailAccount.encrypted_access_token;
  }

  const messages = await dbService.getMessages();
  const sentThreads = messages
    .filter((m) => m.status === 'sent' && m.gmail_thread_id)
    .map((m) => m.gmail_thread_id as string);

  const inboundReplies = await pollGmailReplies(accessToken, sentThreads);

  for (const reply of inboundReplies) {
    const matchedMessage = messages.find((m) => m.gmail_thread_id === reply.threadId);
    const classification = await classifyReply(reply.bodyText);

    await dbService.recordReply({
      user_id: userId,
      email_message_id: matchedMessage?.id || null,
      gmail_message_id: reply.id,
      gmail_thread_id: reply.threadId,
      sender_email: reply.senderEmail,
      received_at: reply.receivedAt,
      classification: classification.classification,
      classification_summary: classification.summary,
    });

    if (matchedMessage && matchedMessage.lead) {
      if (classification.is_explicit_unsubscribe || classification.classification === 'unsubscribe') {
        await dbService.addSuppression(userId, matchedMessage.lead.normalized_email, 'unsubscribe', 'reply_detection');
      } else {
        await dbService.updateLead(matchedMessage.lead.id, { status: 'replied' });
      }
    }
  }
}

/**
 * 5. Process Unsubscribe
 */
export async function handleProcessUnsubscribeJob(payload: { userId: string; normalizedEmail: string }) {
  const { userId, normalizedEmail } = payload;
  await dbService.addSuppression(userId, normalizedEmail, 'unsubscribe', 'public_endpoint');

  // Cancel any scheduled messages
  const messages = await dbService.getMessages({ status: 'scheduled' });
  for (const msg of messages) {
    if (msg.lead?.normalized_email === normalizedEmail) {
      msg.status = 'cancelled';
      await dbService.createOrUpdateMessage(msg);
    }
  }
}
