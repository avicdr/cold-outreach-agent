import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { calculateStaggeredSchedule } from '@/lib/scheduler';

export async function POST(
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

    // Verify Gmail account is connected
    const emailAccount = await dbService.getConnectedEmailAccount(user.id);
    if (!emailAccount) {
      return NextResponse.json(
        { error: 'Cannot activate campaign: No Gmail account connected. Connect Gmail in Settings first.' },
        { status: 400 }
      );
    }

    const updated = await dbService.updateCampaign(id, {
      status: 'active',
      activated_at: new Date().toISOString(),
    });

    // Collect all eligible initial messages
    const campaignLeads = await dbService.getCampaignLeads(id);
    const messages = await dbService.getMessages({ campaignId: id });
    const eligibleMessages = [];
    for (const cl of campaignLeads) {
      const msg = messages.find((m) => m.campaign_lead_id === cl.id && m.step_number === 0);
      if (msg && (msg.status === 'draft' || msg.status === 'scheduled')) {
        eligibleMessages.push(msg);
      }
    }

    const emailAccounts = await dbService.getEmailAccounts(user.id, { status: 'active' });
    const staggeredDates = calculateStaggeredSchedule(
      campaign,
      emailAccounts.length > 0 ? emailAccounts : [emailAccount],
      eligibleMessages.length,
      new Date()
    );

    let enqueuedCount = 0;
    for (let i = 0; i < eligibleMessages.length; i++) {
      const msg = eligibleMessages[i];
      const scheduledDate = staggeredDates[i] || new Date();

      await dbService.createOrUpdateMessage({
        ...msg,
        status: 'scheduled',
        scheduled_at: scheduledDate.toISOString(),
      });
      await dbService.enqueueJob(
        'send_email',
        { emailMessageId: msg.id },
        `send_initial_${msg.id}`,
        scheduledDate
      );
      enqueuedCount++;
    }

    await dbService.logActivity(user.id, 'campaign_activated', 'campaign', id, {
      name: campaign.name,
      enqueued_sends: enqueuedCount,
    });

    return NextResponse.json({ success: true, campaign: updated, enqueued_sends: enqueuedCount });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
