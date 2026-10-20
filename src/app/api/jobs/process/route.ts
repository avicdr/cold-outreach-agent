import { NextRequest, NextResponse } from 'next/server';
import { processJobQueueBatch, handleSyncRepliesJob } from '@/lib/queue/worker';
import { env } from '@/lib/env';
import { getAuthenticatedUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  // Validate authorization bearer token
  const authHeader = request.headers.get('authorization') || '';
  const expectedSecret = env.CRON_SECRET;

  const isBearerMatch = authHeader === `Bearer ${expectedSecret}`;
  
  // Or check if authenticated user is logged in
  const user = await getAuthenticatedUser();

  if (!isBearerMatch && !user) {
    return NextResponse.json({ error: 'Unauthorized: Invalid or missing CRON_SECRET token' }, { status: 401 });
  }

  try {
    const workerId = `cron-worker-${Date.now()}`;
    const batchResult = await processJobQueueBatch(workerId, 15);

    // Sync replies if a user context is available
    if (user) {
      try {
        await handleSyncRepliesJob({ userId: user.id });
      } catch (syncErr) {
        console.warn('Sync replies non-fatal error:', syncErr);
      }
    }

    return NextResponse.json({
      success: true,
      worker_id: workerId,
      processed: batchResult.claimed,
      results: batchResult.results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Job process endpoint error:', errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
