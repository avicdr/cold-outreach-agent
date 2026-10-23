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

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!isAuthorized(request, user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { jobId, allFailed } = body;

    if (allFailed) {
      const count = await dbService.retryAllFailedJobs();
      return NextResponse.json({ success: true, retried: count });
    }

    if (!jobId) {
      return NextResponse.json({ error: 'jobId or allFailed is required' }, { status: 400 });
    }

    const retriedJob = await dbService.retryJob(jobId);
    if (!retriedJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, job: retriedJob });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Error retrying job:', errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
