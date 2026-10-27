import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { getWarmupStats, runWarmupCycle } from '@/lib/warmup/service';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [stats, groups, accounts] = await Promise.all([
      getWarmupStats(user.id),
      dbService.getAccountGroups(user.id),
      dbService.getEmailAccounts(user.id),
    ]);

    return NextResponse.json({
      stats,
      groups,
      accounts: accounts.map((a) => ({
        id: a.id,
        email_address: a.email_address,
        sender_name: a.sender_name,
        group_id: a.group_id,
        status: a.status,
        warmup_enabled: Boolean(a.warmup_enabled),
        warmup_status: a.warmup_status || 'inactive',
        warmup_day_count: a.warmup_day_count || 1,
        warmup_sent_today: a.warmup_sent_today || 0,
        warmup_received_today: a.warmup_received_today || 0,
        total_warmup_sent: a.total_warmup_sent || 0,
        total_warmup_received: a.total_warmup_received || 0,
        warmup_reputation_score: a.warmup_reputation_score ?? 100,
      })),
    });
  } catch (err: unknown) {
    console.error('Error fetching warmup data:', err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'run_cycle') {
      const result = await runWarmupCycle(user.id);
      return NextResponse.json({ success: true, messagesSent: result.emailsSent, ...result });
    }

    if (action === 'toggle_group') {
      const { groupId, is_warmup_enabled, warmup_daily_limit, warmup_ramp_per_day, warmup_reply_rate } = body;
      if (!groupId) {
        return NextResponse.json({ error: 'Missing groupId' }, { status: 400 });
      }

      const existingGroup = await dbService.getAccountGroup(groupId);
      if (!existingGroup || existingGroup.user_id !== user.id) {
        return NextResponse.json({ error: 'Account group not found' }, { status: 404 });
      }

      const updates: Record<string, unknown> = {};
      if (typeof is_warmup_enabled === 'boolean') updates.is_warmup_enabled = is_warmup_enabled;
      if (typeof warmup_daily_limit === 'number') updates.warmup_daily_limit = warmup_daily_limit;
      if (typeof warmup_ramp_per_day === 'number') updates.warmup_ramp_per_day = warmup_ramp_per_day;
      if (typeof warmup_reply_rate === 'number') updates.warmup_reply_rate = warmup_reply_rate;

      const updatedGroup = await dbService.updateAccountGroup(groupId, updates);

      // If group warmup toggled, also sync member accounts warmup_enabled
      if (typeof is_warmup_enabled === 'boolean') {
        const memberAccounts = await dbService.getEmailAccounts(user.id, { groupId });
        for (const acc of memberAccounts) {
          await dbService.updateEmailAccount(acc.id, {
            warmup_enabled: is_warmup_enabled,
            warmup_status: is_warmup_enabled ? (acc.warmup_status === 'inactive' ? 'warming' : acc.warmup_status || 'warming') : 'inactive',
          });
        }
      }

      await dbService.logActivity(user.id, 'group_warmup_updated', 'account_groups', groupId, updates);

      return NextResponse.json({ success: true, group: updatedGroup });
    }

    if (action === 'toggle_account') {
      const { accountId, warmup_enabled, warmup_status } = body;
      if (!accountId) {
        return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
      }

      const existingAccount = await dbService.getEmailAccount(accountId);
      if (!existingAccount || existingAccount.user_id !== user.id) {
        return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
      }

      const updates: Record<string, unknown> = {};
      if (typeof warmup_enabled === 'boolean') {
        updates.warmup_enabled = warmup_enabled;
        updates.warmup_status = warmup_enabled ? 'warming' : 'inactive';
      }
      if (warmup_status) {
        updates.warmup_status = warmup_status;
      }

      const updatedAccount = await dbService.updateEmailAccount(accountId, updates);
      await dbService.logActivity(user.id, 'account_warmup_updated', 'email_accounts', accountId, updates);

      return NextResponse.json({ success: true, account: updatedAccount });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    console.error('Error handling warmup action:', err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
