import { EmailAccount } from '@/types/database';
import { decryptToken, encryptToken } from '../crypto';
import { refreshAccessToken } from './oauth';
import { dbService } from '../db-service';
import { env } from '../env';

/**
 * Returns a valid, non-expired decrypted access token for a Gmail account.
 * Automatically refreshes the token if expired or close to expiration (within 5 minutes).
 */
export async function getValidGmailAccessToken(emailAccount: EmailAccount): Promise<string> {
  const isMock = env.MOCK_MODE || emailAccount.encrypted_access_token?.startsWith('mock-');

  // If mock token without an explicit past expiration, return as-is
  if (isMock && (!emailAccount.token_expires_at || new Date(emailAccount.token_expires_at).getTime() > Date.now())) {
    return emailAccount.encrypted_access_token;
  }

  // Check if token is expired or within 5 minutes of expiring
  const expiresAtMs = emailAccount.token_expires_at
    ? new Date(emailAccount.token_expires_at).getTime()
    : 0;
  const isExpiringSoon = !expiresAtMs || expiresAtMs - Date.now() <= 5 * 60 * 1000;

  if (isExpiringSoon) {
    return await forceRefreshGmailAccessToken(emailAccount);
  }

  // Token is still within valid lifetime, decrypt and return
  try {
    return decryptToken(emailAccount.encrypted_access_token);
  } catch {
    if (isMock) {
      return emailAccount.encrypted_access_token;
    }
    // Corrupted access token - attempt refresh
    try {
      return await forceRefreshGmailAccessToken(emailAccount);
    } catch {
      await markAccountError(emailAccount.id);
      throw new Error(
        `Gmail account (${emailAccount.email_address}) credentials are invalid or corrupted. Please reconnect in Settings -> Email Accounts.`
      );
    }
  }
}

/**
 * Forces a token refresh against Google OAuth endpoints, updates the database,
 * and returns the new plain access token.
 */
export async function forceRefreshGmailAccessToken(emailAccount: EmailAccount): Promise<string> {
  const isMock = env.MOCK_MODE || emailAccount.encrypted_access_token?.startsWith('mock-');

  if (!emailAccount.encrypted_refresh_token) {
    await markAccountError(emailAccount.id);
    throw new Error(
      `Gmail account (${emailAccount.email_address}) has no refresh token stored. Please reconnect in Settings -> Email Accounts.`
    );
  }

  let refreshToken = '';
  try {
    refreshToken = decryptToken(emailAccount.encrypted_refresh_token);
  } catch {
    if (isMock) {
      refreshToken = emailAccount.encrypted_refresh_token;
    } else {
      await markAccountError(emailAccount.id);
      throw new Error(
        `Gmail account (${emailAccount.email_address}) has an invalid/corrupted refresh token. Please reconnect in Settings -> Email Accounts.`
      );
    }
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken);
    const newAccessToken = refreshed.access_token;
    const newExpiresAt = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString();

    const encryptedAccessToken = newAccessToken.startsWith('mock-')
      ? newAccessToken
      : encryptToken(newAccessToken);

    await dbService.updateEmailAccount(emailAccount.id, {
      encrypted_access_token: encryptedAccessToken,
      token_expires_at: newExpiresAt,
      status: 'active',
    });

    // Update in-memory object reference as well
    emailAccount.encrypted_access_token = encryptedAccessToken;
    emailAccount.token_expires_at = newExpiresAt;
    emailAccount.status = 'active';

    return newAccessToken;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isPermanentAuthFailure =
      errMsg.includes('invalid_grant') ||
      errMsg.includes('revoked') ||
      errMsg.includes('expired') ||
      errMsg.includes('400') ||
      errMsg.includes('401') ||
      errMsg.includes('unauthorized_client');

    if (isPermanentAuthFailure) {
      await markAccountError(emailAccount.id);
      throw new Error(
        `Gmail account (${emailAccount.email_address}) session has expired or been revoked (${errMsg}). Please reconnect in Settings -> Email Accounts.`
      );
    }

    throw new Error(`Failed to refresh Gmail token for ${emailAccount.email_address}: ${errMsg}`);
  }
}

/**
 * Executes a Gmail API operation with automatic token management and auto-retry on 401.
 */
export async function executeWithGmailAuth<T>(
  emailAccount: EmailAccount,
  apiCall: (accessToken: string) => Promise<T>
): Promise<T> {
  let accessToken = await getValidGmailAccessToken(emailAccount);

  try {
    return await apiCall(accessToken);
  } catch (sendErr: unknown) {
    const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
    const isAuthError =
      errMsg.includes('401') ||
      errMsg.includes('UNAUTHENTICATED') ||
      errMsg.includes('Invalid Credentials') ||
      errMsg.includes('authError');

    if (isAuthError && emailAccount.encrypted_refresh_token) {
      console.warn(`[GmailAuth] 401 unauthenticated for ${emailAccount.email_address}. Attempting forced refresh.`);
      try {
        accessToken = await forceRefreshGmailAccessToken(emailAccount);
        return await apiCall(accessToken);
      } catch (retryErr: unknown) {
        await markAccountError(emailAccount.id);
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        throw new Error(
          `Gmail account (${emailAccount.email_address}) authentication failed (401). Token could not be refreshed (${retryMsg}). Please reconnect in Settings -> Email Accounts.`
        );
      }
    }

    throw sendErr;
  }
}

async function markAccountError(accountId: string) {
  try {
    await dbService.updateEmailAccount(accountId, { status: 'error' });
  } catch (updateErr) {
    console.error(`Failed to mark account ${accountId} as error:`, updateErr);
  }
}
