import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getValidGmailAccessToken, forceRefreshGmailAccessToken, executeWithGmailAuth } from './tokens';
import { encryptToken } from '../crypto';
import { EmailAccount } from '@/types/database';
import { dbService } from '../db-service';
import * as oauthModule from './oauth';

describe('Gmail Token Management & Auto-Refresh', () => {
  const sampleAccount: EmailAccount = {
    id: 'acc-test-1',
    user_id: 'user-test-1',
    provider: 'gmail',
    email_address: 'sender@example.com',
    daily_limit: 18,
    min_interval_minutes: 15,
    status: 'active',
    encrypted_access_token: encryptToken('plain-access-token-123'),
    encrypted_refresh_token: encryptToken('plain-refresh-token-456'),
    token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    granted_scopes: ['https://www.googleapis.com/auth/gmail.send'],
    last_sync_at: null,
    connected_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.spyOn(dbService, 'updateEmailAccount').mockImplementation(async (id, updates) => ({
      ...sampleAccount,
      id,
      ...updates,
    } as any));
  });

  it('returns valid decrypted access token when token is unexpired', async () => {
    const token = await getValidGmailAccessToken(sampleAccount);
    expect(token).toBe('plain-access-token-123');
  });

  it('automatically refreshes token when expired or within 5-minute safety window', async () => {
    const refreshSpy = vi.spyOn(oauthModule, 'refreshAccessToken').mockResolvedValueOnce({
      access_token: 'new-refreshed-access-token',
      expires_in: 3600,
    });

    const expiredAccount: EmailAccount = {
      ...sampleAccount,
      id: 'acc-expired-1',
      token_expires_at: new Date(Date.now() - 10000).toISOString(), // expired in past
    };

    const token = await getValidGmailAccessToken(expiredAccount);
    expect(token).toBe('new-refreshed-access-token');
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('marks account as error when refresh token is missing', async () => {
    const updateSpy = vi.spyOn(dbService, 'updateEmailAccount').mockResolvedValueOnce({} as any);

    const noRefreshAccount: EmailAccount = {
      ...sampleAccount,
      id: 'acc-no-refresh',
      encrypted_refresh_token: '',
      token_expires_at: new Date(Date.now() - 10000).toISOString(),
    };

    await expect(getValidGmailAccessToken(noRefreshAccount)).rejects.toThrow(
      /has no refresh token stored/
    );
    expect(updateSpy).toHaveBeenCalledWith('acc-no-refresh', { status: 'error' });
  });

  it('marks account as error and gives clear reconnect guidance when Google rejects refresh token', async () => {
    vi.spyOn(oauthModule, 'refreshAccessToken').mockRejectedValueOnce(
      new Error('Failed to refresh token: 400 {"error": "invalid_grant", "error_description": "Token has been expired or revoked."}')
    );
    const updateSpy = vi.spyOn(dbService, 'updateEmailAccount').mockResolvedValueOnce({} as any);

    const expiredAccount: EmailAccount = {
      ...sampleAccount,
      id: 'acc-revoked-1',
      token_expires_at: new Date(Date.now() - 10000).toISOString(),
    };

    await expect(forceRefreshGmailAccessToken(expiredAccount)).rejects.toThrow(
      /session has expired or been revoked.*Please reconnect in Settings -> Email Accounts/
    );
    expect(updateSpy).toHaveBeenCalledWith('acc-revoked-1', { status: 'error' });
  });

  it('executeWithGmailAuth retries once after 401 error and succeeds if refresh succeeds', async () => {
    vi.spyOn(oauthModule, 'refreshAccessToken').mockResolvedValueOnce({
      access_token: 'fresh-after-401-token',
      expires_in: 3600,
    });

    let attempts = 0;
    const result = await executeWithGmailAuth(sampleAccount, async (token) => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Gmail API send failed: 401 UNAUTHENTICATED Request had invalid authentication credentials.');
      }
      return `success with ${token}`;
    });

    expect(result).toBe('success with fresh-after-401-token');
    expect(attempts).toBe(2);
  });
});
