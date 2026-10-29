import crypto from 'crypto';
import { dbService } from '../db-service';
import { generateInitialEmail, generateFollowupEmail, classifyReply } from '../gemini';
import { sendGmailMessage, pollGmailReplies } from '../gmail/client';
import { sendSmtpEmail } from '../smtp/client';
import { executeWithGmailAuth } from '../gmail/tokens';
import { encryptToken, decryptToken } from '../crypto';
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

  // Execute Send (via SMTP or Gmail OAuth)
  let sendResult: { id: string; threadId: string };

  const senderDisplay = emailAccount.sender_name?.trim()
    ? `"${emailAccount.sender_name.trim()}" <${emailAccount.email_address}>`
    : emailAccount.email_address;

  if (emailAccount.provider === 'smtp') {
    let smtpPassword = '';
    try {
      smtpPassword = decryptToken(emailAccount.encrypted_smtp_password || emailAccount.encrypted_access_token);
    } catch {
      smtpPassword = emailAccount.encrypted_smtp_password || emailAccount.encrypted_access_token;
    }

    sendResult = await sendSmtpEmail(
      {
        host: emailAccount.smtp_host || 'smtp.titan.email',
        port: emailAccount.smtp_port || 465,
        secure: emailAccount.smtp_secure ?? (emailAccount.smtp_port === 465 || !emailAccount.smtp_port),
        user: emailAccount.smtp_username || emailAccount.email_address,
        pass: smtpPassword,
      },
      {
        from: senderDisplay,
        to: lead.email,
        subject: message.subject,
        bodyText: message.body_text,
        threadId: targetThreadId,
        inReplyToMessageId: formattedInReplyTo,
        references: formattedInReplyTo,
        attachments,
      }
    );
  } else {
    sendResult = await executeWithGmailAuth(emailAccount, (token) =>
      sendGmailMessage(token, {
        from: senderDisplay,
        to: lead.email,
        subject: message.subject,
        bodyText: message.body_text,
        threadId: targetThreadId,
        inReplyToMessageId: formattedInReplyTo,
        references: formattedInReplyTo,
        attachments,
      })
    );
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

  const ownEmails = emailAccounts.map((a) => a.email_address.toLowerCase().trim());
  const ownEmailSet = new Set(ownEmails);

  const messages = await dbService.getMessages();
  const sentThreads = messages
    .filter((m) => m.status === 'sent' && m.gmail_thread_id)
    .map((m) => m.gmail_thread_id as string);
  if (sentThreads.length === 0) return;

  for (const emailAccount of emailAccounts) {
    if (emailAccount.provider === 'smtp') {
      // SMTP/IMAP inboxes (Titan, GoDaddy, etc.) don't use Gmail API sync
      continue;
    }

    let inboundReplies = [];
    try {
      inboundReplies = await executeWithGmailAuth(emailAccount, (token) =>
        pollGmailReplies(token, sentThreads, ownEmails)
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
      if (messages.some((m) => m.gmail_message_id === reply.id)) {
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
        senderLower.includes('noreply') ||
        senderLower.includes('no-reply') ||
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

      const matchedMessage = messages.find((m) => m.gmail_thread_id === reply.threadId);

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
