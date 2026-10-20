import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';

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
    if (!campaign) {
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

    // Enqueue sending jobs for any drafts or scheduled messages
    const campaignLeads = await dbService.getCampaignLeads(id);
    const messages = await dbService.getMessages({ campaignId: id });

    let enqueuedCount = 0;
    for (const cl of campaignLeads) {
      const msg = messages.find((m) => m.campaign_lead_id === cl.id && m.step_number === 0);
      if (msg && (msg.status === 'draft' || msg.status === 'scheduled')) {
        await dbService.createOrUpdateMessage({
          ...msg,
          status: 'scheduled',
          scheduled_at: new Date().toISOString(),
        });
        await dbService.enqueueJob(
          'send_email',
          { emailMessageId: msg.id },
          `send_initial_${msg.id}`,
          new Date()
        );
        enqueuedCount++;
      }
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
