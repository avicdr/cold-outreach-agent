import { NextRequest, NextResponse } from 'next/server';
import { validateOAuthState, exchangeCodeForTokens, getGmailUserProfile } from '@/lib/gmail/oauth';
import { encryptToken } from '@/lib/crypto';
import { dbService } from '@/lib/db-service';
import { env } from '@/lib/env';

function getPublicOrigin(request: NextRequest, redirectUri?: string): string {
  // 1. If state redirectUri has a public origin (e.g. https://outreacher.arenova.in)
  if (redirectUri) {
    try {
      const u = new URL(redirectUri);
      if (!u.hostname.includes('localhost') && !u.port) {
        return u.origin;
      }
    } catch {}
  }

  // 2. Check x-forwarded headers (Render, Cloudflare, Vercel, ALB)
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost && !forwardedHost.includes('10000') && !forwardedHost.includes('localhost:')) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  // 3. Fallback to NEXT_PUBLIC_APP_URL if not pointing to internal port
  if (env.NEXT_PUBLIC_APP_URL && !env.NEXT_PUBLIC_APP_URL.includes('10000')) {
    return env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }

  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const stateValidation = state ? validateOAuthState(state) : { isValid: false };
  const returnTo = (stateValidation.isValid && stateValidation.returnTo) ? stateValidation.returnTo : '/accounts';
  const origin = getPublicOrigin(request, stateValidation.redirectUri);

  if (error) {
    return NextResponse.redirect(`${origin}${returnTo}?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}${returnTo}?error=missing_code_or_state`);
  }

  if (!stateValidation.isValid || !stateValidation.userId) {
    return NextResponse.redirect(`${origin}${returnTo}?error=invalid_or_expired_state`);
  }

  const userId = stateValidation.userId;

  try {
    const tokens = await exchangeCodeForTokens(code, stateValidation.redirectUri);
    const profile = await getGmailUserProfile(tokens.access_token);
    const normalizedEmail = (profile.emailAddress || '').toLowerCase().trim();

    if (!normalizedEmail) {
      throw new Error('Google account did not return a valid email address');
    }

    // Check if an existing account exists to preserve its valid refresh token if Google omitted it
    const existingAccounts = await dbService.getEmailAccounts(userId);
    const existing = existingAccounts.find(
      (a) => a.email_address.toLowerCase() === normalizedEmail.toLowerCase()
    );

    // Encrypt sensitive tokens
    const encryptedAccessToken = encryptToken(tokens.access_token);
    let encryptedRefreshToken = '';

    if (tokens.refresh_token) {
      encryptedRefreshToken = encryptToken(tokens.refresh_token);
    } else if (existing?.encrypted_refresh_token && existing.encrypted_refresh_token !== existing.encrypted_access_token) {
      // Preserve existing valid refresh token
      encryptedRefreshToken = existing.encrypted_refresh_token;
    } else {
      encryptedRefreshToken = existing?.encrypted_refresh_token || '';
    }

    if (!encryptedRefreshToken) {
      return NextResponse.redirect(
        `${origin}${returnTo}?error=${encodeURIComponent(
          'Google did not return an offline refresh token. Please remove cold outreach agent access at myaccount.google.com/permissions and reconnect to grant offline access.'
        )}`
      );
    }

    const tokenExpiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
    const grantedScopes = tokens.scope ? tokens.scope.split(' ') : [];

    await dbService.upsertEmailAccount({
      user_id: userId,
      provider: 'gmail',
      status: 'active',
      email_address: normalizedEmail,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      token_expires_at: tokenExpiresAt,
      granted_scopes: grantedScopes,
      last_sync_at: new Date().toISOString(),
      connected_at: new Date().toISOString(),
    });

    await dbService.logActivity(userId, 'gmail_connected', 'email_accounts', null, {
      email: normalizedEmail,
    });

    return NextResponse.redirect(`${origin}${returnTo}?connected=true&email=${encodeURIComponent(normalizedEmail)}`);
  } catch (err: unknown) {
    console.error('OAuth callback exchange error:', err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(`${origin}${returnTo}?error=${encodeURIComponent(errorMsg)}`);
  }
}

