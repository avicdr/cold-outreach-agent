import { describe, it, expect, beforeEach } from 'vitest';
import { dbService } from '@/lib/db-service';
import { OWNER_USER_ID } from '@/lib/auth';
import { runWarmupCycle, getWarmupStats } from '@/lib/warmup/service';
import { mockDb } from '@/lib/supabase/mock-db';

describe('Daily Sent Count Refresh System', () => {
  const userId = OWNER_USER_ID;

  beforeEach(async () => {
    // Reset test accounts, groups, messages
    const accounts = await dbService.getEmailAccounts(userId);
    for (const acc of accounts) {
      await dbService.deleteEmailAccount(userId, acc.id);
    }
    const groups = await dbService.getAccountGroups(userId);
    for (const grp of groups) {
      await dbService.deleteAccountGroup(grp.id);
    }
    mockDb.warmupMessages.clear();
    mockDb.emailMessages.clear();
  });

  it('excludes yesterday warmup messages from warmup_sent_today and refreshes count to 0', async () => {
    const group = await dbService.createAccountGroup(userId, {
      name: 'Daily Refresh Test Group',
      is_warmup_enabled: true,
      warmup_daily_limit: 15,
      warmup_ramp_per_day: 2,
    });

    const acc1 = await dbService.upsertEmailAccount({
      user_id: userId,
      email_address: 'refresh1@domain.com',
      group_id: group.id,
      warmup_enabled: true,
      warmup_status: 'warming',
      warmup_day_count: 1,
      encrypted_access_token: 'mock-1',
    });

    const acc2 = await dbService.upsertEmailAccount({
      user_id: userId,
      email_address: 'refresh2@domain.com',
      group_id: group.id,
      warmup_enabled: true,
      warmup_status: 'warming',
      warmup_day_count: 1,
      encrypted_access_token: 'mock-2',
    });

    // Simulate warmup messages sent yesterday
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    mockDb.warmupMessages.set('msg-yesterday-1', {
      id: 'msg-yesterday-1',
      from_account_id: acc1.id,
      to_account_id: acc2.id,
      group_id: group.id,
      subject: 'Yesterday warmup',
      body_text: 'Body',
      status: 'sent',
      sent_at: yesterday,
      created_at: yesterday,
    });

    // Simulate warmup message sent today
    const nowIso = new Date().toISOString();
    mockDb.warmupMessages.set('msg-today-1', {
      id: 'msg-today-1',
      from_account_id: acc1.id,
      to_account_id: acc2.id,
      group_id: group.id,
      subject: 'Today warmup',
      body_text: 'Body',
      status: 'sent',
      sent_at: nowIso,
      created_at: nowIso,
    });

    // Query accounts via getEmailAccounts
    const accounts = await dbService.getEmailAccounts(userId);
    const refreshedAcc1 = accounts.find((a) => a.id === acc1.id);
    const refreshedAcc2 = accounts.find((a) => a.id === acc2.id);

    // acc1 only sent 1 message TODAY (yesterday's message is excluded)
    expect(refreshedAcc1?.warmup_sent_today).toBe(1);
    expect(refreshedAcc2?.warmup_sent_today).toBe(0);

    // Warmup stats should only count today's warmup sent
    const stats = await getWarmupStats(userId);
    expect(stats.sentToday).toBe(1);
  });

  it('runs peer warmup across unassigned inboxes when no groups exist', async () => {
    // Accounts with group_id = null
    const acc1 = await dbService.upsertEmailAccount({
      user_id: userId,
      email_address: 'unassigned1@domain.com',
      group_id: null,
      warmup_enabled: true,
      warmup_status: 'warming',
      warmup_day_count: 1,
      encrypted_access_token: 'mock-1',
    });

    const acc2 = await dbService.upsertEmailAccount({
      user_id: userId,
      email_address: 'unassigned2@domain.com',
      group_id: null,
      warmup_enabled: true,
      warmup_status: 'warming',
      warmup_day_count: 1,
      encrypted_access_token: 'mock-2',
    });

    const cycleResult = await runWarmupCycle(userId);
    expect(cycleResult.groupsProcessed).toBeGreaterThanOrEqual(1);
    expect(cycleResult.emailsSent).toBeGreaterThanOrEqual(1);
  });
});
