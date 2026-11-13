import { dbService, isLiveSupabase } from '@/lib/db-service';
import { classifyReply } from '@/lib/gemini';
import {
  isWithinSendingWindow,
  getNextSendingWindowDate,
} from '@/lib/scheduler';
import { InstagramAccount } from '@/types/database';
import { instagramDb } from './db';
import { generateInitialInstagramDM, generateFollowupInstagramDM } from './ai';
import { sendInstagramDM, pollInstagramReplies, resolveInstagramProfile } from './client';
import { formatInstagramHandle, normalizeInstagramHandle } from './handles';

// In-memory safety trackers across concurrent/batch worker executions
const accountBackoffUntil = new Map<string, number>();
const lastAccountAttemptMs = new Map<string, number>();

/**
 * 1. Generate an AI Instagram DM draft (step 0 or follow-up)
 */
export async function handleGenerateIgDmJob(
  payload: { campaignLeadId: string; stepNumber?: number },
  options?: { skipEnqueue?: boolean }
) {
  const { campaignLeadId, stepNumber = 0 } = payload;

  const targetCl = await instagramDb.getInstagramCampaignLead(campaignLeadId);
  if (!targetCl) {
    throw new Error(`Cannot find Instagram campaign lead enrollment ${campaignLeadId}`);
  }

  const campaign = targetCl.campaign || (await instagramDb.getInstagramCampaign(targetCl.campaign_id));
  if (!campaign) {
    throw new Error(`Cannot find Instagram campaign for enrollment ${campaignLeadId}`);
  }

  const lead = targetCl.lead || (await instagramDb.getInstagramLead(targetCl.instagram_lead_id));
  if (!lead) {
    throw new Error(`Cannot find Instagram lead for enrollment ${campaignLeadId}`);
  }

  if (!lead.normalized_handle) {
    throw new Error(`Lead "${lead.full_name || lead.company || lead.id}" does not have an Instagram handle yet.`);
  }

  if (lead.status === 'do_not_contact' || lead.status === 'replied') {
    await instagramDb.updateInstagramCampaignLead(campaignLeadId, {
      status: lead.status === 'replied' ? 'replied' : 'do_not_contact',
    });
    return;
  }

  let senderDisplayName = 'Sender';
  if (campaign.instagram_account_id) {
    const acc = await instagramDb.getInstagramAccount(campaign.instagram_account_id);
    if (acc) senderDisplayName = acc.display_name || `@${acc.username}`;
  }

  if (stepNumber === 0) {
    const generated = await generateInitialInstagramDM({
      lead,
      campaign,
      senderDisplayName,
    });

    const isCampaignActive = campaign.status === 'active';
    const scheduledDate = isCampaignActive
      ? getNextSendingWindowDate(campaign.sending_config, new Date())
      : null;

    const savedMsg = await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: campaignLeadId,
      step_number: 0,
      body_text: generated.body,
      personalization_basis: generated.personalization_basis,
      unsupported_claims: generated.unsupported_claims,
      status: isCampaignActive ? 'scheduled' : 'draft',
      scheduled_at: scheduledDate ? scheduledDate.toISOString() : null,
      instagram_account_id: campaign.instagram_account_id || null,
    });

    await instagramDb.updateInstagramCampaignLead(campaignLeadId, {
      status: isCampaignActive ? 'in_progress' : 'drafted',
      current_step: 0,
      next_action_at: scheduledDate ? scheduledDate.toISOString() : null,
      last_error: null,
    });

    if (isCampaignActive && !options?.skipEnqueue) {
      await dbService.enqueueJob(
        'send_ig_dm',
        { instagramMessageId: savedMsg.id },
        `send_ig_initial_${savedMsg.id}`,
        scheduledDate!
      );
    }
  } else {
    const initialMsg = await instagramDb.getInstagramMessageByLeadAndStep(campaignLeadId, 0);
    const stepConfig = campaign.followup_config?.steps?.find((s) => s.step === stepNumber);
    const instructions =
      stepConfig?.instructions || 'Send a brief, friendly follow-up DM.';

    const generated = await generateFollowupInstagramDM({
      lead,
      campaign,
      stepNumber,
      stepInstructions: instructions,
      previousBody: initialMsg?.body_text || '',
    });

    const now = new Date();
    const delayDays = stepConfig?.delay_days || 3;
    const targetDate = new Date(now.getTime() + delayDays * 24 * 60 * 60 * 1000);
    const scheduledDate = getNextSendingWindowDate(campaign.sending_config, targetDate);

    const savedMsg = await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: campaignLeadId,
      step_number: stepNumber,
      body_text: generated.body,
      personalization_basis: generated.personalization_basis,
      unsupported_claims: generated.unsupported_claims,
      status: campaign.status === 'active' ? 'scheduled' : 'draft',
      instagram_account_id: initialMsg?.instagram_account_id || campaign.instagram_account_id || null,
      ig_thread_id: initialMsg?.ig_thread_id || null,
      scheduled_at: campaign.status === 'active' ? scheduledDate.toISOString() : null,
    });

    await instagramDb.updateInstagramCampaignLead(campaignLeadId, {
      current_step: stepNumber,
      next_action_at: scheduledDate.toISOString(),
    });

    if (campaign.status === 'active' && !options?.skipEnqueue) {
      await dbService.enqueueJob(
        'send_ig_dm',
        { instagramMessageId: savedMsg.id },
        `send_ig_${savedMsg.id}`,
        scheduledDate
      );
    }
  }
}

/**
 * 2. Send a scheduled/draft Instagram DM with strict pre-flight, rate-limit, and threading checks.
 */
export async function handleSendIgDmJob(payload: { instagramMessageId: string }, force = false) {
  const { instagramMessageId } = payload;
  const message = await instagramDb.getInstagramMessage(instagramMessageId);
  if (!message) {
    throw new Error(`Instagram message not found: ${instagramMessageId}`);
  }

  if (message.status === 'sent' || message.status === 'paused' || message.status === 'cancelled') {
    return;
  }

  const campaignLead =
    (message as any).campaign_lead || (await instagramDb.getInstagramCampaignLead(message.campaign_lead_id));
  if (!campaignLead) {
    throw new Error(`Instagram campaign lead not found: ${message.campaign_lead_id}`);
  }

  const campaign = await instagramDb.getInstagramCampaign(campaignLead.campaign_id);
  if (!campaign) {
    throw new Error('Instagram campaign not found');
  }

  if (campaign.status !== 'active') {
    throw new Error(`Instagram campaign is ${campaign.status}. Sending suspended.`);
  }

  const lead = campaignLead.lead || (await instagramDb.getInstagramLead(campaignLead.instagram_lead_id));
  if (!lead) {
    throw new Error('Instagram lead not found');
  }

  if (lead.status === 'do_not_contact' || lead.status === 'replied' || lead.status === 'invalid') {
    await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: message.campaign_lead_id,
      step_number: message.step_number,
      status: 'cancelled',
    });
    return;
  }

  const handle = normalizeInstagramHandle(lead.normalized_handle || lead.instagram_handle || lead.instagram_url);
  if (!handle) {
    await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: message.campaign_lead_id,
      step_number: message.step_number,
      status: 'failed',
      error_message: 'Missing Instagram handle — add @handle to send DM.',
    });
    await instagramDb.updateInstagramCampaignLead(campaignLead.id, {
      status: 'failed',
      last_error: 'Missing Instagram handle',
    });
    return;
  }

  // Pre-flight: Sending Window
  if (!force && !isWithinSendingWindow(campaign.sending_config)) {
    const nextWindow = getNextSendingWindowDate(campaign.sending_config, new Date());
    await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: message.campaign_lead_id,
      step_number: message.step_number,
      status: 'scheduled',
      scheduled_at: nextWindow.toISOString(),
    });
    await dbService.enqueueJob(
      'send_ig_dm',
      { instagramMessageId },
      `retry_ig_win_${instagramMessageId}_${nextWindow.getTime()}`,
      nextWindow
    );
    return;
  }

  // Pre-flight: Campaign daily & hourly limits
  if (campaign.sending_config) {
    const stats = await instagramDb.getInstagramCampaignSendStats(campaign.id, campaign.sending_config);
    const campDailyLimit = campaign.sending_config.daily_limit;
    if (campDailyLimit && stats.sentToday >= campDailyLimit) {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const nextDayWindow = getNextSendingWindowDate(campaign.sending_config, tomorrow);
      await instagramDb.createOrUpdateInstagramMessage({
        campaign_lead_id: message.campaign_lead_id,
        step_number: message.step_number,
        status: 'scheduled',
        scheduled_at: nextDayWindow.toISOString(),
      });
      await dbService.enqueueJob(
        'send_ig_dm',
        { instagramMessageId },
        `resched_ig_daily_${instagramMessageId}_${nextDayWindow.getTime()}`,
        nextDayWindow
      );
      return;
    }

    const campHourlyLimit = campaign.sending_config.hourly_limit || 0;
    if (campHourlyLimit > 0 && stats.sentPastHour >= campHourlyLimit) {
      const throttleExit = new Date(stats.earliestHourSendMs + 60 * 60 * 1000 + 2000);
      await instagramDb.createOrUpdateInstagramMessage({
        campaign_lead_id: message.campaign_lead_id,
        step_number: message.step_number,
        status: 'scheduled',
        scheduled_at: throttleExit.toISOString(),
      });
      await dbService.enqueueJob(
        'send_ig_dm',
        { instagramMessageId },
        `resched_ig_hourly_${instagramMessageId}_${throttleExit.getTime()}`,
        throttleExit
      );
      return;
    }
  }

  // Account Selection & Follow-up Thread Enforcement
  let selectedAccount: InstagramAccount | undefined;
  let targetThreadId: string | undefined = message.ig_thread_id || undefined;

  if (message.step_number > 0) {
    const initialMsg = await instagramDb.getInstagramMessageByLeadAndStep(message.campaign_lead_id, 0);
    const prevMsg =
      message.step_number > 1
        ? await instagramDb.getInstagramMessageByLeadAndStep(message.campaign_lead_id, message.step_number - 1)
        : initialMsg;

    if ((!prevMsg || prevMsg.status !== 'sent') && (!initialMsg || initialMsg.status !== 'sent')) {
      await instagramDb.createOrUpdateInstagramMessage({
        campaign_lead_id: message.campaign_lead_id,
        step_number: message.step_number,
        status: 'cancelled',
      });
      return;
    }

    targetThreadId = targetThreadId || prevMsg?.ig_thread_id || initialMsg?.ig_thread_id || undefined;
    const lockedAccId = message.instagram_account_id || prevMsg?.instagram_account_id || initialMsg?.instagram_account_id;
    if (lockedAccId) {
      const acc = await instagramDb.getInstagramAccount(lockedAccId);
      if (acc && acc.status === 'active') {
        selectedAccount = acc;
      }
    }
  }

  if (!selectedAccount) {
    const allActive = await instagramDb.getInstagramAccounts(campaign.user_id, { status: 'active' });
    if (allActive.length === 0) {
      throw new Error('No active Instagram accounts connected. Connect an Instagram account first.');
    }

    if (message.instagram_account_id) {
      selectedAccount = allActive.find((a) => a.id === message.instagram_account_id);
    }
    if (!selectedAccount && campaign.instagram_account_id) {
      selectedAccount = allActive.find((a) => a.id === campaign.instagram_account_id);
    }
    if (!selectedAccount) {
      // Pick the account with the oldest last_sent_at that still has remaining daily capacity
      const tz = campaign.sending_config?.timezone || 'UTC';
      const sorted = [...allActive].sort((a, b) => {
        const tA = a.last_sent_at ? new Date(a.last_sent_at).getTime() : 0;
        const tB = b.last_sent_at ? new Date(b.last_sent_at).getTime() : 0;
        return tA - tB;
      });
      for (const candidate of sorted) {
        const sentToday = await instagramDb.getInstagramAccountSentTodayCount(candidate.id, tz);
        if (sentToday < candidate.daily_limit) {
          selectedAccount = candidate;
          break;
        }
      }
      if (!selectedAccount) {
        selectedAccount = sorted[0];
      }
    }
  }

  // Per-account daily limit & cooldown check
  const tz = campaign.sending_config?.timezone || 'UTC';
  const accountSentToday = await instagramDb.getInstagramAccountSentTodayCount(selectedAccount.id, tz);
  if (accountSentToday >= selectedAccount.daily_limit) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const nextWindow = getNextSendingWindowDate(campaign.sending_config, tomorrow);
    await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: message.campaign_lead_id,
      step_number: message.step_number,
      status: 'scheduled',
      scheduled_at: nextWindow.toISOString(),
    });
    await dbService.enqueueJob(
      'send_ig_dm',
      { instagramMessageId },
      `resched_ig_acclimit_${instagramMessageId}_${nextWindow.getTime()}`,
      nextWindow
    );
    return;
  }

  // 1. Account 429 Backoff Check
  const backoffUntil = accountBackoffUntil.get(selectedAccount.id) || 0;
  if (backoffUntil > Date.now()) {
    const nextReady = new Date(backoffUntil + 2000);
    await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: message.campaign_lead_id,
      step_number: message.step_number,
      status: 'scheduled',
      scheduled_at: nextReady.toISOString(),
      error_message: `Account is cooling down after rate limit (HTTP 429). Retrying at ${nextReady.toLocaleTimeString()}.`,
    });
    await dbService.enqueueJob(
      'send_ig_dm',
      { instagramMessageId },
      `cooldown_ig_429_${instagramMessageId}_${nextReady.getTime()}`,
      nextReady
    );
    return;
  }

  // 2. Minimum safe interval between DMs (at least 60s, or account min_interval_minutes)
  const minIntervalMs = Math.max(60000, (selectedAccount.min_interval_minutes || 3) * 60 * 1000);
  const lastSentDb = selectedAccount.last_sent_at ? new Date(selectedAccount.last_sent_at).getTime() : 0;
  const lastAttemptMemory = lastAccountAttemptMs.get(selectedAccount.id) || 0;
  const mostRecentActivity = Math.max(lastSentDb, lastAttemptMemory);

  if (mostRecentActivity > 0) {
    const elapsed = Date.now() - mostRecentActivity;
    if (elapsed < minIntervalMs) {
      const nextReady = new Date(mostRecentActivity + minIntervalMs + 2000);
      await instagramDb.createOrUpdateInstagramMessage({
        campaign_lead_id: message.campaign_lead_id,
        step_number: message.step_number,
        status: 'scheduled',
        scheduled_at: nextReady.toISOString(),
      });
      await dbService.enqueueJob(
        'send_ig_dm',
        { instagramMessageId },
        `cooldown_ig_${instagramMessageId}_${nextReady.getTime()}`,
        nextReady
      );
      return;
    }
  }

  // Record this attempt timestamp in memory immediately before network requests
  lastAccountAttemptMs.set(selectedAccount.id, Date.now());

  // 3. Draft body guard: If body text is empty, generate it on the fly
  let textToSend = message.body_text?.trim() || '';
  if (!textToSend) {
    await handleGenerateIgDmJob(
      {
        campaignLeadId: message.campaign_lead_id,
        stepNumber: message.step_number,
      },
      { skipEnqueue: true }
    );
    const refreshed = await instagramDb.getInstagramMessage(instagramMessageId);
    textToSend = refreshed?.body_text?.trim() || '';
    if (!textToSend) {
      throw new Error(`Message draft ${instagramMessageId} is empty and could not be generated.`);
    }
  }

  // Send the DM!
  try {
    const result = await sendInstagramDM({
      account: selectedAccount,
      recipientHandle: handle,
      text: textToSend,
      recipientIgUserId: lead.ig_user_id,
      existingThreadId: targetThreadId,
    });

    const sentAt = new Date().toISOString();
    await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: message.campaign_lead_id,
      step_number: message.step_number,
      status: 'sent',
      instagram_account_id: selectedAccount.id,
      ig_message_id: result.messageId,
      ig_thread_id: result.threadId,
      sent_at: sentAt,
      error_code: null,
      error_message: null,
    });

    await instagramDb.updateInstagramAccount(selectedAccount.id, {
      last_sent_at: sentAt,
      last_error: null,
    });

    // Cache resolved ig_user_id on lead if discovered
    const leadUpdates: Record<string, any> = {
      status: lead.status === 'active' ? 'contacted' : lead.status,
    };
    if (result.recipientIgUserId && !lead.ig_user_id) {
      leadUpdates.ig_user_id = result.recipientIgUserId;
    }
    await instagramDb.updateInstagramLead(lead.id, leadUpdates);

    const maxFollowups = campaign.followup_config?.max_followups ?? 0;
    const isFinalStep = message.step_number >= maxFollowups;

    await instagramDb.updateInstagramCampaignLead(campaignLead.id, {
      status: isFinalStep ? 'completed' : 'in_progress',
      current_step: message.step_number,
      completed_at: isFinalStep ? sentAt : null,
      last_error: null,
    });

    // Schedule next follow-up if configured
    if (!isFinalStep) {
      const nextStepNumber = message.step_number + 1;
      const stepConfig = campaign.followup_config?.steps?.find((s) => s.step === nextStepNumber);
      const delayDays = stepConfig?.delay_days || 3;
      await dbService.enqueueJob(
        'schedule_ig_followup',
        { campaignLeadId: campaignLead.id, nextStepNumber, delayDays },
        `sched_ig_fu_${campaignLead.id}_step_${nextStepNumber}`,
        new Date(Date.now() + 5000)
      );
    }

    await dbService.logActivity(campaign.user_id, 'instagram_dm_sent', 'instagram_messages', message.id, {
      campaign_id: campaign.id,
      recipient: formatInstagramHandle(handle),
      sender: formatInstagramHandle(selectedAccount.username),
      step_number: message.step_number,
      simulated: Boolean(result.simulated),
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isRateLimited =
      errMsg.includes('429') ||
      errMsg.includes('RATE_LIMITED') ||
      errMsg.toLowerCase().includes('rate limit') ||
      errMsg.toLowerCase().includes('throttled') ||
      errMsg.toLowerCase().includes('wait a few minutes');

    if (isRateLimited) {
      const backoffMs = 15 * 60 * 1000;
      const resumeTime = new Date(Date.now() + backoffMs);
      accountBackoffUntil.set(selectedAccount.id, resumeTime.getTime());

      await instagramDb.updateInstagramAccount(selectedAccount.id, {
        last_error: `Instagram rate limit (HTTP 429). Pausing sends until ${resumeTime.toLocaleTimeString()}.`,
      });

      await instagramDb.createOrUpdateInstagramMessage({
        campaign_lead_id: message.campaign_lead_id,
        step_number: message.step_number,
        status: 'scheduled',
        scheduled_at: resumeTime.toISOString(),
        error_message: `Rate limited by Instagram (HTTP 429). Auto-rescheduled for ${resumeTime.toLocaleTimeString()}.`,
      });

      await instagramDb.updateInstagramCampaignLead(campaignLead.id, {
        status: campaignLead.status === 'failed' ? 'drafted' : campaignLead.status,
        last_error: `Rate limited by Instagram (HTTP 429). Will retry at ${resumeTime.toLocaleTimeString()}.`,
      });

      await dbService.enqueueJob(
        'send_ig_dm',
        { instagramMessageId: message.id },
        `retry_ig_429_${message.id}_${resumeTime.getTime()}`,
        resumeTime
      );

      console.warn(`[InstagramWorker] Rate limited for @${selectedAccount.username}. Rescheduled message ${message.id} to ${resumeTime.toISOString()}`);
      return;
    }

    if (errMsg.startsWith('AUTH_EXPIRED:')) {
      await instagramDb.updateInstagramAccount(selectedAccount.id, {
        status: 'error',
        last_error: errMsg,
      });
    } else if (errMsg.startsWith('CHALLENGE_REQUIRED:')) {
      await instagramDb.updateInstagramAccount(selectedAccount.id, {
        status: 'challenge_required',
        last_error: errMsg,
      });
    }

    await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: message.campaign_lead_id,
      step_number: message.step_number,
      status: 'failed',
      error_message: errMsg,
    });

    await instagramDb.updateInstagramCampaignLead(campaignLead.id, {
      status: 'failed',
      last_error: errMsg,
    });
    throw err;
  }
}

/**
 * 3. Schedule Follow-up DM generation
 */
export async function handleScheduleIgFollowupJob(payload: {
  campaignLeadId: string;
  nextStepNumber: number;
  delayDays: number;
}) {
  const cl = await instagramDb.getInstagramCampaignLead(payload.campaignLeadId);
  if (!cl) return;
  if (cl.status === 'replied' || cl.status === 'do_not_contact' || cl.status === 'completed') return;

  await handleGenerateIgDmJob({
    campaignLeadId: payload.campaignLeadId,
    stepNumber: payload.nextStepNumber,
  });
}

/**
 * 4. Sync & Classify Inbound Instagram DM Replies
 */
export async function handleSyncIgRepliesJob(payload: { userId: string }): Promise<{ synced: number }> {
  const { userId } = payload;
  const accounts = await instagramDb.getInstagramAccounts(userId, { status: 'active' });
  if (accounts.length === 0) return { synced: 0 };

  const allSent = await instagramDb.getInstagramMessages({ userId, status: 'sent' });
  const existingReplies = await instagramDb.getInstagramReplies(userId);
  const existingReplyMsgIds = new Set(existingReplies.map((r) => r.ig_message_id));

  let synced = 0;

  for (const account of accounts) {
    let incoming = [];
    try {
      incoming = await pollInstagramReplies(account);
    } catch (err) {
      console.warn(`[SyncIgReplies] Poll failed for @${account.username}:`, err);
      continue;
    }

    await instagramDb.updateInstagramAccount(account.id, {
      last_sync_at: new Date().toISOString(),
    });

    for (const reply of incoming) {
      if (existingReplyMsgIds.has(reply.igMessageId)) continue;

      // Match against sent messages by thread_id or sender_handle
      const normalizedSender = normalizeInstagramHandle(reply.senderHandle);
      const matchedMsg = allSent.find(
        (m) =>
          (m.ig_thread_id && m.ig_thread_id === reply.igThreadId) ||
          (normalizedSender && m.lead?.normalized_handle === normalizedSender)
      );

      // Only record replies for known outreach threads/leads
      if (!matchedMsg) continue;

      const classification = await classifyReply(reply.text);

      await instagramDb.recordInstagramReply({
        user_id: userId,
        instagram_message_id: matchedMsg.id,
        instagram_account_id: account.id,
        ig_thread_id: reply.igThreadId,
        ig_message_id: reply.igMessageId,
        sender_handle: formatInstagramHandle(normalizedSender || reply.senderHandle),
        received_at: reply.receivedAt,
        classification: classification.classification,
        classification_summary: classification.summary,
        reply_text: reply.text,
      });

      existingReplyMsgIds.add(reply.igMessageId);
      synced++;

      if (matchedMsg.lead) {
        const isOptOut =
          classification.is_explicit_unsubscribe || classification.classification === 'unsubscribe';
        await instagramDb.updateInstagramLead(matchedMsg.lead.id, {
          status: isOptOut ? 'do_not_contact' : 'replied',
        });
      }

      if (matchedMsg.campaign_lead_id) {
        await instagramDb.updateInstagramCampaignLead(matchedMsg.campaign_lead_id, {
          status:
            classification.is_explicit_unsubscribe || classification.classification === 'unsubscribe'
              ? 'do_not_contact'
              : 'replied',
          completed_at: new Date().toISOString(),
        });

        // Cancel pending follow-up DMs
        if (isLiveSupabase()) {
          const { createAdminClient } = await import('@/lib/supabase/admin');
          const supabase = createAdminClient();
          await supabase
            .from('instagram_messages')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('campaign_lead_id', matchedMsg.campaign_lead_id)
            .in('status', ['scheduled', 'draft', 'paused']);
        }
      }
    }
  }

  return { synced };
}
