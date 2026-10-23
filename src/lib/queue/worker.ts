import crypto from 'crypto';
import { dbService } from '../db-service';
import { generateInitialEmail, generateFollowupEmail, classifyReply } from '../gemini';
import { sendGmailMessage, pollGmailReplies } from '../gmail/client';
import { refreshAccessToken } from '../gmail/oauth';
import { encryptToken, decryptToken } from '../crypto';
import { generateUnsubscribeToken } from '../unsubscribe-token';
import { env } from '../env';
import { JobQueueItem, SendingConfig, Campaign, Lead } from '@/types/database';
import {
  isWithinSendingWindow,
  getNextSendingWindowDate,
  calculateStaggeredSchedule,
  getTimezoneParts,
  createDateInTimezone,
} from '../scheduler';

export {
  isWithinSendingWindow,
  getNextSendingWindowDate,
  calculateStaggeredSchedule,
  getTimezoneParts,
  createDateInTimezone,
};

/**
 * Process a batch of jobs atomically from the job queue.
 */
export async function processJobQueueBatch(workerId: string = 'worker-main', batchSize = 10, force = false) {
  const jobs = await dbService.claimJobs(workerId, batchSize, 300, force);
  const results: { jobId: string; type: string; status: 'completed' | 'failed'; error?: string }[] = [];

  for (const job of jobs) {
    try {
      await processSingleJob(job, force);
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
async function processSingleJob(job: JobQueueItem, force = false) {
  switch (job.job_type) {
    case 'generate_email':
      await handleGenerateEmailJob(job.payload as { campaignLeadId: string; stepNumber?: number });
      break;

    case 'send_email':
      await handleSendEmailJob(job.payload as { emailMessageId: string }, force);
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

    case 'process_warmup':
      await handleProcessWarmupJob(job.payload as { userId: string });
      break;

    case 'process_discovery':
      await handleProcessDiscoveryJob(job.payload as { jobId: string; provider?: string });
      break;

    case 'cleanup_expired_jobs':
      // Periodic cleanup of completed jobs
      break;

    default:
      throw new Error(`Unsupported job type: ${job.job_type}`);
  }
}

export async function handleProcessDiscoveryJob(payload: { jobId: string; provider?: string }) {
  const { executeDiscoveryJob } = await import('../discovery/service');
  return executeDiscoveryJob(payload.jobId, payload.provider);
}

export async function handleProcessWarmupJob(payload: { userId: string }) {
  const { runWarmupCycle } = await import('../warmup/service');
  return runWarmupCycle(payload.userId);
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
      subject: draft.subject || 'Quick question',
      body_text: draft.body || '',
      personalization_basis: draft.personalization_basis || [],
      unsupported_claims: draft.unsupported_claims || [],
      status: 'draft',
      scheduled_at: new Date().toISOString(),
    });

    // Enqueue sending job if campaign is active
    if (campaign.status === 'active') {
      const scheduledDate = getNextSendingWindowDate(campaign.sending_config, new Date());
      await dbService.createOrUpdateMessage({
        id: msg.id,
        campaign_lead_id: campaignLeadId,
        step_number: 0,
        status: 'scheduled',
        scheduled_at: scheduledDate.toISOString(),
      });
      await dbService.enqueueJob(
        'send_email',
        { emailMessageId: msg.id },
        `send_msg_${msg.id}`,
        scheduledDate
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
      subject: draft.subject || (prevMsg?.subject ? `Re: ${prevMsg.subject.replace(/^Re:\s*/i, '')}` : 'Re: Quick follow up'),
      body_text: draft.body || '',
      personalization_basis: draft.personalization_basis || [],
      unsupported_claims: draft.unsupported_claims || [],
      status: 'draft',
      scheduled_at: new Date().toISOString(),
    });

    if (campaign.status === 'active') {
      const scheduledDate = getNextSendingWindowDate(campaign.sending_config, new Date());
      await dbService.createOrUpdateMessage({
        id: msg.id,
        campaign_lead_id: campaignLeadId,
        step_number: stepNumber,
        status: 'scheduled',
        scheduled_at: scheduledDate.toISOString(),
      });
      await dbService.enqueueJob(
        'send_email',
        { emailMessageId: msg.id },
        `send_msg_${msg.id}`,
        scheduledDate
      );
    }
  }
}

/**
 * 2. Send Email with strict pre-flight checks and Gmail API
 */
export async function handleSendEmailJob(payload: { emailMessageId: string }, force = false) {
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
  if (!force && !isWithinSendingWindow(campaign.sending_config)) {
    const nextWindow = getNextSendingWindowDate(campaign.sending_config, new Date());
    console.info(`[Window] Outside sending window for campaign ${campaign.id}. Rescheduling send to ${nextWindow.toISOString()}`);
    await dbService.createOrUpdateMessage({
      ...message,
      status: 'scheduled',
      scheduled_at: nextWindow.toISOString(),
    });
    await dbService.enqueueJob('send_email', { emailMessageId }, `retry_win_${emailMessageId}_${nextWindow.getTime()}`, nextWindow);
    return;
  }

  // Pre-flight check: Campaign-level daily & hourly limits
  if (campaign.sending_config) {
    const campStats = await dbService.getCampaignSendStats(campaign.id, campaign.sending_config);

    // 1. Campaign daily limit
    const campDailyLimit = campaign.sending_config.daily_limit;
    if (campDailyLimit && campStats.sentToday >= campDailyLimit) {
      const tomorrowInTz = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const nextDayWindow = getNextSendingWindowDate(campaign.sending_config, tomorrowInTz);
      console.info(`[RateLimit] Campaign ${campaign.id} daily limit (${campDailyLimit}) reached (${campStats.sentToday} sent today). Rescheduling send to ${nextDayWindow.toISOString()}`);
      await dbService.createOrUpdateMessage({
        ...message,
        status: 'scheduled',
        scheduled_at: nextDayWindow.toISOString(),
      });
      await dbService.enqueueJob('send_email', { emailMessageId }, `resched_camp_limit_${emailMessageId}_${nextDayWindow.getTime()}`, nextDayWindow);
      return;
    }

    // 2. Campaign hourly limit
    const campHourlyLimit = campaign.sending_config.hourly_limit;
    if (campHourlyLimit && campStats.sentPastHour >= campHourlyLimit) {
      const throttleExit = new Date(campStats.earliestHourSendMs + 60 * 60 * 1000 + 2000);
      console.info(`[RateLimit] Campaign ${campaign.id} hourly limit (${campHourlyLimit}) reached (${campStats.sentPastHour} sent in past hour). Rescheduling send to ${throttleExit.toISOString()}`);
      await dbService.createOrUpdateMessage({
        ...message,
        status: 'scheduled',
        scheduled_at: throttleExit.toISOString(),
      });
      await dbService.enqueueJob('send_email', { emailMessageId }, `resched_camp_hourly_${emailMessageId}_${throttleExit.getTime()}`, throttleExit);
      return;
    }
  }

  // Pre-flight check: Account availability, rotation & daily/interval rate limit guards
  const accountResult = await dbService.getAvailableEmailAccountForCampaign(campaign);

  if (accountResult.status === 'no_accounts') {
    throw new Error(accountResult.error);
  }

  if (accountResult.status === 'daily_limit_reached') {
    console.info(`[RateLimit] Daily limit reached for accounts in campaign ${campaign.id}. Rescheduling send to ${accountResult.rescheduleAt.toISOString()}`);
    await dbService.createOrUpdateMessage({
      ...message,
      status: 'scheduled',
      scheduled_at: accountResult.rescheduleAt.toISOString(),
    });
    await dbService.enqueueJob('send_email', { emailMessageId }, `resched_limit_${emailMessageId}_${accountResult.rescheduleAt.getTime()}`, accountResult.rescheduleAt);
    return;
  }

  if (accountResult.status === 'cooldown') {
    console.info(`[RateLimit] Accounts in cooldown (interval safety guard). Rescheduling send for inbox ${accountResult.accountEmail} to ${accountResult.rescheduleAt.toISOString()}`);
    await dbService.createOrUpdateMessage({
      ...message,
      status: 'scheduled',
      scheduled_at: accountResult.rescheduleAt.toISOString(),
    });
    await dbService.enqueueJob('send_email', { emailMessageId }, `resched_cooldown_${emailMessageId}_${accountResult.rescheduleAt.getTime()}`, accountResult.rescheduleAt);
    return;
  }

  const emailAccount = accountResult.account;

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
        encrypted_access_token: accessToken.startsWith('mock-') ? accessToken : encryptToken(accessToken),
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

  // Execute Send (with 401 auto-refresh retry)
  let sendResult;
  try {
    sendResult = await sendGmailMessage(accessToken, {
      from: emailAccount.email_address,
      to: lead.email,
      subject: message.subject,
      bodyText: message.body_text,
      unsubscribeUrl,
      threadId: message.gmail_thread_id || undefined,
    });
  } catch (sendErr: unknown) {
    const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
    if (emailAccount.encrypted_refresh_token && (errMsg.includes('401') || errMsg.includes('invalid_grant'))) {
      try {
        const refreshToken = decryptToken(emailAccount.encrypted_refresh_token);
        const refreshed = await refreshAccessToken(refreshToken);
        accessToken = refreshed.access_token;
        await dbService.upsertEmailAccount({
          ...emailAccount,
          encrypted_access_token: accessToken.startsWith('mock-') ? accessToken : encryptToken(accessToken),
          token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        });
        sendResult = await sendGmailMessage(accessToken, {
          from: emailAccount.email_address,
          to: lead.email,
          subject: message.subject,
          bodyText: message.body_text,
          unsubscribeUrl,
          threadId: message.gmail_thread_id || undefined,
        });
      } catch {
        throw sendErr;
      }
    } else {
      throw sendErr;
    }
  }

  // Confirmed success: update records
  message.status = 'sent';
  message.email_account_id = emailAccount.id;
  message.gmail_message_id = sendResult.id;
  message.gmail_thread_id = sendResult.threadId;
  message.sent_at = new Date().toISOString();
  await dbService.createOrUpdateMessage(message);
  await dbService.recordAccountSend(emailAccount.id);

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
  const emailAccounts = await dbService.getEmailAccounts(userId, { status: 'active' });
  if (emailAccounts.length === 0) return;

  const messages = await dbService.getMessages();
  const sentThreads = messages
    .filter((m) => m.status === 'sent' && m.gmail_thread_id)
    .map((m) => m.gmail_thread_id as string);
  if (sentThreads.length === 0) return;

  for (const emailAccount of emailAccounts) {
    let accessToken = '';
    try {
      accessToken = decryptToken(emailAccount.encrypted_access_token);
    } catch {
      accessToken = emailAccount.encrypted_access_token;
    }

    if (emailAccount.token_expires_at && new Date(emailAccount.token_expires_at) < new Date()) {
      try {
        const refreshToken = decryptToken(emailAccount.encrypted_refresh_token);
        const refreshed = await refreshAccessToken(refreshToken);
        accessToken = refreshed.access_token;
        await dbService.upsertEmailAccount({
          ...emailAccount,
          encrypted_access_token: accessToken.startsWith('mock-') ? accessToken : encryptToken(accessToken),
          token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        });
      } catch (err) {
        console.warn(`Failed to refresh token during sync replies for ${emailAccount.email_address}:`, err);
      }
    }

    let inboundReplies = [];
    try {
      inboundReplies = await pollGmailReplies(accessToken, sentThreads);
    } catch (syncErr: unknown) {
      const errMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
      if (emailAccount.encrypted_refresh_token && (errMsg.includes('401') || errMsg.includes('invalid_grant'))) {
        try {
          const refreshToken = decryptToken(emailAccount.encrypted_refresh_token);
          const refreshed = await refreshAccessToken(refreshToken);
          accessToken = refreshed.access_token;
          await dbService.upsertEmailAccount({
            ...emailAccount,
            encrypted_access_token: accessToken.startsWith('mock-') ? accessToken : encryptToken(accessToken),
            token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          });
          inboundReplies = await pollGmailReplies(accessToken, sentThreads);
        } catch {
          continue;
        }
      } else {
        continue;
      }
    }

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
