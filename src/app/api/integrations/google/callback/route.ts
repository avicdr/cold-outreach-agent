import { NextRequest, NextResponse } from 'next/server';
import { validateOAuthState, exchangeCodeForTokens, getGmailUserProfile } from '@/lib/gmail/oauth';
import { encryptToken } from '@/lib/crypto';
import { dbService } from '@/lib/db-service';
import { env } from '@/lib/env';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/settings?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/settings?error=missing_code_or_state`);
  }

  const stateValidation = validateOAuthState(state);
  if (!stateValidation.isValid || !stateValidation.userId) {
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/settings?error=invalid_or_expired_state`);
  }

  const userId = stateValidation.userId;

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await getGmailUserProfile(tokens.access_token);

    // Encrypt sensitive tokens
    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : encryptedAccessToken; // Refresh token may be omitted on re-approval if not prompted

    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const grantedScopes = tokens.scope ? tokens.scope.split(' ') : [];

    await dbService.upsertEmailAccount({
      user_id: userId,
      provider: 'gmail',
      email_address: profile.emailAddress,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      token_expires_at: tokenExpiresAt,
      granted_scopes: grantedScopes,
      last_sync_at: new Date().toISOString(),
      connected_at: new Date().toISOString(),
    });

    await dbService.logActivity(userId, 'gmail_connected', 'email_accounts', null, {
      email: profile.emailAddress,
    });

    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/settings?connected=true`);
  } catch (err: unknown) {
    console.error('OAuth callback exchange error:', err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/settings?error=${encodeURIComponent(errorMsg)}`);
  }
}
