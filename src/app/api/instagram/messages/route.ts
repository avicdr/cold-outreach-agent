import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { sanitizeInstagramAccountForClient } from '@/lib/security';
import { instagramDb } from '@/lib/instagram/db';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId') || undefined;
  const status = searchParams.get('status') || undefined;

  try {
    const messages = await instagramDb.getInstagramMessages({
      userId: user.id,
      campaignId,
      status,
    });
    return NextResponse.json(
      messages.map((m) => ({
        ...m,
        instagram_account: m.instagram_account
          ? sanitizeInstagramAccountForClient(m.instagram_account)
          : null,
      }))
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
