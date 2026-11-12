import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { instagramDb } from '@/lib/instagram/db';
import { z } from 'zod';

const updateMessageSchema = z.object({
  body_text: z.string().min(1).optional(),
  status: z.enum(['draft', 'scheduled', 'paused', 'cancelled']).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await instagramDb.getInstagramMessage(id);
  if (!existing) {
    return NextResponse.json({ error: 'Instagram message not found' }, { status: 404 });
  }

  const campaign = existing.campaign_id ? await instagramDb.getInstagramCampaign(existing.campaign_id) : null;
  if (campaign && campaign.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const updates = updateMessageSchema.parse(body);
    const updated = await instagramDb.createOrUpdateInstagramMessage({
      campaign_lead_id: existing.campaign_lead_id,
      step_number: existing.step_number,
      ...updates,
    });
    return NextResponse.json({ success: true, message: updated });
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
  const existing = await instagramDb.getInstagramMessage(id);
  if (!existing) {
    return NextResponse.json({ error: 'Instagram message not found' }, { status: 404 });
  }

  const campaign = existing.campaign_id ? await instagramDb.getInstagramCampaign(existing.campaign_id) : null;
  if (campaign && campaign.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await instagramDb.deleteInstagramMessage(id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
