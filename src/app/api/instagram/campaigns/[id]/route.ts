import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { sanitizeInstagramAccountForClient } from '@/lib/security';
import { instagramDb } from '@/lib/instagram/db';

export async function GET(
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
    const [leads, messages, accounts] = await Promise.all([
      instagramDb.getInstagramCampaignLeads(id),
      instagramDb.getInstagramMessages({ campaignId: id }),
      instagramDb.getInstagramAccounts(user.id),
    ]);

    return NextResponse.json({
      campaign: {
        ...campaign,
        instagram_account: campaign.instagram_account
          ? sanitizeInstagramAccountForClient(campaign.instagram_account)
          : null,
      },
      leads,
      messages: messages.map((m) => ({
        ...m,
        instagram_account: m.instagram_account
          ? sanitizeInstagramAccountForClient(m.instagram_account)
          : null,
      })),
      accounts: accounts.map(sanitizeInstagramAccountForClient),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await instagramDb.getInstagramCampaign(id);
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Instagram campaign not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const allowedFields = [
      'name',
      'instagram_account_id',
      'business_context',
      'ideal_customer_profile',
      'offer',
      'tone',
      'call_to_action',
      'initial_dm_instructions',
      'sending_config',
      'followup_config',
    ];
    const updates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const updated = await instagramDb.updateInstagramCampaign(id, updates);
    return NextResponse.json({
      ...updated,
      instagram_account: updated.instagram_account
        ? sanitizeInstagramAccountForClient(updated.instagram_account)
        : null,
    });
  } catch (err: unknown) {
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
  const existing = await instagramDb.getInstagramCampaign(id);
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Instagram campaign not found' }, { status: 404 });
  }

  try {
    await instagramDb.deleteInstagramCampaign(id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
