import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { instagramDb } from '@/lib/instagram/db';
import { handleGenerateIgDmJob } from '@/lib/instagram/worker';

export async function POST(
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
    await handleGenerateIgDmJob({
      campaignLeadId: existing.campaign_lead_id,
      stepNumber: existing.step_number,
    });
    const refreshed = await instagramDb.getInstagramMessageByLeadAndStep(
      existing.campaign_lead_id,
      existing.step_number
    );
    return NextResponse.json({ success: true, message: refreshed });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
