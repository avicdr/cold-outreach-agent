export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    // Avoid running inside test runners or during static builds
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return;
    }

    try {
      const { processJobQueueBatch } = await import('@/lib/queue/worker');

      console.log('🚀 [Background Worker] Initialized 60s queue processor inside Next.js server.');

      // Wait 10 seconds after server boot before the first tick
      setTimeout(() => {
        const tick = async () => {
          try {
            const batchResult = await processJobQueueBatch('server-worker', 10);
            if (batchResult.claimed > 0) {
              console.log(`[Server Worker] Processed ${batchResult.claimed} job(s).`);
            }
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.warn('[Server Worker] Background tick error:', errorMsg);
          }
        };

        // Run immediately once
        tick();

        // Recurring interval every 60 seconds
        const interval = setInterval(tick, 60000);
        if (interval.unref) {
          interval.unref();
        }
      }, 10000);
    } catch (err) {
      console.warn('[Background Worker] Failed to initialize server worker:', err);
    }
  }
}

