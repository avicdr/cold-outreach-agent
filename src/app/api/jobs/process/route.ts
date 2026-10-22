import { NextRequest, NextResponse } from 'next/server';
import { processJobQueueBatch, handleSyncRepliesJob } from '@/lib/queue/worker';
import { env } from '@/lib/env';
import { getAuthenticatedUser } from '@/lib/auth';

async function handleProcess(request: NextRequest) {
  // Validate authorization bearer token or query secret
  const authHeader = request.headers.get('authorization') || '';
  const expectedSecret = env.CRON_SECRET;
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret') || url.searchParams.get('cron_secret');
  const isForce = url.searchParams.get('force') === 'true';

  const isBearerMatch = (expectedSecret && authHeader === `Bearer ${expectedSecret}`) || (expectedSecret && querySecret === expectedSecret);
  
  // Or check if authenticated user is logged in
  const user = await getAuthenticatedUser();

  if (!isBearerMatch && !user) {
    return NextResponse.json({ error: 'Unauthorized: Invalid or missing CRON_SECRET token' }, { status: 401 });
  }

  try {
    const workerId = `cron-worker-${Date.now()}`;
    const batchResult = await processJobQueueBatch(workerId, 15, isForce);

    // Queue diagnostics if 0 jobs were processed
    let queueStatus = null;
    const { dbService } = await import('@/lib/db-service');
    if (batchResult.claimed === 0) {
      try {
        const diag = await dbService.getQueuedJobsDiagnostics();
        if (diag.total_queued > 0) {
          queueStatus = {
            total_queued: diag.total_queued,
            next_run_at: diag.next_run_at,
            notice: `All ${diag.total_queued} emails are scheduled for upcoming campaign sending windows. Use force=true to bypass schedule.`,
          };
        }
      } catch (diagErr) {
        console.warn('Queue diagnostics error:', diagErr);
      }
    }

    // Sync replies
    const syncUserId = user?.id || '5f9832c0-d340-4e0f-b2d8-b3f44a294697';
    try {
      await handleSyncRepliesJob({ userId: syncUserId });
    } catch (syncErr) {
      console.warn('Sync replies non-fatal error:', syncErr);
    }

    // Process peer warmup cycles
    try {
      const { runWarmupCycle } = await import('@/lib/warmup/service');
      await runWarmupCycle(syncUserId);
    } catch (warmupErr) {
      console.warn('Warmup cycle non-fatal error:', warmupErr);
    }

    // Process recurring discovery jobs
    try {
      const allJobs = await dbService.getDiscoveryJobs(syncUserId);
      const now = new Date();
      for (const dJob of allJobs) {
        if (
          dJob.status !== 'paused' &&
          dJob.status !== 'running' &&
          dJob.schedule_frequency !== 'once' &&
          dJob.next_run_at &&
          new Date(dJob.next_run_at) <= now
        ) {
          const { executeDiscoveryJob } = await import('@/lib/discovery/service');
          executeDiscoveryJob(dJob.id).catch((e) => console.warn('Scheduled discovery job error:', e));
        }
      }
    } catch (discoveryErr) {
      console.warn('Discovery scheduled check non-fatal error:', discoveryErr);
    }

    return NextResponse.json({
      success: true,
      worker_id: workerId,
      processed: batchResult.claimed,
      results: batchResult.results,
      queue_status: queueStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Job process endpoint error:', errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleProcess(request);
}

export async function GET(request: NextRequest) {
  return handleProcess(request);
}
