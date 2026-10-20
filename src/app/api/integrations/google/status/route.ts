import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const account = await dbService.getConnectedEmailAccount(user.id);
    if (!account) {
      return NextResponse.json({
        connected: false,
      });
    }

    const isExpired = account.token_expires_at ? new Date(account.token_expires_at) < new Date() : false;

    return NextResponse.json({
      connected: true,
      email: account.email_address,
      connected_at: account.connected_at,
      last_sync_at: account.last_sync_at,
      token_expired: isExpired,
      scopes: account.granted_scopes,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
