import { NextRequest, NextResponse } from 'next/server';
import { runFullWorkerCycle } from '@/lib/queue/worker';
import { env } from '@/lib/env';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';

export const maxDuration = 60;

async function handleProcess(request: NextRequest) {
  // Validate authorization bearer token or query secret
  const authHeader = request.headers.get('authorization') || '';
  const expectedSecret = env.CRON_SECRET;
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret') || url.searchParams.get('cron_secret');
  const isForce = url.searchParams.get('force') === 'true';
  const isAsync = url.searchParams.get('async') === 'true';
  const rawBatchSize = parseInt(url.searchParams.get('batch_size') || '5', 10);
  const batchSize = Math.max(1, Math.min(10, isNaN(rawBatchSize) ? 5 : rawBatchSize));
  const rawTimeout = parseInt(url.searchParams.get('timeout_ms') || '20000', 10);
  const maxDurationMs = Math.max(5000, Math.min(30000, isNaN(rawTimeout) ? 20000 : rawTimeout));
  const skipPeriodic = url.searchParams.get('skip_periodic') === 'true';

  const isBearerMatch =
    (expectedSecret && authHeader === `Bearer ${expectedSecret}`) ||
    (expectedSecret && querySecret === expectedSecret);

  // Or check if authenticated user is logged in
  const user = await getAuthenticatedUser();

  if (!isBearerMatch && !user) {
    return NextResponse.json({ error: 'Unauthorized: Invalid or missing CRON_SECRET token' }, { status: 401 });
  }

  const workerId = `api-worker-${Date.now()}`;

  // If async execution is requested, kick off the cycle in background and return 202 immediately
  if (isAsync) {
    runFullWorkerCycle(workerId, isForce, { batchSize, maxDurationMs, skipPeriodic }).catch((err) => {
      console.error('[AsyncWorker] Error during background cycle:', err);
    });

    return NextResponse.json(
      {
        success: true,
        status: 'accepted',
        worker_id: workerId,
        message: 'Worker cycle started asynchronously in background.',
        timestamp: new Date().toISOString(),
      },
      { status: 202 }
    );
  }

  try {
    const cycleResult = await runFullWorkerCycle(workerId, isForce, {
      batchSize,
      maxDurationMs,
      skipPeriodic,
    });

    // Queue diagnostics if 0 jobs were processed
    let queueStatus = null;
    if (cycleResult.claimed === 0) {
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

    return NextResponse.json({
      success: true,
      worker_id: workerId,
      processed: cycleResult.claimed,
      completed_count: cycleResult.processed,
      reconciled: cycleResult.reconciled,
      warmup_sent: cycleResult.warmupEmailsSent,
      results: cycleResult.results,
      queue_status: queueStatus,
      duration_ms: cycleResult.durationMs,
      timed_out: cycleResult.timedOut,
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
