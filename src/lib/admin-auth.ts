/**
 * Administrative Single-Owner Authentication Service
 * Strictly enforces single account login: avi@arenova.in / seekerop1@
 * Credentials configured via .env
 */

import { env } from './env';

export const ADMIN_COOKIE_NAME = 'admin_session';

export interface AdminSessionPayload {
  email: string;
  role: 'admin';
  iat: number;
  exp: number;
}

import { timingSafeEqualStr } from './security';

/**
 * Validates admin credentials against configured environment variables using constant-time comparison.
 */
export function verifyAdminCredentials(email?: string, password?: string): boolean {
  if (!email || !password) return false;

  const expectedEmail = (env.ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'avi@arenova.in').trim().toLowerCase();
  const expectedPassword = env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'seekerop1@';

  const providedEmail = email.trim().toLowerCase();
  const providedPassword = password;

  const emailMatch = timingSafeEqualStr(providedEmail, expectedEmail);
  const passwordMatch = timingSafeEqualStr(providedPassword, expectedPassword);

  return emailMatch && passwordMatch;
}

function base64UrlEncode(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str).toString('base64url');
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64url').toString('utf8');
  }
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Creates a signed JWT-style administrative session token.
 */
export async function createAdminSessionToken(email: string): Promise<string> {
  const secret = env.APP_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const now = Date.now();
  const payload: AdminSessionPayload = {
    email: email.trim().toLowerCase(),
    role: 'admin',
    iat: now,
    exp: now + 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const encoder = new TextEncoder();
  const key = await getHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const signatureB64 = arrayBufferToBase64Url(signatureBuffer);

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verifies a signed administrative session token.
 */
export async function verifyAdminSessionToken(token?: string | null): Promise<AdminSessionPayload | null> {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signatureB64] = parts;
  const secret = env.APP_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  try {
    const encoder = new TextEncoder();
    const key = await getHmacKey(secret);
    const expectedSigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
    const expectedSigB64 = arrayBufferToBase64Url(expectedSigBuffer);

    if (!timingSafeEqualStr(expectedSigB64, signatureB64)) {
      return null;
    }

    const jsonStr = base64UrlDecode(payloadB64);
    const payload: AdminSessionPayload = JSON.parse(jsonStr);

    if (!payload || payload.role !== 'admin' || !payload.exp) {
      return null;
    }

    if (Date.now() > payload.exp) {
      return null; // Expired
    }

    const expectedEmail = (env.ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'avi@arenova.in').trim().toLowerCase();
    if (payload.email.toLowerCase() !== expectedEmail) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
