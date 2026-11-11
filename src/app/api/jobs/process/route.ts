import { NextRequest, NextResponse } from 'next/server';
import { runFullWorkerCycle } from '@/lib/queue/worker';
import { env } from '@/lib/env';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';

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
    const workerId = `api-worker-${Date.now()}`;
    const cycleResult = await runFullWorkerCycle(workerId, isForce);

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
      reconciled: cycleResult.reconciled,
      warmup_sent: cycleResult.warmupEmailsSent,
      results: cycleResult.results,
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
