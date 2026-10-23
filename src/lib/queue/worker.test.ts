import { describe, it, expect, beforeEach } from 'vitest';
import { isWithinSendingWindow, processJobQueueBatch } from './worker';
import { dbService } from '../db-service';
import { SendingConfig } from '@/types/database';

describe('Job Queue & Worker Execution', () => {
  beforeEach(() => {
    // Reset mock queues
  });

  it('evaluates sending window days and hours correctly', () => {
    const config: SendingConfig = {
      days: [1, 2, 3, 4, 5], // Mon-Fri
      start_hour: 9,
      end_hour: 17,
      timezone: 'UTC',
      daily_limit: 10,
      hourly_limit: 3,
    };

    // A Wednesday at 10:00 UTC
    const wednesdayWorkingHours = new Date('2026-10-21T10:00:00Z');
    expect(isWithinSendingWindow(config, wednesdayWorkingHours)).toBe(true);

    // A Wednesday at 20:00 UTC (past end_hour)
    const wednesdayNight = new Date('2026-10-21T20:00:00Z');
    expect(isWithinSendingWindow(config, wednesdayNight)).toBe(false);

    // A Sunday at 10:00 UTC (not in days)
    const sundayMorning = new Date('2026-10-25T10:00:00Z');
    expect(isWithinSendingWindow(config, sundayMorning)).toBe(false);
  });

  it('enforces idempotency and prevents duplicate queue items', async () => {
    const key = 'test_idempotency_key_123';
    const job1 = await dbService.enqueueJob('cleanup_expired_jobs', {}, key);
    const job2 = await dbService.enqueueJob('cleanup_expired_jobs', {}, key);

    expect(job1.id).toBe(job2.id);
  });

  it('claims jobs atomically with leases', async () => {
    const key1 = 'job_claim_test_1';
    const key2 = 'job_claim_test_2';

    await dbService.enqueueJob('cleanup_expired_jobs', {}, key1, new Date());
    await dbService.enqueueJob('cleanup_expired_jobs', {}, key2, new Date());

    const claimed = await dbService.claimJobs('worker-unit-test', 2, 300);
    expect(claimed.length).toBeGreaterThanOrEqual(2);
    expect(claimed[0].status).toBe('running');
    expect(claimed[0].attempts).toBe(1);

    // Immediate second claim should return 0 since locks are active
    const secondClaim = await dbService.claimJobs('worker-second', 2, 300);
    const duplicateClaims = secondClaim.filter((j) => j.id === claimed[0].id || j.id === claimed[1].id);
    expect(duplicateClaims.length).toBe(0);
  });

  it('processes batch jobs and marks them completed', async () => {
    await dbService.enqueueJob('cleanup_expired_jobs', {}, 'batch_job_1', new Date());
    const batchResult = await processJobQueueBatch('worker-test-runner', 5);

    expect(batchResult.claimed).toBeGreaterThan(0);
    const completed = batchResult.results.filter((r) => r.status === 'completed');
    expect(completed.length).toBeGreaterThan(0);
  });

  it('detects mailer-daemon and delivery bounces accurately', async () => {
    const { isMailerDaemonOrBounce } = await import('../db-service');

    expect(isMailerDaemonOrBounce('mailer-daemon@googlemail.com')).toBe(true);
    expect(isMailerDaemonOrBounce('MAIL-DAEMON@domain.com')).toBe(true);
    expect(isMailerDaemonOrBounce('postmaster@server.net')).toBe(true);
    expect(isMailerDaemonOrBounce('bounce-handler@outreach.com')).toBe(true);
    expect(isMailerDaemonOrBounce('noreply@company.com')).toBe(true);
    expect(
      isMailerDaemonOrBounce('user@domain.com', 'The email is a delivery failure notification stating the domain could not be found.')
    ).toBe(true);
    expect(isMailerDaemonOrBounce('prospect@acmecorp.com', 'Sounds great, let us talk next Tuesday.')).toBe(false);
  });

  it('never stores mailer-daemon replies and filters them out of getReplies', async () => {
    const testUserId = 'test-user-daemon-check';

    // Attempt to record a mailer-daemon bounce reply
    await dbService.recordReply({
      user_id: testUserId,
      email_message_id: null,
      gmail_message_id: 'daemon-msg-1',
      gmail_thread_id: 'daemon-th-1',
      sender_email: 'mailer-daemon@googlemail.com',
      received_at: new Date().toISOString(),
      classification: 'other',
      classification_summary: 'Delivery failure notice: recipient rejected',
    });

    // Record a genuine prospect reply
    const genuineReply = await dbService.recordReply({
      user_id: testUserId,
      email_message_id: null,
      gmail_message_id: 'genuine-msg-1',
      gmail_thread_id: 'genuine-th-1',
      sender_email: 'sarah@startup.io',
      received_at: new Date().toISOString(),
      classification: 'positive',
      classification_summary: 'Interested in a demo call next week.',
    });

    const replies = await dbService.getReplies(testUserId);
    expect(replies.some((r) => r.sender_email.includes('mailer-daemon'))).toBe(false);
    expect(replies.some((r) => r.sender_email === 'sarah@startup.io')).toBe(true);

    const paginated = await dbService.getPaginatedReplies(testUserId, { limit: 10 });
    expect(paginated.replies.some((r) => r.sender_email.includes('mailer-daemon'))).toBe(false);
    expect(paginated.replies.some((r) => r.sender_email === 'sarah@startup.io')).toBe(true);

    // Test reply deletion
    const deleted = await dbService.deleteReply(genuineReply.id, testUserId);
    expect(deleted).toBe(true);
    const repliesAfterDelete = await dbService.getReplies(testUserId);
    expect(repliesAfterDelete.some((r) => r.id === genuineReply.id)).toBe(false);
  });
});
