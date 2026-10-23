import { describe, it, expect, beforeEach } from 'vitest';
import { dbService } from '@/lib/db-service';
import { mockDb } from '@/lib/supabase/mock-db';
import { GET as jobsGet, DELETE as jobsDelete } from '@/app/api/jobs/route';
import { POST as jobsRetryPost } from '@/app/api/jobs/retry/route';
import { NextRequest } from 'next/server';

describe('Jobs & Queue Management', () => {
  beforeEach(() => {
    mockDb.jobQueue.clear();
  });

  it('can enqueue, query, and filter jobs with counts', async () => {
    // Enqueue 1 queued job, 1 failed job
    const job1 = await dbService.enqueueJob('send_email', { emailMessageId: 'msg-1' }, 'job-1');
    const job2 = await dbService.enqueueJob('generate_email', { campaignLeadId: 'lead-1' }, 'job-2');
    await dbService.failJob(job2.id, 'AI quota exceeded 429');

    const result = await dbService.getJobs();
    expect(result.counts.all).toBe(2);
    expect(result.counts.queued).toBe(1);
    expect(result.counts.failed).toBe(1);
    expect(result.jobs.length).toBe(2);

    // Filter by failed
    const failedResult = await dbService.getJobs({ status: 'failed' });
    expect(failedResult.jobs.length).toBe(1);
    expect(failedResult.jobs[0].id).toBe(job2.id);
    expect(failedResult.jobs[0].last_error).toContain('AI quota exceeded');
  });

  it('can retry a single failed job', async () => {
    const job = await dbService.enqueueJob('generate_email', { campaignLeadId: 'lead-2' }, 'job-retry-1');
    await dbService.failJob(job.id, 'Database connection timeout');

    expect(mockDb.jobQueue.get(job.id)?.status).toBe('failed');

    const retried = await dbService.retryJob(job.id);
    expect(retried).not.toBeNull();
    expect(retried?.status).toBe('queued');
    expect(retried?.last_error).toBeNull();
    expect(retried?.attempts).toBe(0);
  });

  it('can retry all failed jobs in bulk', async () => {
    const j1 = await dbService.enqueueJob('send_email', {}, 'bulk-1');
    const j2 = await dbService.enqueueJob('send_email', {}, 'bulk-2');
    await dbService.failJob(j1.id, 'Err 1');
    await dbService.failJob(j2.id, 'Err 2');

    expect(Array.from(mockDb.jobQueue.values()).filter(j => j.status === 'failed').length).toBe(2);

    const count = await dbService.retryAllFailedJobs();
    expect(count).toBe(2);

    const after = await dbService.getJobs({ status: 'failed' });
    expect(after.jobs.length).toBe(0);
  });

  it('can delete a specific job and clear all failed jobs', async () => {
    const j1 = await dbService.enqueueJob('send_email', {}, 'del-1');
    const j2 = await dbService.enqueueJob('send_email', {}, 'del-2');
    await dbService.failJob(j2.id, 'Err to clear');

    // Delete single
    await dbService.deleteJob(j1.id);
    expect(mockDb.jobQueue.has(j1.id)).toBe(false);

    // Clear failed
    const cleared = await dbService.clearFailedJobs();
    expect(cleared).toBe(1);
    expect(mockDb.jobQueue.size).toBe(0);
  });

  it('GET /api/jobs and POST /api/jobs/retry integration', async () => {
    const job = await dbService.enqueueJob('generate_email', { campaignLeadId: 'api-1' }, 'api-test-job');
    await dbService.failJob(job.id, 'Quota error');

    // GET /api/jobs
    const req = new NextRequest('http://localhost:3000/api/jobs?status=failed');
    const res = await jobsGet(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.counts.failed).toBe(1);
    expect(data.jobs[0].id).toBe(job.id);

    // POST /api/jobs/retry
    const retryReq = new NextRequest('http://localhost:3000/api/jobs/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id }),
    });
    const retryRes = await jobsRetryPost(retryReq);
    expect(retryRes.status).toBe(200);
    const retryData = await retryRes.json();
    expect(retryData.success).toBe(true);
    expect(retryData.job.status).toBe('queued');
  });
});
