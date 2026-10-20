import crypto from 'crypto';
import { env } from '../env';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
];

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface GoogleUserProfile {
  emailAddress: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId?: string;
}

/**
 * Generates an HMAC-signed OAuth state parameter to prevent CSRF and guarantee redirect_uri match.
 */
export function generateOAuthState(userId: string, redirectUri?: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  const rUriB64 = redirectUri ? Buffer.from(redirectUri).toString('base64url') : '';
  const payload = `${userId}:${nonce}:${timestamp}:${rUriB64}`;
  const hmac = crypto.createHmac('sha256', env.APP_ENCRYPTION_KEY).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

/**
 * Validates the OAuth state parameter and returns the userId and matched redirectUri if valid.
 */
export function validateOAuthState(state: string): { isValid: boolean; userId?: string; redirectUri?: string } {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split(':');

    // 5-part format with embedded redirectUri
    if (parts.length === 5) {
      const [userId, nonce, timestampStr, rUriB64, hmacSignature] = parts;
      const timestamp = parseInt(timestampStr, 10);
      const fifteenMinutes = 15 * 60 * 1000;

      if (Date.now() - timestamp > fifteenMinutes) {
        return { isValid: false };
      }

      const payload = `${userId}:${nonce}:${timestampStr}:${rUriB64}`;
      const expectedHmac = crypto.createHmac('sha256', env.APP_ENCRYPTION_KEY).update(payload).digest('hex');

      const sigBuf = Buffer.from(hmacSignature);
      const expBuf = Buffer.from(expectedHmac);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return { isValid: false };
      }

      const redirectUri = rUriB64 ? Buffer.from(rUriB64, 'base64url').toString('utf8') : undefined;
      return { isValid: true, userId, redirectUri };
    }

    // 4-part legacy format
    if (parts.length === 4) {
      const [userId, nonce, timestampStr, hmacSignature] = parts;
      const timestamp = parseInt(timestampStr, 10);
      const fifteenMinutes = 15 * 60 * 1000;

      if (Date.now() - timestamp > fifteenMinutes) {
        return { isValid: false };
      }

      const payload = `${userId}:${nonce}:${timestampStr}`;
      const expectedHmac = crypto.createHmac('sha256', env.APP_ENCRYPTION_KEY).update(payload).digest('hex');

      const sigBuf = Buffer.from(hmacSignature);
      const expBuf = Buffer.from(expectedHmac);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return { isValid: false };
      }

      return { isValid: true, userId };
    }

    return { isValid: false };
  } catch {
    return { isValid: false };
  }
}

/**
 * Constructs Google OAuth 2.0 Authorization URL.
 */
export function getGoogleAuthUrl(userId: string, redirectUriOverride?: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID;
  const redirectUri = redirectUriOverride || process.env.GOOGLE_REDIRECT_URI || env.GOOGLE_REDIRECT_URI;

  if (!clientId || clientId === 'mock-client-id') {
    throw new Error('GOOGLE_CLIENT_ID is not configured in .env.local. Please provide a valid OAuth client ID from Google Cloud Console.');
  }

  const state = generateOAuthState(userId, redirectUri);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline', // Requests refresh_token
    prompt: 'consent', // Forces refresh_token issuance on reconnect
    state,
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchanges authorization code for access and refresh tokens.
 */
export async function exchangeCodeForTokens(code: string, redirectUriOverride?: string): Promise<GoogleTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET;
  const redirectUri = redirectUriOverride || process.env.GOOGLE_REDIRECT_URI || env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || clientId === 'mock-client-id') {
    if (env.MOCK_MODE) {
      return {
        access_token: 'mock-access-token-' + crypto.randomBytes(8).toString('hex'),
        refresh_token: 'mock-refresh-token-' + crypto.randomBytes(16).toString('hex'),
        expires_in: 3600,
        scope: GMAIL_SCOPES.join(' '),
        token_type: 'Bearer',
      };
    }
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env.local');
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to exchange code for tokens: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Refreshes an expired access token using the stored refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const clientId = process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId === 'mock-client-id') {
    if (env.MOCK_MODE) {
      return {
        access_token: 'refreshed-mock-access-token-' + crypto.randomBytes(8).toString('hex'),
        expires_in: 3600,
      };
    }
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env.local');
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 3600,
  };
}

/**
 * Fetches user profile from Gmail API to identify the connected email address.
 */
export async function getGmailUserProfile(accessToken: string): Promise<GoogleUserProfile> {
  if (env.MOCK_MODE || accessToken.startsWith('mock-') || accessToken.startsWith('refreshed-mock-')) {
    return {
      emailAddress: 'owner@business.com',
      messagesTotal: 120,
      threadsTotal: 45,
      historyId: '10001',
    };
  }

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Gmail profile: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Revokes Google OAuth token.
 */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  if (env.MOCK_MODE || token.startsWith('mock-')) {
    return true;
  }

  try {
    const response = await fetch(`${GOOGLE_REVOKE_ENDPOINT}?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.ok;
  } catch {
    return false;
  }
}
