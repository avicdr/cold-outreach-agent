import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { sanitizeInstagramAccountForClient } from '@/lib/security';
import { instagramDb } from '@/lib/instagram/db';
import { z } from 'zod';

const updateSchema = z.object({
  status: z.enum(['active', 'paused', 'error', 'challenge_required']).optional(),
  daily_limit: z.number().int().min(1).max(100).optional(),
  min_interval_minutes: z.number().int().min(1).max(120).optional(),
  display_name: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await instagramDb.getInstagramAccount(id);
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Instagram account not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const updates = updateSchema.parse(body);
    const updated = await instagramDb.updateInstagramAccount(id, updates);
    return NextResponse.json({ success: true, account: sanitizeInstagramAccountForClient(updated) });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await instagramDb.getInstagramAccount(id);
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Instagram account not found' }, { status: 404 });
  }

  try {
    await instagramDb.deleteInstagramAccount(id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
