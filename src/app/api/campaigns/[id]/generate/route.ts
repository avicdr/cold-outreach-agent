import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { handleGenerateEmailJob } from '@/lib/queue/worker';

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

    const campaignLeads = await dbService.getCampaignLeads(id);
    if (campaignLeads.length === 0) {
      return NextResponse.json({ error: 'No leads enrolled in this campaign.' }, { status: 400 });
    }

    // Check existing drafts to avoid redundant work and timeouts
    const existingMessages = await dbService.getMessages({ campaignId: id });
    const existingDraftClIds = new Set(
      existingMessages.filter((m) => m.step_number === 0).map((m) => m.campaign_lead_id)
    );

    const leadsToProcess = campaignLeads.filter((cl) => !existingDraftClIds.has(cl.id));

    let generatedCount = existingDraftClIds.size;
    let newlyGenerated = 0;
    const errors: string[] = [];

    // Process leads in small parallel batches of 3 to maximize throughput and respect rate limits
    const BATCH_SIZE = 3;
    for (let i = 0; i < leadsToProcess.length; i += BATCH_SIZE) {
      const batch = leadsToProcess.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (cl) => {
          await handleGenerateEmailJob({ campaignLeadId: cl.id, stepNumber: 0 });
          return cl;
        })
      );

      for (let j = 0; j < results.length; j++) {
        const res = results[j];
        const cl = batch[j];
        if (res.status === 'fulfilled') {
          newlyGenerated++;
          generatedCount++;
        } else {
          errors.push(`Failed for lead ${cl.lead?.email || cl.id}: ${res.reason}`);
        }
      }
    }

    // If campaign is active and new drafts were generated, ensure all scheduled messages are cleanly staggered
    if (campaign.status === 'active' && newlyGenerated > 0) {
      await dbService.rescheduleCampaignScheduledMessages(campaign.id);
    }

    await dbService.logActivity(user.id, 'campaign_drafts_generated', 'campaign', id, {
      totalGenerated: generatedCount,
      newlyGenerated,
      errorsCount: errors.length,
    });

    return NextResponse.json({
      success: true,
      generated_count: generatedCount,
      newly_generated: newlyGenerated,
      errors: errors.slice(0, 10),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
