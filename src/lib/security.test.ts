import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from './crypto';
import { generateUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token';

describe('Security & Cryptography Utilities', () => {
  it('encrypts and decrypts OAuth tokens using AES-256-GCM', () => {
    const originalToken = 'ya29.a0AfH6SMA-test-google-oauth-token-1234567890';
    const encrypted = encryptToken(originalToken);

    expect(encrypted).not.toBe(originalToken);
    expect(encrypted.split(':').length).toBe(3); // iv : authTag : ciphertext

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(originalToken);
  });

  it('fails decryption if encrypted payload is tampered', () => {
    const originalToken = 'secret-refresh-token';
    const encrypted = encryptToken(originalToken);
    const parts = encrypted.split(':');
    
    // Invert first character of auth tag to guarantee tampering
    parts[1] = parts[1][0] === '0' ? '1' + parts[1].slice(1) : '0' + parts[1].slice(1);
    const tampered = parts.join(':');

    expect(() => decryptToken(tampered)).toThrow();
  });

  it('generates and verifies tamper-proof unsubscribe tokens', () => {
    const payload = {
      userId: 'user-uuid-123',
      leadId: 'lead-uuid-456',
      normalizedEmail: 'prospect@acme.com',
      campaignId: 'campaign-uuid-789',
    };

    const token = generateUnsubscribeToken(payload);
    expect(typeof token).toBe('string');
    expect(token).toContain('.');

    const verified = verifyUnsubscribeToken(token);
    expect(verified.userId).toBe(payload.userId);
    expect(verified.leadId).toBe(payload.leadId);
    expect(verified.normalizedEmail).toBe(payload.normalizedEmail);
    expect(verified.campaignId).toBe(payload.campaignId);
  });

  it('rejects tampered unsubscribe tokens', () => {
    const payload = {
      userId: 'user-uuid-123',
      leadId: 'lead-uuid-456',
      normalizedEmail: 'prospect@acme.com',
    };

    const token = generateUnsubscribeToken(payload);
    const [b64Data] = token.split('.');
    const tamperedToken = `${b64Data}.tamperedSignature123`;

    expect(() => verifyUnsubscribeToken(tamperedToken)).toThrow('Invalid or tampered unsubscribe token');
  });
});
