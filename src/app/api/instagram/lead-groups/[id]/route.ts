import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { instagramDb } from '@/lib/instagram/db';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const group = await instagramDb.getInstagramLeadGroup(id);
  if (!group || group.user_id !== user.id) {
    return NextResponse.json({ error: 'Instagram lead group not found' }, { status: 404 });
  }

  try {
    await instagramDb.deleteInstagramLeadGroup(id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
