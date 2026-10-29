import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { z } from 'zod';

const updateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  business_context: z.string().optional(),
  ideal_customer_profile: z.string().optional(),
  offer: z.string().optional(),
  tone: z.string().optional(),
  call_to_action: z.string().optional(),
  initial_email_instructions: z.string().optional(),
  account_group_id: z.string().uuid().nullable().optional(),
  email_account_id: z.string().uuid().nullable().optional(),
  resume_url: z.string().nullable().optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed', 'cancelled']).optional(),
  sending_config: z.record(z.string(), z.any()).optional(),
  followup_config: z.record(z.string(), z.any()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const campaign = await dbService.getCampaign(id);
    if (!campaign || campaign.user_id !== user.id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const [campaignLeads, messages, groups] = await Promise.all([
      dbService.getCampaignLeads(id),
      dbService.getMessages({ campaignId: id }),
      dbService.getAccountGroups(user.id),
    ]);
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
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const campaign = await dbService.getCampaign(id);
    if (!campaign || campaign.user_id !== user.id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const body = await request.json();
    const validated = updateCampaignSchema.parse(body);
    const updatePayload: any = { ...validated };
    if (validated.account_group_id && validated.email_account_id === undefined) {
      updatePayload.email_account_id = null;
    }
    const updated = await dbService.updateCampaign(id, updatePayload);

    await dbService.logActivity(user.id, 'campaign_updated', 'campaign', id, {
      name: updated.name,
      account_group_id: updated.account_group_id,
    });

    if (updated.status === 'active' && updated.account_group_id) {
      await dbService.syncGroupCampaignsSchedule(updated.account_group_id, user.id);
    }

    return NextResponse.json({ success: true, campaign: updated });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.flatten().fieldErrors }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
