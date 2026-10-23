import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { env } from '@/lib/env';

function isAuthorized(request: NextRequest, user: any) {
  if (user) return true;
  const authHeader = request.headers.get('authorization') || '';
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret') || url.searchParams.get('cron_secret');
  const expectedSecret = env.CRON_SECRET;
  return (
    expectedSecret &&
    (authHeader === `Bearer ${expectedSecret}` || querySecret === expectedSecret)
  );
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!isAuthorized(request, user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || undefined;
    const jobType = url.searchParams.get('type') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const result = await dbService.getJobs({
      status,
      jobType,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Error fetching jobs:', errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!isAuthorized(request, user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const clearFailed = url.searchParams.get('clear_failed') === 'true';

    if (clearFailed) {
      const deletedCount = await dbService.clearFailedJobs();
      return NextResponse.json({ success: true, deleted: deletedCount });
    }

    if (!id) {
      return NextResponse.json({ error: 'Job ID or clear_failed parameter is required' }, { status: 400 });
    }

    const ok = await dbService.deleteJob(id);
    return NextResponse.json({ success: ok });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Error deleting job:', errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
