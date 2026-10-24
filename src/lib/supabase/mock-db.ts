import {
  Profile,
  Lead,
  Campaign,
  CampaignLead,
  EmailMessage,
  JobQueueItem,
  Suppression,
  ReplyEvent,
  ActivityLog,
  EmailAccount,
  AccountGroup,
  LeadGroup,
  JobType,
} from '@/types/database';

export class MockDatabase {
  profiles: Map<string, Profile> = new Map();
  emailAccounts: Map<string, EmailAccount> = new Map();
  accountGroups: Map<string, AccountGroup> = new Map();
  leadGroups: Map<string, LeadGroup> = new Map();
  leads: Map<string, Lead> = new Map();
  campaigns: Map<string, Campaign> = new Map();
  campaignLeads: Map<string, CampaignLead> = new Map();
  emailMessages: Map<string, EmailMessage> = new Map();
  suppressions: Map<string, Suppression> = new Map();
  jobQueue: Map<string, JobQueueItem> = new Map();
  replyEvents: Map<string, ReplyEvent> = new Map();
  warmupMessages: Map<string, any> = new Map();
  discoveryJobs: Map<string, any> = new Map();
  activityLogs: ActivityLog[] = [];

  constructor() {
    this.seedDefaultData();
  }

  seedDefaultData() {
    // No dummy data: only real data from database or user imports
  }

  // Atomic Job Claiming implementation for Mock DB
  claimJobs(workerId: string, batchSize: number = 5, lockDurationSeconds: number = 300, force: boolean = false): JobQueueItem[] {
    const now = new Date();
    const claimed: JobQueueItem[] = [];

    for (const job of this.jobQueue.values()) {
      if (claimed.length >= batchSize) break;

      const isQueuedAndReady = job.status === 'queued' && (force || new Date(job.run_at) <= now);
      const isExpiredLock =
        job.status === 'running' &&
        job.lock_expires_at &&
        new Date(job.lock_expires_at) <= now &&
        job.attempts < job.max_attempts;

      if (isQueuedAndReady || isExpiredLock) {
        job.status = 'running';
        job.locked_at = now.toISOString();
        job.lock_expires_at = new Date(now.getTime() + lockDurationSeconds * 1000).toISOString();
        job.attempts += 1;
        job.updated_at = now.toISOString();
        claimed.push({ ...job });
      }
    }

    return claimed;
  }
}

// Global in-memory singleton for development / testing
const globalForDb = globalThis as unknown as { mockDb?: MockDatabase };
export const mockDb = globalForDb.mockDb ?? new MockDatabase();
if (process.env.NODE_ENV !== 'production') globalForDb.mockDb = mockDb;
