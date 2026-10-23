import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Auto-clean any legacy or stray mailer-daemon/delivery failures asynchronously
  dbService.purgeInvalidReplies(user.id).catch((err) => {
    console.warn('Background reply purge warning:', err);
  });

  const { searchParams } = new URL(request.url);
  const classification = searchParams.get('classification') || undefined;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || searchParams.get('pageSize') || '25', 10);
  const offset = searchParams.get('offset') !== null ? parseInt(searchParams.get('offset')!, 10) : (page - 1) * limit;

  try {
    const result = await dbService.getPaginatedReplies(user.id, {
      classification,
      limit,
      offset,
    });
    return NextResponse.json({
      replies: result.replies,
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

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Reply ID is required' }, { status: 400 });
  }

  try {
    const success = await dbService.deleteReply(id, user.id);
    return NextResponse.json({ success, deletedId: id });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
