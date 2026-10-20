import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { revokeGoogleToken } from '@/lib/gmail/oauth';
import { decryptToken } from '@/lib/crypto';

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const account = await dbService.getConnectedEmailAccount(user.id);
    if (account) {
      try {
        const token = decryptToken(account.encrypted_access_token);
        await revokeGoogleToken(token);
      } catch {
        // Continue even if revocation fails (e.g. mock token or expired)
      }
      await dbService.deleteEmailAccount(user.id, 'gmail');
      await dbService.logActivity(user.id, 'gmail_disconnected', 'email_accounts', null);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
