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
    const updated = await dbService.updateCampaign(id, { status: 'cancelled' });
    
    // Cancel scheduled messages
    const messages = await dbService.getMessages({ campaignId: id, status: 'scheduled' });
    for (const msg of messages) {
      msg.status = 'cancelled';
      await dbService.createOrUpdateMessage(msg);
    }

    await dbService.logActivity(user.id, 'campaign_cancelled', 'campaign', id);
    return NextResponse.json({ success: true, campaign: updated });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
