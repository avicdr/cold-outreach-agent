import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const campaign = await dbService.getCampaign(id);
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const campaignLeads = await dbService.getCampaignLeads(id);
    const messages = await dbService.getMessages({ campaignId: id });

    const groups = await dbService.getAccountGroups(user.id);
    const group = campaign.account_group_id ? groups.find((g) => g.id === campaign.account_group_id) || null : null;

    return NextResponse.json({
      campaign: { ...campaign, account_group: group },
      enrolled_count: campaignLeads.length,
      leads: campaignLeads,
      messages,
      groups,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const campaign = await dbService.getCampaign(id);
    if (!campaign || campaign.user_id !== user.id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const updates = await request.json();
    const updated = await dbService.updateCampaign(id, updates);

    await dbService.logActivity(user.id, 'campaign_updated', 'campaign', id, {
      name: updated.name,
      account_group_id: updated.account_group_id,
    });

    return NextResponse.json({ success: true, campaign: updated });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
