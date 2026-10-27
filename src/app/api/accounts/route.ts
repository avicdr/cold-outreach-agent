import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { encryptToken } from '@/lib/crypto';
import { sanitizeAccountForClient } from '@/lib/security';
import { z } from 'zod';

const createAccountSchema = z.object({
  email_address: z.string().email('Invalid email address'),
  sender_name: z.string().optional().default(''),
  group_id: z.string().uuid().nullable().optional(),
  daily_limit: z.number().int().min(1).max(18).default(18),
  min_interval_minutes: z.number().int().min(5).max(60).default(15),
  provider: z.string().default('gmail'),
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  smtp_host: z.string().optional().nullable(),
  smtp_port: z.number().int().min(1).max(65535).optional().nullable(),
  smtp_secure: z.boolean().optional().nullable(),
  smtp_username: z.string().optional().nullable(),
  smtp_password: z.string().optional().nullable(),
  imap_host: z.string().optional().nullable(),
  imap_port: z.number().int().min(1).max(65535).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('groupId') || undefined;
  const status = searchParams.get('status') || undefined;

  try {
    const [stats, groups] = await Promise.all([
      dbService.getAccountDailyStats(user.id),
      dbService.getAccountGroups(user.id),
    ]);

    let filteredAccounts = stats.accounts;
    if (groupId) {
      filteredAccounts = filteredAccounts.filter((a) => a.group_id === groupId);
    }
    if (status) {
      filteredAccounts = filteredAccounts.filter((a) => a.status === status);
    }

    const sanitizedAccounts = filteredAccounts.map(sanitizeAccountForClient);

    return NextResponse.json({
      accounts: sanitizedAccounts,
      stats: {
        totalAccounts: stats.totalAccounts,
        activeAccounts: stats.activeAccounts,
        dailyCapacity: stats.dailyCapacity,
        sentToday: stats.sentToday,
        remainingToday: stats.remainingToday,
      },
      groups,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = createAccountSchema.parse(body);

    const isSmtp = validated.provider === 'smtp';
    const smtpPassword = validated.smtp_password || '';
    const encryptedSmtpPassword = smtpPassword ? encryptToken(smtpPassword) : null;

    const token = isSmtp
      ? (smtpPassword || `mock-token-${Date.now()}`)
      : (validated.access_token || `mock-token-${Date.now()}`);
    const refreshToken = validated.refresh_token || `mock-refresh-${Date.now()}`;

    const encryptedAccessToken = encryptToken(token);
    const encryptedRefreshToken = encryptToken(refreshToken);

    const account = await dbService.upsertEmailAccount({
      user_id: user.id,
      email_address: validated.email_address.toLowerCase().trim(),
      sender_name: validated.sender_name.trim(),
      group_id: validated.group_id || null,
      daily_limit: Math.min(18, Math.max(1, validated.daily_limit)),
      min_interval_minutes: validated.min_interval_minutes,
      provider: validated.provider,
      status: 'active',
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      granted_scopes: isSmtp
        ? ['smtp']
        : ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
      last_sync_at: new Date().toISOString(),
      connected_at: new Date().toISOString(),
      smtp_host: validated.smtp_host || (isSmtp ? 'smtp.titan.email' : null),
      smtp_port: validated.smtp_port ?? (isSmtp ? 465 : null),
      smtp_secure: validated.smtp_secure ?? (validated.smtp_port === 465 || !validated.smtp_port),
      smtp_username: validated.smtp_username || (isSmtp ? validated.email_address.toLowerCase().trim() : null),
      encrypted_smtp_password: encryptedSmtpPassword || encryptedAccessToken,
      imap_host: validated.imap_host || (isSmtp ? 'imap.titan.email' : null),
      imap_port: validated.imap_port ?? (isSmtp ? 993 : null),
    });

    await dbService.logActivity(user.id, 'account_added', 'email_accounts', account.id, {
      email: account.email_address,
      daily_limit: account.daily_limit,
      group_id: account.group_id,
    });

    return NextResponse.json({ success: true, account: sanitizeAccountForClient(account) }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
