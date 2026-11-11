export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    // Avoid running inside test runners or during static builds
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return;
    }

    try {
      const { runFullWorkerCycle } = await import('@/lib/queue/worker');

      console.log('🚀 [Background Worker] Initialized 60s autonomous worker daemon inside Next.js server.');

      // Wait 5 seconds after server boot before the first tick
      setTimeout(() => {
        const tick = async () => {
          try {
            const cycleResult = await runFullWorkerCycle('server-worker', false);
            if (cycleResult.reconciled > 0 || cycleResult.claimed > 0 || cycleResult.warmupEmailsSent > 0) {
              console.log(
                `[Server Worker] Cycle complete: ${cycleResult.claimed} job(s) processed, ${cycleResult.reconciled} message(s) reconciled, ${cycleResult.warmupEmailsSent} warmup email(s) sent.`
              );
            }
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.warn('[Server Worker] Background tick error:', errorMsg);
          }
        };

        // Run immediately once
        tick();

        // Recurring interval every 60 seconds (keeps server daemon active 24/7 without browser tabs)
        setInterval(tick, 60000);
      }, 5000);
    } catch (err) {
      console.warn('[Background Worker] Failed to initialize server worker daemon:', err);
    }
  }
}
