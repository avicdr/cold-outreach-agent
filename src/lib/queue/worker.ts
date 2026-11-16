import crypto from 'crypto';
import { dbService, isLiveSupabase } from '../db-service';
import { generateInitialEmail, generateFollowupEmail, classifyReply } from '../gemini';
import { sendGmailMessage, pollGmailReplies } from '../gmail/client';
import { sendSmtpEmail } from '../smtp/client';
import { executeWithGmailAuth } from '../gmail/tokens';
import { encryptToken, decryptToken } from '../crypto';
import { generateUnsubscribeToken } from '../unsubscribe-token';
import { env } from '../env';
import { JobQueueItem, SendingConfig, Campaign, Lead, EmailAccount } from '@/types/database';
import {
  isWithinSendingWindow,
  getNextSendingWindowDate,
  calculateStaggeredSchedule,
  getNextScheduledSlot,
  getTimezoneParts,
  createDateInTimezone,
} from '../scheduler';

export {
  isWithinSendingWindow,
  getNextSendingWindowDate,
  calculateStaggeredSchedule,
  getNextScheduledSlot,
  getTimezoneParts,
  createDateInTimezone,
};

export interface ProcessBatchResult {
  claimed: number;
  processed: number;
  remainingClaimedReleased: number;
  results: { jobId: string; type: string; status: 'completed' | 'failed'; error?: string }[];
  durationMs: number;
  timedOut: boolean;
}

async function withTimeoutThrow<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Process a batch of jobs atomically from the job queue with strict time budgeting.
 */
export async function processJobQueueBatch(
  workerId: string = 'worker-main',
  batchSize = 5,
  force = false,
  maxDurationMs = 20000
): Promise<ProcessBatchResult> {
  const startTime = Date.now();
  const jobs = await dbService.claimJobs(workerId, batchSize, 300, force);
  const results: { jobId: string; type: string; status: 'completed' | 'failed'; error?: string }[] = [];
  const processedJobIds = new Set<string>();
  let timedOut = false;

  for (const job of jobs) {
    const elapsed = Date.now() - startTime;
    const remainingBudget = maxDurationMs - elapsed;
    if (remainingBudget <= 3500) {
      console.info(`[WorkerBatch] Time budget of ${maxDurationMs}ms reached. Halting batch early.`);
      timedOut = true;
      break;
    }

    try {
      const singleJobTimeout = Math.max(2000, Math.min(18000, remainingBudget - 2000));
      await withTimeoutThrow(
        processSingleJob(job, force),
        singleJobTimeout,
        `Job ${job.id} (${job.job_type}) exceeded execution time budget of ${singleJobTimeout}ms`
      );
      await dbService.completeJob(job.id);
      processedJobIds.add(job.id);
      results.push({ jobId: job.id, type: job.job_type, status: 'completed' });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Error processing job ${job.id} (${job.job_type}):`, errorMsg);
      await dbService.failJob(job.id, errorMsg);
      processedJobIds.add(job.id);
      results.push({ jobId: job.id, type: job.job_type, status: 'failed', error: errorMsg });
    }
  }

  // Release any claimed jobs that were not executed due to time budget limit
  const unexecutedJobIds = jobs.map((j) => j.id).filter((id) => !processedJobIds.has(id));
  if (unexecutedJobIds.length > 0) {
    try {
      await dbService.releaseJobs(unexecutedJobIds);
    } catch (relErr) {
      console.warn('[WorkerBatch] Could not release unexecuted jobs:', relErr);
    }
  }

  return {
    claimed: jobs.length,
    processed: results.length,
    remainingClaimedReleased: unexecutedJobIds.length,
    results,
    durationMs: Date.now() - startTime,
    timedOut,
  };
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

    case 'generate_ig_dm': {
      const { handleGenerateIgDmJob } = await import('../instagram/worker');
      await handleGenerateIgDmJob(job.payload as { campaignLeadId: string; stepNumber?: number });
      break;
    }

    case 'send_ig_dm': {
      const { handleSendIgDmJob } = await import('../instagram/worker');
      await handleSendIgDmJob(job.payload as { instagramMessageId: string }, force);
      break;
    }

    case 'schedule_ig_followup': {
      const { handleScheduleIgFollowupJob } = await import('../instagram/worker');
      await handleScheduleIgFollowupJob(
        job.payload as { campaignLeadId: string; nextStepNumber: number; delayDays: number }
      );
      break;
    }

    case 'sync_ig_replies': {
      const { handleSyncIgRepliesJob } = await import('../instagram/worker');
      await handleSyncIgRepliesJob(job.payload as { userId: string });
      break;
    }

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
      let emailAccounts = await dbService.getEmailAccounts(campaign.user_id, { status: 'active' });
      if (campaign.email_account_id) {
        const filtered = emailAccounts.filter((a) => a.id === campaign.email_account_id);
        if (filtered.length > 0) emailAccounts = filtered;
      } else if (campaign.account_group_id) {
        const filtered = emailAccounts.filter((a) => a.group_id === campaign.account_group_id);
        if (filtered.length > 0) emailAccounts = filtered;
      }
      const lastScheduled = await dbService.getLatestScheduledDateForCampaign(campaign.id);
      const scheduledDate = getNextScheduledSlot(
        campaign,
        emailAccounts,
        lastScheduled,
        new Date()
      );
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
    const initialMsg = await dbService.getMessageByLeadAndStep(campaignLeadId, 0);

    // Guarantee threaded subject format: "Re: <originalSubject>"
    const originalSubject = initialMsg?.subject || prevMsg?.subject || 'Quick follow up';
    const cleanSubject = originalSubject.replace(/^Re:\s*/i, '').trim();
    const threadedSubject = `Re: ${cleanSubject}`;

    const draft = await generateFollowupEmail({
      lead,
      campaign,
      stepNumber,
      stepInstructions: stepConfig?.instructions || 'Polite check-in',
      previousSubject: threadedSubject,
      previousBody: prevMsg?.body_text || '',
      senderName: profile.sender_name || 'Outreach Team',
    });

    // Enforce that follow-ups inherit the same email account and thread from the initial send
    let emailAccountId = initialMsg?.email_account_id || prevMsg?.email_account_id || null;
    const gmailThreadId = initialMsg?.gmail_thread_id || prevMsg?.gmail_thread_id || null;

    if (!emailAccountId) {
      try {
        const accountResult = await dbService.getAvailableEmailAccountForCampaign(campaign);
        if (accountResult.status === 'available') {
          emailAccountId = accountResult.account.id;
        } else {
          const accounts = await dbService.getEmailAccounts(campaign.user_id, { status: 'active' });
          if (accounts.length > 0) {
            emailAccountId = accounts[0].id;
          }
        }
        if (emailAccountId && initialMsg && !initialMsg.email_account_id) {
          await dbService.createOrUpdateMessage({
            ...initialMsg,
            email_account_id: emailAccountId,
          });
        }
      } catch {
        // Safe fallback
      }
    }

    const msg = await dbService.createOrUpdateMessage({
      campaign_lead_id: campaignLeadId,
      step_number: stepNumber,
      subject: threadedSubject,
      body_text: draft.body || '',
      personalization_basis: draft.personalization_basis || [],
      unsupported_claims: draft.unsupported_claims || [],
      status: 'draft',
      email_account_id: emailAccountId,
      gmail_thread_id: gmailThreadId,
      scheduled_at: new Date().toISOString(),
    });

    if (campaign.status === 'active') {
      const scheduledDate = getNextSendingWindowDate(campaign.sending_config, new Date());
      await dbService.createOrUpdateMessage({
        id: msg.id,
        campaign_lead_id: campaignLeadId,
        step_number: stepNumber,
        status: 'scheduled',
        email_account_id: emailAccountId,
        gmail_thread_id: gmailThreadId,
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

  // Already sent or paused check
  if (message.status === 'sent' || message.status === 'paused') {
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
    console.info(`[PreFlight] Lead status is ${lead.status}. Cancelling send for message ${emailMessageId}.`);
    return;
  }

  // Pre-flight check: Suppression list
  const suppressions = await dbService.getSuppressedNormalizedEmails(campaign.user_id);
  if (suppressions.has(lead.normalized_email)) {
    message.status = 'cancelled';
    await dbService.createOrUpdateMessage(message);
    console.info(`[PreFlight] Lead ${lead.normalized_email} is on suppression list. Cancelling send for message ${emailMessageId}.`);
    return;
  }

  // Pre-flight check: Email verification & bounce prevention
  if (lead.email && (isLiveSupabase() || lead.email.includes('mailinator.com') || lead.email.includes('bouncing_target'))) {
    const { verifyEmail } = await import('../verification/reacher');
    const vResult = await verifyEmail(lead.email);
    if (vResult.is_reachable === 'invalid') {
      message.status = 'cancelled';
      await dbService.createOrUpdateMessage(message);
      await dbService.updateLead(lead.id, {
        status: 'bounced',
        verification_status: 'invalid',
        verification_details: vResult,
        is_verified: true,
      });
      await dbService.addSuppression(
        campaign.user_id,
        lead.normalized_email || lead.email.toLowerCase().trim(),
        'bounce',
        'preflight_verification'
      );
      // Cancel any remaining scheduled messages for this lead
      try {
        const scheduledMsgs = await dbService.getMessages({ status: 'scheduled' });
        for (const msg of scheduledMsgs) {
          if (msg.campaign_lead_id === message.campaign_lead_id && msg.id !== message.id) {
            msg.status = 'cancelled';
            await dbService.createOrUpdateMessage(msg);
          }
        }
      } catch (cancelErr) {
        console.warn(`[PreFlight] Could not cancel remaining messages for ${lead.email}:`, cancelErr);
      }
      await dbService.logActivity(campaign.user_id, 'email_bounce_prevented', 'leads', lead.id, {
        email: lead.email,
        campaign_id: campaign.id,
        reason: vResult.error || 'Recipient mailbox does not exist or has no valid MX records',
      });
      console.warn(`[PreFlight] Lead ${lead.email} failed email verification (${vResult.error || 'undeliverable'}). Prevented bounce and cancelled message ${emailMessageId}.`);
      return;
    }
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
    const windowHours = Math.max(1, (campaign.sending_config.end_hour ?? 17) - (campaign.sending_config.start_hour ?? 9));
    const minRequiredHourly = Math.ceil((campaign.sending_config.daily_limit || 10) / windowHours);
    const effectiveHourlyLimit = Math.max(campHourlyLimit || 0, minRequiredHourly);
    if (effectiveHourlyLimit > 0 && campStats.sentPastHour >= effectiveHourlyLimit) {
      const throttleExit = new Date(campStats.earliestHourSendMs + 60 * 60 * 1000 + 2000);
      console.info(`[RateLimit] Campaign ${campaign.id} hourly limit (${effectiveHourlyLimit}) reached (${campStats.sentPastHour} sent in past hour). Rescheduling send to ${throttleExit.toISOString()}`);
      await dbService.createOrUpdateMessage({
        ...message,
        status: 'scheduled',
        scheduled_at: throttleExit.toISOString(),
      });
      await dbService.enqueueJob('send_email', { emailMessageId }, `resched_camp_hourly_${emailMessageId}_${throttleExit.getTime()}`, throttleExit);
      return;
    }
  }

  // Account selection & Threading setup
  let emailAccount: EmailAccount;
  let targetThreadId: string | undefined = message.gmail_thread_id || undefined;
  let inReplyToMessageId: string | undefined = undefined;

  if (message.step_number > 0) {
    // 1. Follow-up: Resolve initial (step 0) and preceding step messages
    const initialMsg = await dbService.getMessageByLeadAndStep(message.campaign_lead_id, 0);
    const prevMsg = message.step_number > 1
      ? await dbService.getMessageByLeadAndStep(message.campaign_lead_id, message.step_number - 1)
      : initialMsg;

    // Safety guard: Preceding email must have actually been sent
    if ((!prevMsg || prevMsg.status !== 'sent') && (!initialMsg || initialMsg.status !== 'sent')) {
      message.status = 'cancelled';
      await dbService.createOrUpdateMessage(message);
      console.warn(
        `[PreFlight] Preceding email for follow-up message ${emailMessageId} (step ${message.step_number}) was not sent. Cancelling follow-up.`
      );
      return;
    }

    // 2. Lock to the SAME thread as initial email
    targetThreadId = message.gmail_thread_id || prevMsg?.gmail_thread_id || initialMsg?.gmail_thread_id || undefined;
    inReplyToMessageId = prevMsg?.gmail_message_id || initialMsg?.gmail_message_id || undefined;

    // Guarantee threaded subject "Re: <originalSubject>"
    const originalSubject = initialMsg?.subject || prevMsg?.subject || message.subject;
    const cleanSubject = originalSubject.replace(/^Re:\s*/i, '').trim();
    message.subject = `Re: ${cleanSubject}`;

    // 3. Lock to the SAME email account ID that sent the initial email
    const originalAccountId = message.email_account_id || initialMsg?.email_account_id || prevMsg?.email_account_id;
    let origAccount: EmailAccount | null = null;

    if (originalAccountId) {
      origAccount = await dbService.getEmailAccount(originalAccountId);
    }

    if (!origAccount) {
      // Fallback: If initial outreach message is missing email_account_id (e.g. sent prior to multi-account tracking)
      // or the original inbox was deleted/unlinked, gracefully resolve an available email account from the campaign
      console.warn(
        `[PreFlight] Original sender inbox (${originalAccountId || 'unknown'}) for follow-up message ${emailMessageId} not found or missing. Falling back to available account from campaign.`
      );
      const accountResult = await dbService.getAvailableEmailAccountForCampaign(campaign);
      if (accountResult.status === 'no_accounts') {
        throw new Error(accountResult.error);
      }
      if (accountResult.status === 'daily_limit_reached') {
        console.info(
          `[RateLimit] Daily limit reached for accounts in campaign ${campaign.id}. Rescheduling follow-up send to ${accountResult.rescheduleAt.toISOString()}`
        );
        await dbService.createOrUpdateMessage({
          ...message,
          status: 'scheduled',
          scheduled_at: accountResult.rescheduleAt.toISOString(),
        });
        await dbService.enqueueJob(
          'send_email',
          { emailMessageId },
          `resched_limit_${emailMessageId}_${accountResult.rescheduleAt.getTime()}`,
          accountResult.rescheduleAt
        );
        return;
      }
      if (accountResult.status === 'cooldown') {
        console.info(
          `[RateLimit] Accounts in cooldown. Rescheduling follow-up send for inbox ${accountResult.accountEmail} to ${accountResult.rescheduleAt.toISOString()}`
        );
        await dbService.createOrUpdateMessage({
          ...message,
          status: 'scheduled',
          scheduled_at: accountResult.rescheduleAt.toISOString(),
        });
        await dbService.enqueueJob(
          'send_email',
          { emailMessageId },
          `resched_cooldown_${emailMessageId}_${accountResult.rescheduleAt.getTime()}`,
          accountResult.rescheduleAt
        );
        return;
      }
      origAccount = accountResult.account;

      // Auto-repair step 0 & current message so subsequent follow-ups remain consistently locked
      if (initialMsg && !initialMsg.email_account_id) {
        try {
          await dbService.createOrUpdateMessage({
            ...initialMsg,
            email_account_id: origAccount.id,
          });
        } catch (repairErr) {
          console.warn(`[PreFlight] Could not backfill initial email_account_id:`, repairErr);
        }
      }
      message.email_account_id = origAccount.id;
    } else if (origAccount.status !== 'active') {
      // Check if user reconnected the same email address under a new account ID
      const userAccounts = await dbService.getEmailAccounts(campaign.user_id, { status: 'active' });
      const reconnectedAccount = userAccounts.find(
        (a) => a.email_address.toLowerCase() === origAccount!.email_address.toLowerCase()
      );
      if (reconnectedAccount) {
        origAccount = reconnectedAccount;
        message.email_account_id = origAccount.id;
      } else {
        throw new Error(
          `Original sending inbox ${origAccount.email_address} is currently ${origAccount.status}. Follow-up must be sent from the same ID/inbox to keep the conversation on the same thread. Please reactivate or reconnect ${origAccount.email_address}.`
        );
      }
    }

    // Rate-limit check specifically for the locked inbox
    const now = Date.now();
    const limit = origAccount.daily_limit || 18;
    const sentToday = origAccount.sent_today || 0;
    if (sentToday >= limit) {
      const tomorrowInTz = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const nextDayWindow = getNextSendingWindowDate(campaign.sending_config, tomorrowInTz);
      console.info(
        `[RateLimit] Daily limit reached for original inbox ${origAccount.email_address}. Rescheduling follow-up to ${nextDayWindow.toISOString()}`
      );
      await dbService.createOrUpdateMessage({
        ...message,
        status: 'scheduled',
        email_account_id: origAccount.id,
        gmail_thread_id: targetThreadId || null,
        scheduled_at: nextDayWindow.toISOString(),
      });
      await dbService.enqueueJob(
        'send_email',
        { emailMessageId },
        `resched_orig_limit_${emailMessageId}_${nextDayWindow.getTime()}`,
        nextDayWindow
      );
      return;
    }

    const intervalMs = (origAccount.min_interval_minutes || 15) * 60 * 1000;
    const lastSentTime = origAccount.last_sent_at ? new Date(origAccount.last_sent_at).getTime() : 0;
    const timeSinceLastSend = now - lastSentTime;
    if (lastSentTime > 0 && timeSinceLastSend < intervalMs) {
      const remainingCooldownMs = intervalMs - timeSinceLastSend;
      const rescheduleAt = new Date(now + remainingCooldownMs + 2000);
      console.info(
        `[RateLimit] Original inbox ${origAccount.email_address} in cooldown. Rescheduling follow-up to ${rescheduleAt.toISOString()}`
      );
      await dbService.createOrUpdateMessage({
        ...message,
        status: 'scheduled',
        email_account_id: origAccount.id,
        gmail_thread_id: targetThreadId || null,
        scheduled_at: rescheduleAt.toISOString(),
      });
      await dbService.enqueueJob(
        'send_email',
        { emailMessageId },
        `resched_orig_cooldown_${emailMessageId}_${rescheduleAt.getTime()}`,
        rescheduleAt
      );
      return;
    }

    emailAccount = origAccount;
  } else {
    // Step 0 Initial Outreach: Pre-flight check: Account availability, rotation & daily/interval rate limit guards
    let targetAccount: EmailAccount | null = null;
    if (message.email_account_id) {
      targetAccount = await dbService.getEmailAccount(message.email_account_id);
    }

    let accountResult:
      | { status: 'available'; account: EmailAccount }
      | { status: 'no_accounts'; error: string }
      | { status: 'daily_limit_reached'; rescheduleAt: Date }
      | { status: 'cooldown'; rescheduleAt: Date; accountEmail: string };

    if (targetAccount && targetAccount.status === 'active') {
      const limit = targetAccount.daily_limit || 18;
      const sentToday = targetAccount.sent_today || 0;
      if (sentToday >= limit) {
        const tomorrowInTz = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const nextWindow = getNextSendingWindowDate(campaign.sending_config, tomorrowInTz);
        accountResult = { status: 'daily_limit_reached', rescheduleAt: nextWindow };
      } else {
        const intervalMs = (targetAccount.min_interval_minutes || 15) * 60 * 1000;
        const lastSentTime = targetAccount.last_sent_at ? new Date(targetAccount.last_sent_at).getTime() : 0;
        const timeSinceLastSend = Date.now() - lastSentTime;
        if (lastSentTime > 0 && timeSinceLastSend < intervalMs) {
          const rescheduleAt = new Date(Date.now() + (intervalMs - timeSinceLastSend) + 2000);
          accountResult = {
            status: 'cooldown',
            rescheduleAt,
            accountEmail: targetAccount.email_address,
          };
        } else {
          accountResult = { status: 'available', account: targetAccount };
        }
      }
    } else {
      accountResult = await dbService.getAvailableEmailAccountForCampaign(campaign);
    }

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

    emailAccount = accountResult.account;
  }

  // Format RFC 2822 In-Reply-To header
  const formattedInReplyTo = inReplyToMessageId
    ? (inReplyToMessageId.startsWith('<') && inReplyToMessageId.endsWith('>')
        ? inReplyToMessageId
        : `<${inReplyToMessageId}>`)
    : undefined;

  // Check for resume or configured email attachment
  let attachments: { filename: string; contentType: string; contentBase64: string }[] | undefined = undefined;
  try {
    const fs = await import('fs');
    const path = await import('path');
    const candidateResumePaths = [
      (campaign as any).resume_path,
      (campaign as any).resume_attachment_path,
      'public/resume.pdf',
      'data/resume.pdf',
      'resume.pdf',
    ].filter(Boolean);

    for (const cPath of candidateResumePaths) {
      if (fs.existsSync(cPath)) {
        try {
          const fileBuf = fs.readFileSync(cPath);
          const baseName = path.basename(cPath);
          attachments = [
            {
              filename: baseName.toLowerCase().endsWith('.pdf') ? baseName : `${baseName}.pdf`,
              contentType: 'application/pdf',
              contentBase64: fileBuf.toString('base64'),
            },
          ];
          break;
        } catch (readErr) {
          console.warn(`[Send] Could not attach file from ${cPath}:`, readErr);
        }
      }
    }
  } catch (attErr) {
    console.warn('[Send] Attachment resolution skipped:', attErr);
  }

  // CAN-SPAM and RFC 8058 compliant unsubscribe headers
  let unsubscribeUrl: string | undefined = undefined;
  try {
    const unsubscribeToken = generateUnsubscribeToken({
      userId: campaign.user_id,
      leadId: lead.id,
      normalizedEmail: lead.normalized_email || lead.email.toLowerCase().trim(),
      campaignId: campaign.id,
    });
    const appBaseUrl = (env.NEXT_PUBLIC_APP_URL || 'https://outreacher.arenova.in').replace(/\/$/, '');
    unsubscribeUrl = `${appBaseUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  } catch (err) {
    console.warn('[Send] Failed to generate unsubscribe token:', err);
  }

  // Execute Send (via SMTP or Gmail OAuth with automatic inbox failover)
  let sendResult: { id: string; threadId: string };

  const executeSend = async (acc: EmailAccount) => {
    const accDisplay = acc.sender_name?.trim()
      ? `"${acc.sender_name.trim()}" <${acc.email_address}>`
      : acc.email_address;

    if (acc.provider === 'smtp') {
      let smtpPassword = '';
      try {
        smtpPassword = decryptToken(acc.encrypted_smtp_password || acc.encrypted_access_token);
      } catch {
        smtpPassword = acc.encrypted_smtp_password || acc.encrypted_access_token;
      }

      return await sendSmtpEmail(
        {
          host: acc.smtp_host || 'smtp.titan.email',
          port: acc.smtp_port || 465,
          secure: acc.smtp_secure ?? (acc.smtp_port === 465 || !acc.smtp_port),
          user: acc.smtp_username || acc.email_address,
          pass: smtpPassword,
        },
        {
          from: accDisplay,
          to: lead.email,
          subject: message.subject,
          bodyText: message.body_text,
          threadId: targetThreadId,
          inReplyToMessageId: formattedInReplyTo,
          references: formattedInReplyTo,
          attachments,
          unsubscribeUrl,
        }
      );
    } else {
      return await executeWithGmailAuth(acc, (token) =>
        sendGmailMessage(token, {
          from: accDisplay,
          to: lead.email,
          subject: message.subject,
          bodyText: message.body_text,
          threadId: targetThreadId,
          inReplyToMessageId: formattedInReplyTo,
          references: formattedInReplyTo,
          attachments,
          unsubscribeUrl,
        })
      );
    }
  };

  try {
    sendResult = await executeSend(emailAccount);
  } catch (sendErr: unknown) {
    const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
    const isAccountFatal =
      errMsg.includes('Mail service not enabled') ||
      errMsg.includes('FAILED_PRECONDITION') ||
      errMsg.includes('authentication failed') ||
      errMsg.includes('session has expired') ||
      errMsg.includes('revoked');

    if (isAccountFatal) {
      console.warn(`[SendFailover] Inbox ${emailAccount.email_address} encountered fatal account error: ${errMsg}. Attempting failover.`);
      const failoverResult = await dbService.getAvailableEmailAccountForCampaign(campaign);
      if (failoverResult.status === 'available' && failoverResult.account.id !== emailAccount.id) {
        console.info(`[SendFailover] Successfully failed over to healthy inbox ${failoverResult.account.email_address}.`);
        emailAccount = failoverResult.account;
        message.email_account_id = emailAccount.id;
        sendResult = await executeSend(emailAccount);
      } else {
        throw sendErr;
      }
    } else {
      throw sendErr;
    }
  }

  // 1. Immediately record account send so the cooldown timestamp and counter are secured
  await dbService.recordAccountSend(emailAccount.id);

  // 2. Confirmed success: update records
  message.status = 'sent';
  message.email_account_id = emailAccount.id;
  message.gmail_message_id = sendResult.id;
  message.gmail_thread_id = sendResult.threadId || targetThreadId || null;
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
  if (cl.status === 'replied' || cl.status === 'unsubscribed' || cl.status === 'completed' || cl.lead?.status === 'replied') {
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

  const ownEmails = emailAccounts.map((a) => a.email_address.toLowerCase().trim());
  const ownEmailSet = new Set(ownEmails);

  // Query all sent messages with high limit so no past outreach messages are omitted
  const sentMessages = await dbService.getMessages({ status: 'sent', limit: 1000 });
  const sentThreads = sentMessages
    .filter((m) => m.gmail_thread_id)
    .map((m) => m.gmail_thread_id as string);
  if (sentThreads.length === 0) return;

  for (const emailAccount of emailAccounts) {
    if (emailAccount.provider === 'smtp') {
      // SMTP/IMAP inboxes (Titan, GoDaddy, etc.) don't use Gmail API sync
      continue;
    }

    // Filter threads sent by this account (or unassigned fallback)
    const accountSentMessages = sentMessages.filter(
      (m) => m.email_account_id === emailAccount.id || !m.email_account_id
    );
    const accountThreads = Array.from(
      new Set(
        accountSentMessages
          .map((m) => m.gmail_thread_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    if (accountThreads.length === 0) continue;

    let inboundReplies = [];
    try {
      inboundReplies = await executeWithGmailAuth(emailAccount, (token) =>
        pollGmailReplies(token, accountThreads, ownEmails)
      );
    } catch (syncErr) {
      console.warn(`[SyncReplies] Could not poll replies for ${emailAccount.email_address}:`, syncErr);
      continue;
    }

    for (const reply of inboundReplies) {
      const senderLower = (reply.senderEmail || '').toLowerCase();
      const bodyLower = (reply.bodyText || '').toLowerCase();
      const subjectLower = (reply.subject || '').toLowerCase();

      // Guard 1: Never accept self-sent emails from our own outreach accounts
      if (ownEmailSet.has(senderLower)) {
        console.log(`[SyncReplies] Skipping outbound/self message from ${senderLower}`);
        continue;
      }

      // Guard 2: Skip message if its gmail_message_id matches any of our own sent outbound messages
      if (sentMessages.some((m) => m.gmail_message_id === reply.id)) {
        console.log(`[SyncReplies] Skipping message ${reply.id} which matches an existing sent message`);
        continue;
      }

      // Check if this is a bounce / delivery failure notice from mailer-daemon, postmaster, etc.
      const isBounce =
        senderLower.includes('mailer-daemon') ||
        senderLower.includes('mail-daemon') ||
        senderLower.includes('mailer_daemon') ||
        senderLower.includes('postmaster') ||
        senderLower.startsWith('bounce') ||
        senderLower.includes('mail delivery subsystem') ||
        subjectLower.includes('delivery status notification') ||
        subjectLower.includes('delivery failure') ||
        subjectLower.includes('undeliverable') ||
        subjectLower.includes('mail delivery failed') ||
        bodyLower.includes('domain could not be found') ||
        bodyLower.includes('address not found') ||
        bodyLower.includes('delivery failure') ||
        bodyLower.includes('undelivered mail') ||
        bodyLower.includes('550 ') ||
        bodyLower.includes('554 ');

      const matchedMessage = sentMessages.find((m) => m.gmail_thread_id === reply.threadId);

      if (isBounce) {
        if (matchedMessage && matchedMessage.lead) {
          // Mark lead as bounced (not replied!)
          await dbService.updateLead(matchedMessage.lead.id, { status: 'bounced' });
          // Add lead email to suppression list with bounce reason
          await dbService.addSuppression(userId, matchedMessage.lead.normalized_email, 'bounce', 'mailer_daemon_bounce');
          // Cancel any upcoming scheduled follow-ups
          const scheduledMsgs = await dbService.getMessages({ status: 'scheduled' });
          for (const msg of scheduledMsgs) {
            if (msg.campaign_lead_id === matchedMessage.campaign_lead_id) {
              msg.status = 'cancelled';
              await dbService.createOrUpdateMessage(msg);
            }
          }
        }
        // Never record mailer-daemon as an inbound prospect reply in reply_events
        continue;
      }

      const classification = await classifyReply(reply.bodyText);
      const summaryLower = (classification.summary || '').toLowerCase();

      // Guard 3: If Gemini classification identifies delivery failure / bounce, do not record as reply
      if (
        summaryLower.includes('delivery failure') ||
        summaryLower.includes('domain could not be found') ||
        summaryLower.includes('undeliverable') ||
        summaryLower.includes('address not found') ||
        summaryLower.includes('mailer-daemon') ||
        summaryLower.includes('mail delivery')
      ) {
        if (matchedMessage && matchedMessage.lead) {
          await dbService.updateLead(matchedMessage.lead.id, { status: 'bounced' });
          await dbService.addSuppression(userId, matchedMessage.lead.normalized_email, 'bounce', 'ai_detected_bounce');
        }
        continue;
      }

      // Guard 4: If classification summary identifies an outbound pitch or draft, skip
      if (
        summaryLower.includes('outbound sales pitch') ||
        summaryLower.includes('draft rather than a reply') ||
        summaryLower.includes('outbound pitch') ||
        summaryLower.includes('outbound email')
      ) {
        console.log(`[SyncReplies] Skipping message identified as outbound pitch/draft: ${classification.summary}`);
        continue;
      }

      await dbService.recordReply({
        user_id: userId,
        email_message_id: matchedMessage?.id || null,
        gmail_message_id: reply.id,
        gmail_thread_id: reply.threadId,
        sender_email: reply.senderEmail,
        received_at: reply.receivedAt,
        classification: classification.classification,
        classification_summary: classification.summary,
        reply_text: reply.bodyText,
      });

      if (matchedMessage) {
        if (matchedMessage.lead) {
          if (classification.is_explicit_unsubscribe || classification.classification === 'unsubscribe') {
            await dbService.addSuppression(userId, matchedMessage.lead.normalized_email, 'unsubscribe', 'reply_detection');
          } else {
            await dbService.updateLead(matchedMessage.lead.id, { status: 'replied' });
          }
        }
        if (matchedMessage.campaign_lead_id) {
          await dbService.updateCampaignLead(matchedMessage.campaign_lead_id, {
            status: 'replied',
            completed_at: new Date().toISOString(),
          });
          if (isLiveSupabase()) {
            const { createAdminClient } = await import('../supabase/admin');
            const supabase = createAdminClient();
            await supabase
              .from('email_messages')
              .update({ status: 'cancelled', updated_at: new Date().toISOString() })
              .eq('campaign_lead_id', matchedMessage.campaign_lead_id)
              .in('status', ['scheduled', 'draft']);

            await supabase
              .from('job_queue')
              .update({ status: 'completed', updated_at: new Date().toISOString() })
              .filter('payload->>campaignLeadId', 'eq', matchedMessage.campaign_lead_id)
              .in('status', ['queued', 'running']);
          }
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

  // Live database synchronization: cascade to campaign_leads and job_queue
  if (isLiveSupabase()) {
    try {
      const { createAdminClient } = await import('../supabase/admin');
      const supabase = createAdminClient();

      const { data: matchedLeads } = await supabase
        .from('leads')
        .select('id')
        .eq('user_id', userId)
        .eq('normalized_email', normalizedEmail);

      if (matchedLeads && matchedLeads.length > 0) {
        const leadIds = matchedLeads.map((l) => l.id);

        // Update campaign_leads status
        await supabase
          .from('campaign_leads')
          .update({ status: 'unsubscribed', updated_at: new Date().toISOString() })
          .in('lead_id', leadIds)
          .neq('status', 'unsubscribed');

        // Cancel pending queued jobs for these leads
        for (const leadId of leadIds) {
          await supabase
            .from('job_queue')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .filter('payload->>leadId', 'eq', leadId)
            .in('status', ['queued', 'running']);
        }
      }
    } catch (err) {
      console.warn('[Unsubscribe] Failed to cascade campaign_leads/queue cancellation:', err);
    }
  }
}


/**
 * Self-healing queue reconciliation helper
 */
export async function reconcileScheduledJobs() {
  return dbService.reconcileScheduledJobs();
}

let isCycleRunning = false;
let lastCycleStartTime = 0;
const lastReplySyncTime = new Map<string, number>();
const lastIgReplySyncTime = new Map<string, number>();
const lastWarmupRunTime = new Map<string, number>();

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

export interface WorkerCycleOptions {
  batchSize?: number;
  maxDurationMs?: number;
  skipPeriodic?: boolean;
}

export interface WorkerCycleResult {
  reconciled: number;
  claimed: number;
  processed: number;
  results: { jobId: string; type: string; status: 'completed' | 'failed'; error?: string }[];
  syncRepliesCount: number;
  warmupEmailsSent: number;
  durationMs: number;
  timedOut: boolean;
  status: 'completed' | 'skipped_overlapping' | 'timed_out';
}

/**
 * Master Autonomous Worker Cycle:
 * Executes the complete autonomous workflow independently of any UI/browser:
 * 1. Self-healing queue reconciliation (repairs any orphaned scheduled messages)
 * 2. Process job queue batch with strict time budgeting
 * 3. Inbound reply synchronization via Gmail API (throttled)
 * 4. Inbound Instagram DM reply synchronization (throttled)
 * 5. Peer inbox warmup cycle across active accounts (throttled)
 * 6. Recurring lead discovery jobs execution
 */
export async function runFullWorkerCycle(
  workerId = 'server-worker',
  isForce = false,
  options?: WorkerCycleOptions
): Promise<WorkerCycleResult> {
  const cycleStartTime = Date.now();
  const maxDurationMs = options?.maxDurationMs ?? 20000;
  const batchSize = Math.max(1, Math.min(10, options?.batchSize ?? 5));
  const skipPeriodic = Boolean(options?.skipPeriodic);

  // If a cycle is currently running, check if it's stale (ran > 60 seconds ago)
  const isStale = isCycleRunning && Date.now() - lastCycleStartTime > 60000;
  if (isCycleRunning && !isForce && !isStale) {
    console.log('[WorkerCycle] Previous cycle still executing. Skipping duplicate tick.');
    return {
      reconciled: 0,
      claimed: 0,
      processed: 0,
      results: [],
      syncRepliesCount: 0,
      warmupEmailsSent: 0,
      durationMs: Date.now() - cycleStartTime,
      timedOut: false,
      status: 'skipped_overlapping',
    };
  }

  isCycleRunning = true;
  lastCycleStartTime = Date.now();

  try {
    // 1. Self-healing queue reconciliation
    let reconciledCount = 0;
    try {
      const rec = await dbService.reconcileScheduledJobs();
      reconciledCount = rec.reconciled;
      const { instagramDb } = await import('../instagram/db');
      const igRec = await instagramDb.reconcileInstagramJobs();
      reconciledCount += igRec.reconciled;
    } catch (recErr: unknown) {
      console.warn('[WorkerCycle] Reconciliation warning:', recErr);
    }

    // 2. Claim and process ready queued jobs with time budget
    const remainingForBatch = Math.max(5000, maxDurationMs - (Date.now() - cycleStartTime));
    const batchResult = await processJobQueueBatch(workerId, batchSize, isForce, remainingForBatch);

    // 3. Periodic Background Tasks (throttled & time-budgeted)
    let totalWarmupSent = 0;
    const remainingTime = maxDurationMs - (Date.now() - cycleStartTime);

    // Only attempt periodic tasks if explicitly requested or if we have at least 6 seconds of budget remaining
    if (!skipPeriodic && remainingTime >= 6000) {
      let userIds: string[] = [];
      try {
        const { isLiveSupabase } = await import('@/lib/db-service');
        if (!isLiveSupabase()) {
          userIds = ['mock-user-id'];
        } else {
          const { createAdminClient } = await import('@/lib/supabase/admin');
          const supabase = createAdminClient();
          const [{ data: accUsers }, { data: campUsers }, { data: igAccUsers }, { data: igCampUsers }] =
            await Promise.all([
              supabase.from('email_accounts').select('user_id'),
              supabase.from('campaigns').select('user_id'),
              supabase.from('instagram_accounts').select('user_id'),
              supabase.from('instagram_campaigns').select('user_id'),
            ]);
          const set = new Set<string>();
          (accUsers || []).forEach((a: any) => a.user_id && set.add(a.user_id));
          (campUsers || []).forEach((c: any) => c.user_id && set.add(c.user_id));
          (igAccUsers || []).forEach((a: any) => a.user_id && set.add(a.user_id));
          (igCampUsers || []).forEach((c: any) => c.user_id && set.add(c.user_id));
          userIds = Array.from(set);
        }
      } catch (userErr) {
        console.warn('[WorkerCycle] Error finding active users:', userErr);
      }

      if (userIds.length === 0) {
        userIds = ['5f9832c0-d340-4e0f-b2d8-b3f44a294697'];
      }

      const now = Date.now();

      for (const userId of userIds) {
        // Check if time budget is running low before processing next user
        if (maxDurationMs - (Date.now() - cycleStartTime) < 4000) break;

        // Sync replies via Gmail API (at most once every 3 minutes per user)
        const lastSync = lastReplySyncTime.get(userId) || 0;
        if (now - lastSync >= 3 * 60 * 1000) {
          lastReplySyncTime.set(userId, now);
          await withTimeout(handleSyncRepliesJob({ userId }), 4000, null).catch((syncErr) => {
            console.warn(`[WorkerCycle] Reply sync non-fatal error for ${userId}:`, syncErr);
          });
        }

        // Sync Instagram DM replies (at most once every 3 minutes per user)
        const lastIgSync = lastIgReplySyncTime.get(userId) || 0;
        if (now - lastIgSync >= 3 * 60 * 1000) {
          lastIgReplySyncTime.set(userId, now);
          try {
            const { handleSyncIgRepliesJob } = await import('../instagram/worker');
            await withTimeout(handleSyncIgRepliesJob({ userId }), 4000, null).catch((igSyncErr) => {
              console.warn(`[WorkerCycle] Instagram reply sync non-fatal error for ${userId}:`, igSyncErr);
            });
          } catch {
            // Module load failure guard
          }
        }

        // Peer warmup cycle (at most once every 2 hours per user)
        const lastWarmup = lastWarmupRunTime.get(userId) || 0;
        if (now - lastWarmup >= 2 * 60 * 60 * 1000) {
          lastWarmupRunTime.set(userId, now);
          try {
            const { runWarmupCycle } = await import('@/lib/warmup/service');
            const warmupRes = await withTimeout(runWarmupCycle(userId), 4000, null);
            if (warmupRes) totalWarmupSent += warmupRes.emailsSent;
          } catch (warmupErr) {
            console.warn(`[WorkerCycle] Warmup cycle non-fatal error for ${userId}:`, warmupErr);
          }
        }

        // Scheduled lead discovery jobs (run only if scheduled and due)
        try {
          const allJobs = await dbService.getDiscoveryJobs(userId);
          const nowDate = new Date();
          for (const dJob of allJobs) {
            if (
              dJob.status !== 'paused' &&
              dJob.status !== 'running' &&
              dJob.schedule_frequency !== 'once' &&
              dJob.next_run_at &&
              new Date(dJob.next_run_at) <= nowDate
            ) {
              const { executeDiscoveryJob } = await import('@/lib/discovery/service');
              executeDiscoveryJob(dJob.id).catch((e) => console.warn('[WorkerCycle] Discovery error:', e));
            }
          }
        } catch (discErr) {
          console.warn(`[WorkerCycle] Discovery check non-fatal error for ${userId}:`, discErr);
        }
      }
    }

    const durationMs = Date.now() - cycleStartTime;
    return {
      reconciled: reconciledCount,
      claimed: batchResult.claimed,
      processed: batchResult.processed,
      results: batchResult.results,
      syncRepliesCount: 0,
      warmupEmailsSent: totalWarmupSent,
      durationMs,
      timedOut: batchResult.timedOut,
      status: 'completed',
    };
  } finally {
    isCycleRunning = false;
  }
}
