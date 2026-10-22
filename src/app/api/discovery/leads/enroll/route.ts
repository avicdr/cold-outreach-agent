import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { z } from 'zod';

const enrollSchema = z.object({
  campaignId: z.string().uuid(),
  leadIds: z.array(z.string().uuid()).min(1, 'At least one lead must be selected'),
});

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = enrollSchema.parse(body);

    // Verify campaign belongs to user
    const campaign = await dbService.getCampaign(validated.campaignId);
    if (!campaign || campaign.user_id !== user.id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const { enrolled } = await dbService.enrollLeadsInCampaign(
      validated.campaignId,
      validated.leadIds
    );

    await dbService.logActivity(user.id, 'leads_enrolled_from_discovery', 'campaigns', validated.campaignId, {
      enrolledCount: enrolled,
      leadIds: validated.leadIds,
    });

    return NextResponse.json({ success: true, enrolled });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
