import { describe, it, expect, beforeEach } from 'vitest';
import { dbService } from '@/lib/db-service';
import { OWNER_USER_ID } from '@/lib/auth';
import { getWarmupDailyTarget, runWarmupCycle, getWarmupStats } from '@/lib/warmup/service';
import { GET as warmupGet, POST as warmupPost } from '@/app/api/warmup/route';
import { POST as googleConnectPost } from '@/app/api/integrations/google/connect/route';
import { validateOAuthState } from '@/lib/gmail/oauth';
import { NextRequest } from 'next/server';

describe('Warmup Pool & Multi-Account OAuth', () => {
  const userId = OWNER_USER_ID;

  beforeEach(async () => {
    // Reset test accounts and groups
    const accounts = await dbService.getEmailAccounts(userId);
    for (const acc of accounts) {
      await dbService.deleteEmailAccount(userId, acc.id);
    }
    const groups = await dbService.getAccountGroups(userId);
    for (const grp of groups) {
      await dbService.deleteAccountGroup(grp.id);
    }
  });

  it('calculates daily warmup target correctly with progressive ramp-up', () => {
    const group = {
      id: 'test-group',
      user_id: userId,
      name: 'Warmup Group',
      description: '',
      is_warmup_enabled: true,
      warmup_daily_limit: 15,
      warmup_ramp_per_day: 2,
      warmup_reply_rate: 70,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Day 1: 1 * 2 = 2
    expect(getWarmupDailyTarget({ warmup_day_count: 1 }, group)).toBe(2);

    // Day 2: 2 * 2 = 4
    expect(getWarmupDailyTarget({ warmup_day_count: 2 }, group)).toBe(4);

    // Day 5: 5 * 2 = 10
    expect(getWarmupDailyTarget({ warmup_day_count: 5 }, group)).toBe(10);

    // Day 10: 10 * 2 = 20, capped at limit 15
    expect(getWarmupDailyTarget({ warmup_day_count: 10 }, group)).toBe(15);
  });

  it('runs peer warmup cycle between accounts in the same warmup group', async () => {
    // 1. Create a warmup-enabled group
    const group = await dbService.createAccountGroup(userId, {
      name: 'Alpha Warmup Pool',
      is_warmup_enabled: true,
      warmup_daily_limit: 15,
      warmup_ramp_per_day: 2,
      warmup_reply_rate: 100, // 100% reply rate for deterministic test
    });

    // 2. Add 2 inboxes to the group
    const acc1 = await dbService.upsertEmailAccount({
      user_id: userId,
      email_address: 'warmup1@domain.com',
      sender_name: 'Warmup Inbox 1',
      group_id: group.id,
      warmup_enabled: true,
      warmup_status: 'warming',
      warmup_day_count: 1,
      encrypted_access_token: 'mock-token-1',
      encrypted_refresh_token: 'mock-refresh-1',
    });

    const acc2 = await dbService.upsertEmailAccount({
      user_id: userId,
      email_address: 'warmup2@domain.com',
      sender_name: 'Warmup Inbox 2',
      group_id: group.id,
      warmup_enabled: true,
      warmup_status: 'warming',
      warmup_day_count: 1,
      encrypted_access_token: 'mock-token-2',
      encrypted_refresh_token: 'mock-refresh-2',
    });

    expect(acc1.group_id).toBe(group.id);
    expect(acc2.group_id).toBe(group.id);

    // 3. Run warmup cycle
    const cycleResult = await runWarmupCycle(userId);
    expect(cycleResult.groupsProcessed).toBe(1);
    expect(cycleResult.emailsSent).toBeGreaterThanOrEqual(1);

    // 4. Check warmup stats
    const stats = await getWarmupStats(userId);
    expect(stats.activeAccounts).toBe(2);
    expect(stats.totalWarmupSent).toBeGreaterThanOrEqual(1);
  });

  it('handles /api/warmup GET and POST requests', async () => {
    // 1. Create group and account
    const group = await dbService.createAccountGroup(userId, {
      name: 'API Test Pool',
      is_warmup_enabled: true,
    });

    const acc = await dbService.upsertEmailAccount({
      user_id: userId,
      email_address: 'api-inbox@domain.com',
      group_id: group.id,
      warmup_enabled: true,
    });

    // 2. Test GET endpoint
    const getRes = await warmupGet();
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.stats).toBeDefined();
    expect(getData.groups.length).toBeGreaterThanOrEqual(1);

    // 3. Test toggle_account action via POST
    const toggleReq = new NextRequest('http://localhost:3000/api/warmup', {
      method: 'POST',
      body: JSON.stringify({
        action: 'toggle_account',
        accountId: acc.id,
        warmup_enabled: false,
      }),
    });
    const postRes = await warmupPost(toggleReq);
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.success).toBe(true);
    expect(postData.account.warmup_enabled).toBe(false);
  });

  it('Google OAuth connect generates account chooser parameter and encodes returnTo', async () => {
    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    const originalRedirectUri = process.env.GOOGLE_REDIRECT_URI;
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/integrations/google/callback';

    try {
      const connectReq = new NextRequest('http://localhost:3000/api/integrations/google/connect', {
        method: 'POST',
        body: JSON.stringify({ returnTo: '/accounts' }),
      });

      const res = await googleConnectPost(connectReq);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toBeDefined();

      // Verify account selection prompt is included
      expect(data.url).toContain('select_account');

      // Verify returnTo is encoded in OAuth state
      const parsedUrl = new URL(data.url);
      const stateParam = parsedUrl.searchParams.get('state');
      expect(stateParam).toBeTruthy();

      const stateValidation = validateOAuthState(stateParam!);
      expect(stateValidation.isValid).toBe(true);
      expect(stateValidation.userId).toBe(userId);
      expect(stateValidation.returnTo).toBe('/accounts');
    } finally {
      process.env.GOOGLE_CLIENT_ID = originalClientId;
      process.env.GOOGLE_REDIRECT_URI = originalRedirectUri;
    }
  });
});

