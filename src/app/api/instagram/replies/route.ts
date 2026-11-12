import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { instagramDb } from '@/lib/instagram/db';
import { handleSyncIgRepliesJob } from '@/lib/instagram/worker';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const replies = await instagramDb.getInstagramReplies(user.id);
    return NextResponse.json(replies);
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await handleSyncIgRepliesJob({ userId: user.id });
    const replies = await instagramDb.getInstagramReplies(user.id);
    return NextResponse.json({ success: true, synced: result.synced, replies });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
