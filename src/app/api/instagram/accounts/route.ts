import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { encryptToken } from '@/lib/crypto';
import { sanitizeInstagramAccountForClient } from '@/lib/security';
import { instagramDb } from '@/lib/instagram/db';
import {
  loginWithInstagramCredentials,
  verifyInstagramSession,
  verifyInstagramGraphApi,
} from '@/lib/instagram/client';
import { normalizeInstagramHandle } from '@/lib/instagram/handles';
import { z } from 'zod';

const connectAccountSchema = z.object({
  auth_method: z.enum(['login', 'session', 'graph_api']),
  username: z.string().optional().default(''),
  password: z.string().optional().default(''),
  two_factor_code: z.string().optional(),
  two_factor_identifier: z.string().optional(),
  sessionid: z.string().optional().default(''),
  csrftoken: z.string().optional().default(''),
  ds_user_id: z.string().optional().default(''),
  ig_user_id: z.string().optional().default(''),
  access_token: z.string().optional().default(''),
  daily_limit: z.number().int().min(1).max(100).default(25),
  min_interval_minutes: z.number().int().min(1).max(120).default(10),
});

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = await instagramDb.getInstagramAccountDailyStats(user.id);
    return NextResponse.json({
      accounts: stats.accounts.map(sanitizeInstagramAccountForClient),
      stats: {
        totalAccounts: stats.totalAccounts,
        activeAccounts: stats.activeAccounts,
        dailyCapacity: stats.dailyCapacity,
        sentToday: stats.sentToday,
        remainingToday: stats.remainingToday,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = connectAccountSchema.parse(body);

    let resolvedUsername = normalizeInstagramHandle(validated.username);
    let displayName = resolvedUsername;
    let igUserId: string | null = null;
    let encryptedSessionId: string | null = null;
    let encryptedCookiesJson: string | null = null;
    let encryptedPassword: string | null = null;
    let encryptedAccessToken: string | null = null;

    if (validated.auth_method === 'login') {
      if (!resolvedUsername || !validated.password) {
        return NextResponse.json(
          { error: 'Instagram username and password are required.' },
          { status: 400 }
        );
      }

      const loginResult = await loginWithInstagramCredentials(resolvedUsername, validated.password, {
        twoFactorCode: validated.two_factor_code,
        twoFactorIdentifier: validated.two_factor_identifier,
      });

      if (loginResult.status === 'two_factor_required') {
        return NextResponse.json(
          {
            requires_two_factor: true,
            two_factor_identifier: loginResult.twoFactorIdentifier,
            username: resolvedUsername,
            error: loginResult.error || 'Two-factor authentication code required.',
          },
          { status: 202 }
        );
      }

      if (loginResult.status === 'challenge_required') {
        return NextResponse.json(
          {
            challenge_required: true,
            checkpoint_url: loginResult.checkpointUrl,
            error: loginResult.error,
          },
          { status: 400 }
        );
      }

      if (loginResult.status !== 'authenticated' || !loginResult.cookies?.sessionid) {
        return NextResponse.json(
          { error: loginResult.error || 'Instagram login failed.' },
          { status: 400 }
        );
      }

      resolvedUsername = loginResult.username || resolvedUsername;
      displayName = loginResult.displayName || resolvedUsername;
      igUserId = loginResult.igUserId || loginResult.cookies.ds_user_id || null;
      encryptedSessionId = encryptToken(loginResult.cookies.sessionid);
      encryptedCookiesJson = encryptToken(JSON.stringify(loginResult.cookies));
      encryptedPassword = encryptToken(validated.password);
    } else if (validated.auth_method === 'session') {
      if (!validated.sessionid.trim()) {
        return NextResponse.json({ error: 'Instagram sessionid cookie is required.' }, { status: 400 });
      }

      const verified = await verifyInstagramSession(
        {
          sessionid: validated.sessionid.trim(),
          csrftoken: validated.csrftoken.trim() || undefined,
          ds_user_id: validated.ds_user_id.trim() || undefined,
        },
        resolvedUsername || undefined
      );

      if (!verified.valid || !verified.cookies?.sessionid) {
        return NextResponse.json(
          { error: verified.error || 'Could not verify Instagram session cookie.' },
          { status: 400 }
        );
      }

      resolvedUsername = verified.username || resolvedUsername;
      if (!resolvedUsername) {
        return NextResponse.json(
          {
            error:
              'Could not determine Instagram username from session. Please enter your Instagram handle in the Handle field alongside your sessionid.',
          },
          { status: 400 }
        );
      }
      displayName = verified.displayName || resolvedUsername;
      igUserId = verified.igUserId || verified.cookies.ds_user_id || null;
      encryptedSessionId = encryptToken(verified.cookies.sessionid);
      encryptedCookiesJson = encryptToken(JSON.stringify(verified.cookies));
    } else if (validated.auth_method === 'graph_api') {
      if (!validated.ig_user_id.trim() || !validated.access_token.trim()) {
        return NextResponse.json(
          { error: 'Instagram Business Account ID and Access Token are required.' },
          { status: 400 }
        );
      }

      const verified = await verifyInstagramGraphApi(
        validated.ig_user_id.trim(),
        validated.access_token.trim()
      );
      if (!verified.valid) {
        return NextResponse.json(
          { error: verified.error || 'Meta Graph API verification failed.' },
          { status: 400 }
        );
      }

      resolvedUsername = verified.username || resolvedUsername || validated.ig_user_id.trim();
      displayName = verified.displayName || resolvedUsername;
      igUserId = verified.igUserId || validated.ig_user_id.trim();
      encryptedAccessToken = encryptToken(validated.access_token.trim());
    }

    const account = await instagramDb.upsertInstagramAccount({
      user_id: user.id,
      username: resolvedUsername,
      display_name: displayName,
      ig_user_id: igUserId,
      auth_method: validated.auth_method,
      encrypted_session_id: encryptedSessionId,
      encrypted_cookies_json: encryptedCookiesJson,
      encrypted_password: encryptedPassword,
      encrypted_access_token: encryptedAccessToken,
      daily_limit: validated.daily_limit,
      min_interval_minutes: validated.min_interval_minutes,
      status: 'active',
      last_error: null,
    });

    await dbService.logActivity(user.id, 'instagram_account_connected', 'instagram_accounts', account.id, {
      username: account.username,
      auth_method: account.auth_method,
    });

    return NextResponse.json(
      { success: true, account: sanitizeInstagramAccountForClient(account) },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
