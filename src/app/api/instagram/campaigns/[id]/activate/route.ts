import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { instagramDb } from '@/lib/instagram/db';
import { calculateStaggeredScheduleWithAccounts } from '@/lib/scheduler';

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
    const activeAccounts = await instagramDb.getInstagramAccounts(user.id, { status: 'active' });
    if (activeAccounts.length === 0) {
      return NextResponse.json(
        { error: 'Cannot activate: No active Instagram account connected. Connect an Instagram account first.' },
        { status: 400 }
      );
    }

    let targetAccounts = activeAccounts;
    if (campaign.instagram_account_id) {
      const matched = activeAccounts.filter((a) => a.id === campaign.instagram_account_id);
      if (matched.length === 0) {
        return NextResponse.json(
          { error: 'The selected Instagram sender account is paused or disconnected.' },
          { status: 400 }
        );
      }
      targetAccounts = matched;
    }

    const updated = await instagramDb.updateInstagramCampaign(id, {
      status: 'active',
      activated_at: new Date().toISOString(),
    });

    const campaignLeads = await instagramDb.getInstagramCampaignLeads(id);
    const messages = await instagramDb.getInstagramMessages({ campaignId: id });
    const eligibleMessages = [];

    for (const cl of campaignLeads) {
      if (!cl.lead?.normalized_handle) continue;
      const msg = messages.find((m) => m.campaign_lead_id === cl.id && m.step_number === 0);
      if (msg && (msg.status === 'draft' || msg.status === 'scheduled' || msg.status === 'paused')) {
        eligibleMessages.push(msg);
      }
    }

    const schedulerCompatible = targetAccounts.map((a) => ({
      ...a,
      email_address: a.username,
      provider: 'instagram',
    })) as any[];

    const slots = calculateStaggeredScheduleWithAccounts(
      updated as any,
      schedulerCompatible,
      eligibleMessages.length,
      new Date()
    );

    let enqueuedCount = 0;
    for (let i = 0; i < eligibleMessages.length; i++) {
      const msg = eligibleMessages[i];
      const slot = slots[i];
      const scheduledDate = slot?.date || new Date();

      await instagramDb.createOrUpdateInstagramMessage({
        campaign_lead_id: msg.campaign_lead_id,
        step_number: msg.step_number,
        body_text: msg.body_text,
        status: 'scheduled',
        scheduled_at: scheduledDate.toISOString(),
        instagram_account_id: slot?.accountId || targetAccounts[0].id,
      });

      await dbService.enqueueJob(
        'send_ig_dm',
        { instagramMessageId: msg.id },
        `send_ig_initial_${msg.id}`,
        scheduledDate
      );
      enqueuedCount++;
    }

    await dbService.logActivity(user.id, 'instagram_campaign_activated', 'instagram_campaigns', id, {
      name: updated.name,
      enqueued_sends: enqueuedCount,
    });

    return NextResponse.json({ success: true, campaign: updated, enqueued_sends: enqueuedCount });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
