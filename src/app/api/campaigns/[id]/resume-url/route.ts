import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService, isLiveSupabase } from '@/lib/db-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const resumeUrlSchema = z.object({
  resume_url: z.string().trim().min(1, 'Resume URL cannot be empty'),
});

export async function POST(
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
    const { resume_url: newResumeUrl } = resumeUrlSchema.parse(body);

    const oldResumeUrl = campaign.resume_url;

    // 1. Update campaign record
    const updatedCampaign = await dbService.updateCampaign(id, {
      resume_url: newResumeUrl,
    });

    // 2. Fetch all drafts for this campaign
    const messages = await dbService.getMessages({ campaignId: id });
    let updatedCount = 0;

    if (isLiveSupabase()) {
      const supabase = createAdminClient();
      for (const msg of messages) {
        let updatedBody = msg.body_text;
        let replaced = false;

        if (updatedBody.includes('{{resume_url}}')) {
          updatedBody = updatedBody.replaceAll('{{resume_url}}', newResumeUrl);
          replaced = true;
        } else if (oldResumeUrl && updatedBody.includes(oldResumeUrl)) {
          updatedBody = updatedBody.replaceAll(oldResumeUrl, newResumeUrl);
          replaced = true;
        }

        if (replaced) {
          const { error } = await supabase
            .from('email_messages')
            .update({ body_text: updatedBody, updated_at: new Date().toISOString() })
            .eq('id', msg.id);
          if (!error) updatedCount++;
        }
      }
    } else {
      for (const msg of messages) {
        let updatedBody = msg.body_text;
        let replaced = false;

        if (updatedBody.includes('{{resume_url}}')) {
          updatedBody = updatedBody.replaceAll('{{resume_url}}', newResumeUrl);
          replaced = true;
        } else if (oldResumeUrl && updatedBody.includes(oldResumeUrl)) {
          updatedBody = updatedBody.replaceAll(oldResumeUrl, newResumeUrl);
          replaced = true;
        }

        if (replaced) {
          await dbService.createOrUpdateMessage({
            ...msg,
            body_text: updatedBody,
          });
          updatedCount++;
        }
      }
    }

    await dbService.logActivity(user.id, 'campaign_resume_url_updated', 'campaign', id, {
      resume_url: newResumeUrl,
      updated_drafts_count: updatedCount,
    });

    return NextResponse.json({
      success: true,
      resume_url: newResumeUrl,
      updated_drafts_count: updatedCount,
      campaign: updatedCampaign,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.flatten().fieldErrors }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
