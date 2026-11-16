import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { instagramDb } from '@/lib/instagram/db';
import { handleGenerateIgDmJob } from '@/lib/instagram/worker';

export async function POST(
  request: NextRequest,
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
    const campaignLeads = await instagramDb.getInstagramCampaignLeads(id);
    if (campaignLeads.length === 0) {
      return NextResponse.json({ error: 'No leads enrolled in this Instagram campaign.' }, { status: 400 });
    }

    const existingMessages = await instagramDb.getInstagramMessages({ campaignId: id });
    const existingStep0Ids = new Set(
      existingMessages
        .filter((m) => m.step_number === 0 && Boolean(m.body_text?.trim()) && m.status !== 'failed')
        .map((m) => m.campaign_lead_id)
    );

    const leadsWithHandle = campaignLeads.filter(
      (cl) => !existingStep0Ids.has(cl.id) && Boolean(cl.lead?.normalized_handle)
    );
    const missingHandleCount = campaignLeads.filter((cl) => !cl.lead?.normalized_handle).length;

    // Bounded chunking via ?limit= query param (default 12 leads per call to guarantee safe completion under Cloudflare 100s proxy timeout)
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 50) : 12;

    const leadsToProcess = leadsWithHandle.slice(0, limit);
    const remainingCount = Math.max(0, leadsWithHandle.length - leadsToProcess.length);

    let generatedCount = existingStep0Ids.size;
    let newlyGenerated = 0;
    const errors: string[] = [];

    const BATCH_SIZE = 3;
    for (let i = 0; i < leadsToProcess.length; i += BATCH_SIZE) {
      const batch = leadsToProcess.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (cl) => {
          await handleGenerateIgDmJob({ campaignLeadId: cl.id, stepNumber: 0 });
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
          errors.push(`Failed for ${cl.lead?.instagram_handle || cl.id}: ${res.reason}`);
        }
      }
    }

    if (campaign.status === 'active' && newlyGenerated > 0) {
      await instagramDb.rescheduleInstagramCampaignMessages(campaign.id);
    }

    await dbService.logActivity(user.id, 'instagram_dms_generated', 'instagram_campaigns', id, {
      generatedCount,
      newlyGenerated,
      missingHandleCount,
      remainingCount,
    });

    return NextResponse.json({
      success: true,
      generated_count: generatedCount,
      newly_generated: newlyGenerated,
      remaining_count: remainingCount,
      done: remainingCount === 0,
      skipped_missing_handles: missingHandleCount,
      errors: errors.slice(0, 10),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
