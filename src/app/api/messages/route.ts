import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || undefined;
  const campaignId = searchParams.get('campaignId') || undefined;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || searchParams.get('pageSize') || '25', 10);
  const offset = searchParams.get('offset') !== null ? parseInt(searchParams.get('offset')!, 10) : (page - 1) * limit;

  try {
    if (campaignId) {
      const campaign = await dbService.getCampaign(campaignId);
      if (!campaign || campaign.user_id !== user.id) {
        return NextResponse.json({
          messages: [],
          total: 0,
          page,
          limit,
          totalPages: 1,
        });
      }
    }

    const result = await dbService.getPaginatedMessages({
      userId: user.id,
      status,
      campaignId,
      limit,
      offset,
    });
    return NextResponse.json({
      messages: result.messages,
      total: result.total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(result.total / limit)),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
