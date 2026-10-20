import crypto from 'crypto';
import { env } from './env';

export interface UnsubscribePayload {
  userId: string;
  leadId: string;
  normalizedEmail: string;
  campaignId?: string;
  issuedAt: number;
}

function getSecret(): string {
  return env.UNSUBSCRIBE_SECRET || env.APP_ENCRYPTION_KEY || 'default-secret-salt';
}

/**
 * Creates a signed, base64url-encoded unsubscribe token.
 */
export function generateUnsubscribeToken(data: Omit<UnsubscribePayload, 'issuedAt'>): string {
  const payload: UnsubscribePayload = {
    ...data,
    issuedAt: Date.now(),
  };

  const jsonStr = JSON.stringify(payload);
  const dataB64 = Buffer.from(jsonStr, 'utf8').toString('base64url');
  
  const hmac = crypto.createHmac('sha256', getSecret());
  hmac.update(dataB64);
  const signature = hmac.digest('base64url');

  return `${dataB64}.${signature}`;
}

/**
 * Verifies a token and returns the parsed payload.
 * Throws an error if invalid or tampered with.
 */
export function verifyUnsubscribeToken(token: string): UnsubscribePayload {
  if (!token || typeof token !== 'string') {
    throw new Error('Missing unsubscribe token');
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid token format');
  }

  const [dataB64, signature] = parts;
  const hmac = crypto.createHmac('sha256', getSecret());
  hmac.update(dataB64);
  const expectedSignature = hmac.digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedSigBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
    throw new Error('Invalid or tampered unsubscribe token');
  }

  try {
    const jsonStr = Buffer.from(dataB64, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr) as UnsubscribePayload;
    if (!parsed.leadId || !parsed.normalizedEmail || !parsed.userId) {
      throw new Error('Incomplete token payload');
    }
    return parsed;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to decode token payload: ${msg}`);
  }
}
