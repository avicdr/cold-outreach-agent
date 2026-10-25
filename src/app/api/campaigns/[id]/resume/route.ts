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
    const updated = await dbService.updateCampaign(id, { status: 'active' });
    const { rescheduledCount } = await dbService.resumeAndRescheduleCampaignMessages(id);
    await dbService.logActivity(user.id, 'campaign_resumed', 'campaign', id, { rescheduledCount });
    return NextResponse.json({ success: true, campaign: updated, rescheduledCount });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
