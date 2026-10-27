import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { z } from 'zod';

const enrollSchema = z
  .object({
    lead_ids: z.array(z.string()).optional(),
    group_id: z.string().optional(),
  })
  .refine((data) => (data.lead_ids && data.lead_ids.length > 0) || Boolean(data.group_id), {
    message: 'Either lead_ids or group_id must be provided',
  });

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

    const body = await request.json();
    const { lead_ids, group_id } = enrollSchema.parse(body);

    let enrolledCount = 0;
    if (group_id) {
      const group = await dbService.getLeadGroup(group_id);
      if (!group || group.user_id !== user.id) {
        return NextResponse.json({ error: 'Lead group not found' }, { status: 404 });
      }
      const result = await dbService.enrollLeadGroupInCampaign(id, group_id);
      enrolledCount = result.enrolled;
    } else if (lead_ids && lead_ids.length > 0) {
      const result = await dbService.enrollLeadsInCampaign(id, lead_ids);
      enrolledCount = result.enrolled;
    }

    await dbService.logActivity(user.id, 'campaign_enrolled_leads', 'campaign', id, {
      count: enrolledCount,
      group_id: group_id || null,
    });

    return NextResponse.json({ success: true, enrolled_count: enrolledCount });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.flatten().fieldErrors }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
