/**
 * Standalone Background Worker Runner for Cold Outreach Agent
 * 
 * Runs continuously in the terminal (or background process/systemd/PM2)
 * and triggers /api/jobs/process periodically.
 * 
 * Usage:
 *   npm run worker
 *   or: node scripts/worker.js
 */

const fs = require('fs');
const path = require('path');

// Read environment variables from .env.local if available
function loadEnv() {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET || 'super-secret-cron-token-change-in-production';
const INTERVAL_SECONDS = parseInt(process.env.WORKER_POLL_INTERVAL_SECONDS || '30', 10);

console.log('====================================================');
console.log('🤖 Cold Outreach Background Worker Daemon Started');
console.log(`📍 Target App URL : ${APP_URL}`);
console.log(`⏱️  Poll Interval  : Every ${INTERVAL_SECONDS} seconds`);
console.log('====================================================\n');

async function tick() {
  const timestamp = new Date().toISOString();
  try {
    const endpoint = `${APP_URL}/api/jobs/process`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[${timestamp}] ⚠️ Worker returned HTTP ${res.status}: ${errText}`);
      return;
    }

    const data = await res.json();
    if (data.processed > 0) {
      console.log(`[${timestamp}] 🚀 Processed ${data.processed} job(s):`);
      for (const r of data.results || []) {
        console.log(`   - Job ${r.jobId} [${r.type}]: ${r.status}${r.error ? ` (Error: ${r.error})` : ''}`);
      }
    } else {
      process.stdout.write(`.`);
    }
  } catch (err) {
    console.warn(`[${timestamp}] ⚠️ Failed to reach ${APP_URL}: ${err.message}. Is Next.js running?`);
  }
}

// Initial tick
tick();

// Recurring interval
setInterval(tick, INTERVAL_SECONDS * 1000);
