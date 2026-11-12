import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { decryptToken, encryptToken } from '@/lib/crypto';
import { sanitizeInstagramAccountForClient } from '@/lib/security';
import { instagramDb } from '@/lib/instagram/db';
import {
  extractCookiesFromAccount,
  verifyInstagramSession,
  verifyInstagramGraphApi,
} from '@/lib/instagram/client';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const account = await instagramDb.getInstagramAccount(id);
  if (!account || account.user_id !== user.id) {
    return NextResponse.json({ error: 'Instagram account not found' }, { status: 404 });
  }

  try {
    if (account.auth_method === 'graph_api') {
      if (!account.encrypted_access_token || !account.ig_user_id) {
        return NextResponse.json({ error: 'Missing Graph API token or IG User ID' }, { status: 400 });
      }
      const token = decryptToken(account.encrypted_access_token);
      const verified = await verifyInstagramGraphApi(account.ig_user_id, token);
      if (!verified.valid) {
        const updated = await instagramDb.updateInstagramAccount(id, {
          status: 'error',
          last_error: verified.error || 'Verification failed',
        });
        return NextResponse.json(
          { error: verified.error, account: sanitizeInstagramAccountForClient(updated) },
          { status: 400 }
        );
      }
      const updated = await instagramDb.updateInstagramAccount(id, {
        status: 'active',
        last_error: null,
        display_name: verified.displayName || account.display_name,
        last_sync_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, account: sanitizeInstagramAccountForClient(updated) });
    }

    const cookies = extractCookiesFromAccount(account);
    if (!cookies?.sessionid) {
      return NextResponse.json({ error: 'No stored session found. Please reconnect.' }, { status: 400 });
    }

    const verified = await verifyInstagramSession(cookies, account.username);
    if (!verified.valid) {
      const updated = await instagramDb.updateInstagramAccount(id, {
        status: 'error',
        last_error: verified.error || 'Session expired',
      });
      return NextResponse.json(
        { error: verified.error, account: sanitizeInstagramAccountForClient(updated) },
        { status: 400 }
      );
    }

    const updated = await instagramDb.updateInstagramAccount(id, {
      status: 'active',
      last_error: null,
      display_name: verified.displayName || account.display_name,
      ig_user_id: verified.igUserId || account.ig_user_id,
      encrypted_cookies_json: verified.cookies ? encryptToken(JSON.stringify(verified.cookies)) : account.encrypted_cookies_json,
      last_sync_at: new Date().toISOString(),
    });
    return NextResponse.json({ success: true, account: sanitizeInstagramAccountForClient(updated) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
