import crypto from 'crypto';
import { env } from './env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Returns the 32-byte Buffer key for AES-256.
 * Supports both 64-character hex strings or raw 32-character strings.
 */
function getEncryptionKey(): Buffer {
  const keyString = env.APP_ENCRYPTION_KEY || process.env.APP_ENCRYPTION_KEY;
  if (!keyString) {
    throw new Error('APP_ENCRYPTION_KEY environment variable is missing.');
  }

  // If 64 hex characters (32 bytes in hex)
  if (/^[0-9a-fA-F]{64}$/.test(keyString)) {
    return Buffer.from(keyString, 'hex');
  }

  // If 44 base64 characters (32 bytes in base64)
  if (keyString.length === 44 && /^[A-Za-z0-9+/=]+$/.test(keyString)) {
    const buf = Buffer.from(keyString, 'base64');
    if (buf.length === 32) return buf;
  }

  // Fallback to hashing the string to derive a deterministic 32-byte key
  return crypto.createHash('sha256').update(keyString).digest();
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Output format: iv:authTag:ciphertext (hex encoded)
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty token');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * Validates integrity via authentication tag.
 */
export function decryptToken(encryptedPayload: string): string {
  if (!encryptedPayload) {
    throw new Error('Cannot decrypt empty payload');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format. Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, cipherTextHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherTextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
