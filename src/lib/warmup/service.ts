import crypto from 'crypto';
import { dbService, isLiveSupabase } from '../db-service';
import { createAdminClient } from '../supabase/admin';
import { sendGmailMessage } from '../gmail/client';
import { refreshAccessToken } from '../gmail/oauth';
import { decryptToken, encryptToken } from '../crypto';
import { EmailAccount, AccountGroup, WarmupMessage } from '@/types/database';

const WARMUP_TEMPLATES = [
  {
    subject: 'Quick thoughts on the project roadmap',
    body: (to: string, from: string) =>
      `Hi ${to},\n\nI was reviewing the project roadmap we discussed earlier this week. The timeline looks solid, especially around the Q4 deliverables.\n\nLet me know if you want to jump on a quick 10-minute sync to finalize the details.\n\nBest regards,\n${from}`,
    reply: (from: string) =>
      `Hi ${from},\n\nThanks for looking over that! I agree on the Q4 timeline. I've incorporated your feedback into the draft. Talk soon!\n\nBest,`,
  },
  {
    subject: 'Meeting reschedule for tomorrow',
    body: (to: string, from: string) =>
      `Hey ${to},\n\nHope your week is going well. Could we push our catch-up tomorrow back by 30 minutes? An urgent client sync came up on my calendar.\n\nLet me know if that works for you.\n\nThanks,\n${from}`,
    reply: (from: string) =>
      `Hey ${from},\n\nNo problem at all! 30 minutes later works perfectly on my end. I'll update the calendar invite.\n\nCheers!`,
  },
  {
    subject: 'Documentation updates and next steps',
    body: (to: string, from: string) =>
      `Hi ${to},\n\nJust pushed the latest updates to our API documentation and deployment guides. When you have a moment, take a look and let me know if anything needs clarification.\n\nBest,\n${from}`,
    reply: (from: string) =>
      `Hi ${from},\n\nLooks super clean and thorough! Everything is clear on my end. Appreciate you putting this together.\n\nBest,`,
  },
  {
    subject: 'Conference follow-up and notes',
    body: (to: string, from: string) =>
      `Hi ${to},\n\nGreat catching up during the workshop yesterday. Attached are the key notes and action items we jotted down.\n\nLet me know if I missed anything important.\n\nWarm regards,\n${from}`,
    reply: (from: string) =>
      `Hi ${from},\n\nThanks for sharing the notes so promptly! They capture our discussion accurately. Let's touch base next Monday.\n\nRegards,`,
  },
  {
    subject: 'Feedback on the new presentation slides',
    body: (to: string, from: string) =>
      `Hey ${to},\n\nI took a pass through the slide deck. Overall flow is great—I just added two minor suggestions on slide 8 regarding the market data.\n\nFeel free to review when you have time.\n\nCheers,\n${from}`,
    reply: (from: string) =>
      `Hey ${from},\n\nGreat catch on slide 8! I've updated the chart with the latest figures. Thanks for the quick review!\n\nBest,`,
  },
  {
    subject: 'Software tooling recommendations',
    body: (to: string, from: string) =>
      `Hi ${to},\n\nRegarding the infrastructure monitoring tools we talked about, I've had great experience with the setup we tested last month. Highly recommend checking it out.\n\nHappy to walk you through it if helpful.\n\nBest,\n${from}`,
    reply: (from: string) =>
      `Hi ${from},\n\nAwesome, thanks for the pointer! I'll test it out in our sandbox environment this week.\n\nThanks again!`,
  },
];

/**
 * Calculates how many warmup emails an account should send today
 * based on its warmup day count and the group's ramp rate.
 */
export function getWarmupDailyTarget(
  account: { warmup_day_count?: number } | EmailAccount,
  group?: AccountGroup | Partial<AccountGroup> | null
): number {
  const maxLimit = group?.warmup_daily_limit || 15;
  const rampRate = group?.warmup_ramp_per_day || 2;
  const dayCount = account.warmup_day_count || 1;
  const calculated = 2 + (dayCount - 1) * rampRate;
  return Math.min(maxLimit, Math.max(2, calculated));
}


/**
 * Helper to get a valid decrypted access token for an account.
 */
async function getAccountAccessToken(account: EmailAccount): Promise<string> {
  let accessToken = '';
  try {
    accessToken = decryptToken(account.encrypted_access_token);
  } catch {
    accessToken = account.encrypted_access_token;
  }

  // Auto-refresh token if expired
  if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
    try {
      const refreshToken = decryptToken(account.encrypted_refresh_token);
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      await dbService.upsertEmailAccount({
        ...account,
        encrypted_access_token: accessToken.startsWith('mock-') ? accessToken : encryptToken(accessToken),
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      });
    } catch (err) {
      console.warn(`[Warmup] Failed to refresh token for ${account.email_address}:`, err);
    }
  }

  return accessToken;
}

/**
 * Sends a single peer warmup email from one account to another in the pool.
 */
export async function executeWarmupSend(
  fromAccount: EmailAccount,
  toAccount: EmailAccount,
  group?: AccountGroup | null
): Promise<{ success: boolean; warmupMessageId?: string; error?: string }> {
  try {
    const templateIndex = Math.floor(Math.random() * WARMUP_TEMPLATES.length);
    const template = WARMUP_TEMPLATES[templateIndex];
    const uniqueHash = crypto.randomBytes(4).toString('hex');

    const senderName = fromAccount.sender_name || fromAccount.email_address.split('@')[0];
    const recipientName = toAccount.sender_name || toAccount.email_address.split('@')[0];

    const subject = `${template.subject} [WU-${uniqueHash}]`;
    const messageIdTag = crypto.randomUUID();
    const bodyText = `${template.body(recipientName, senderName)}\n\n<!-- warmup_msg_id:${messageIdTag} -->`;

    const accessToken = await getAccountAccessToken(fromAccount);

    const sendResult = await sendGmailMessage(accessToken, {
      from: fromAccount.email_address,
      to: toAccount.email_address,
      subject,
      bodyText,
    });

    const now = new Date().toISOString();

    // Record warmup message
    const warmupMsg: WarmupMessage = {
      id: messageIdTag,
      from_account_id: fromAccount.id,
      to_account_id: toAccount.id,
      group_id: group?.id || fromAccount.group_id || null,
      subject,
      body_text: bodyText,
      gmail_message_id: sendResult.id,
      gmail_thread_id: sendResult.threadId,
      status: 'sent',
      sent_at: now,
      created_at: now,
    };

    if (isLiveSupabase()) {
      const supabase = createAdminClient();
      await supabase.from('warmup_messages').insert({
        id: warmupMsg.id,
        from_account_id: warmupMsg.from_account_id,
        to_account_id: warmupMsg.to_account_id,
        group_id: warmupMsg.group_id,
        subject: warmupMsg.subject,
        body_text: warmupMsg.body_text,
        gmail_message_id: warmupMsg.gmail_message_id,
        gmail_thread_id: warmupMsg.gmail_thread_id,
        status: warmupMsg.status,
        sent_at: warmupMsg.sent_at,
      });

      // Update sender account stats
      await supabase
        .from('email_accounts')
        .update({
          warmup_sent_today: (fromAccount.warmup_sent_today || 0) + 1,
          total_warmup_sent: (fromAccount.total_warmup_sent || 0) + 1,
          warmup_status: 'warming',
          last_sent_at: now,
          updated_at: now,
        })
        .eq('id', fromAccount.id);
    } else {
      const { mockDb } = await import('../supabase/mock-db');
      mockDb.warmupMessages.set(warmupMsg.id, warmupMsg);
      fromAccount.warmup_sent_today = (fromAccount.warmup_sent_today || 0) + 1;
      fromAccount.total_warmup_sent = (fromAccount.total_warmup_sent || 0) + 1;
      fromAccount.warmup_status = 'warming';
      fromAccount.last_sent_at = now;
      mockDb.emailAccounts.set(fromAccount.id, fromAccount);
    }

    // Determine automated peer reply based on target reply rate (default 70%)
    const targetReplyRate = group?.warmup_reply_rate ?? 70;
    const shouldReply = Math.random() * 100 <= targetReplyRate;

    if (shouldReply) {
      try {
        const toAccessToken = await getAccountAccessToken(toAccount);
        const replyText = template.reply(senderName);

        const replyResult = await sendGmailMessage(toAccessToken, {
          from: toAccount.email_address,
          to: fromAccount.email_address,
          subject: `Re: ${subject}`,
          bodyText: replyText,
          threadId: sendResult.threadId,
        });

        const replyTime = new Date().toISOString();

        if (isLiveSupabase()) {
          const supabase = createAdminClient();
          await supabase
            .from('warmup_messages')
            .update({ status: 'replied', replied_at: replyTime })
            .eq('id', warmupMsg.id);

          await supabase
            .from('email_accounts')
            .update({
              warmup_received_today: (toAccount.warmup_received_today || 0) + 1,
              total_warmup_received: (toAccount.total_warmup_received || 0) + 1,
              updated_at: replyTime,
            })
            .eq('id', toAccount.id);
        } else {
          warmupMsg.status = 'replied';
          warmupMsg.replied_at = replyTime;
          toAccount.warmup_received_today = (toAccount.warmup_received_today || 0) + 1;
          toAccount.total_warmup_received = (toAccount.total_warmup_received || 0) + 1;
        }
      } catch (replyErr) {
        console.warn('[Warmup] Peer auto-reply error:', replyErr);
      }
    }

    return { success: true, warmupMessageId: warmupMsg.id };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Warmup] Failed send from ${fromAccount.email_address} to ${toAccount.email_address}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Runs a complete daily warmup cycle for all enabled groups and inboxes for a user.
 */
export async function runWarmupCycle(userId: string): Promise<{
  groupsProcessed: number;
  inboxesWarmed: number;
  emailsSent: number;
  errors: string[];
}> {
  const groups = await dbService.getAccountGroups(userId);
  const warmupGroups = groups.filter((g) => g.is_warmup_enabled);
  const allAccounts = await dbService.getEmailAccounts(userId, { status: 'active' });

  let inboxesWarmed = 0;
  let emailsSent = 0;
  const errors: string[] = [];

  for (const group of warmupGroups) {
    // Inboxes in this warmup group that have warmup enabled
    const pool = allAccounts.filter(
      (a) => a.group_id === group.id && a.warmup_enabled !== false && a.status === 'active'
    );

    if (pool.length < 2) {
      console.info(`[Warmup] Group "${group.name}" has fewer than 2 active inboxes. Need at least 2 inboxes for peer warmup.`);
      continue;
    }

    inboxesWarmed += pool.length;

    // Check warmup quota for each inbox in the group
    for (let i = 0; i < pool.length; i++) {
      const sender = pool[i];
      const dailyTarget = getWarmupDailyTarget(sender, group);
      const sentToday = sender.warmup_sent_today || 0;
      const needed = Math.max(0, dailyTarget - sentToday);

      if (needed <= 0) continue;

      // Send to peers in the pool
      const peers = pool.filter((p) => p.id !== sender.id);
      if (peers.length === 0) continue;

      // Send 1 warmup email per tick to avoid spam burst
      const recipient = peers[Math.floor(Math.random() * peers.length)];

      const result = await executeWarmupSend(sender, recipient, group);
      if (result.success) {
        emailsSent++;
      } else if (result.error) {
        errors.push(`${sender.email_address} -> ${recipient.email_address}: ${result.error}`);
      }
    }
  }

  return {
    groupsProcessed: warmupGroups.length,
    inboxesWarmed,
    emailsSent,
    errors,
  };
}

/**
 * Retrieves aggregate warmup metrics and inbox statuses for the dashboard.
 */
export async function getWarmupStats(userId: string) {
  const accounts = await dbService.getEmailAccounts(userId);
  const groups = await dbService.getAccountGroups(userId);

  const warmupAccounts = accounts.filter((a) => a.warmup_enabled && a.status === 'active');
  const warmupGroups = groups.filter((g) => g.is_warmup_enabled);

  const sentToday = warmupAccounts.reduce((sum, a) => sum + (a.warmup_sent_today || 0), 0);
  const receivedToday = warmupAccounts.reduce((sum, a) => sum + (a.warmup_received_today || 0), 0);
  const totalSent = warmupAccounts.reduce((sum, a) => sum + (a.total_warmup_sent || 0), 0);
  const totalReceived = warmupAccounts.reduce((sum, a) => sum + (a.total_warmup_received || 0), 0);

  const replyRate = totalSent > 0 ? Math.round((totalReceived / totalSent) * 100) : 75;
  const avgReputation = warmupAccounts.length > 0
    ? Math.round(warmupAccounts.reduce((sum, a) => sum + (a.warmup_reputation_score || 100), 0) / warmupAccounts.length)
    : 100;

  return {
    warmupGroupsCount: warmupGroups.length,
    warmupAccountsCount: warmupAccounts.length,
    activeAccounts: warmupAccounts.length,
    sentToday,
    receivedToday,
    totalSent,
    totalWarmupSent: totalSent,
    totalReceived,
    totalWarmupReceived: totalReceived,
    replyRate,
    avgReputation,
    avgReputationScore: avgReputation,
    targetReplyRate: 70,
  };
}

