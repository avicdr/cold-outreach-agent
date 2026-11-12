import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { instagramDb } from '@/lib/instagram/db';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const campaign = await instagramDb.getInstagramCampaign(id);
  if (!campaign || campaign.user_id !== user.id) {
    return NextResponse.json({ error: 'Instagram campaign not found' }, { status: 404 });
  }

  try {
    const updated = await instagramDb.updateInstagramCampaign(id, { status: 'cancelled' });
    const messages = await instagramDb.getInstagramMessages({ campaignId: id });
    for (const msg of messages) {
      if (msg.status === 'draft' || msg.status === 'scheduled' || msg.status === 'paused') {
        await instagramDb.createOrUpdateInstagramMessage({
          campaign_lead_id: msg.campaign_lead_id,
          step_number: msg.step_number,
          status: 'cancelled',
        });
      }
    }
    return NextResponse.json({ success: true, campaign: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
