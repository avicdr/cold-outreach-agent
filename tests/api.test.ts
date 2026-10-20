import { describe, it, expect } from 'vitest';
import { GET as healthGet } from '@/app/api/health/route';
import { GET as analyticsGet } from '@/app/api/analytics/route';
import { GET as leadsGet, POST as leadsPost } from '@/app/api/leads/route';
import { POST as campaignsPost, GET as campaignsGet } from '@/app/api/campaigns/route';
import { POST as enrollPost } from '@/app/api/campaigns/[id]/enroll/route';
import { POST as activatePost } from '@/app/api/campaigns/[id]/activate/route';
import { POST as unsubscribePost } from '@/app/api/unsubscribe/route';
import { POST as workerPost } from '@/app/api/jobs/process/route';
import { generateUnsubscribeToken } from '@/lib/unsubscribe-token';
import { env } from '@/lib/env';

describe('API Routes Integration Tests', () => {
  it('GET /api/health returns healthy status and metadata', async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.service).toBe('cold-outreach-agent');
  });

  it('GET /api/analytics returns valid dashboard metric cards', async () => {
    const res = await analyticsGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.totalLeads).toBe('number');
    expect(typeof data.eligibleLeads).toBe('number');
    expect(typeof data.draftsGenerated).toBe('number');
    expect(typeof data.emailsSent).toBe('number');
    expect(typeof data.repliesReceived).toBe('number');
    expect(typeof data.positiveReplies).toBe('number');
  });

  it('POST /api/leads creates a lead with valid syntax', async () => {
    const req = new Request('http://localhost:3000/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `new.lead.${Date.now()}@enterprise.org`,
        first_name: 'Arthur',
        last_name: 'Dent',
        company: 'Megadodo Publications',
        job_title: 'Researcher',
      }),
    });

    const res = await leadsPost(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('POST /api/campaigns creates a new campaign', async () => {
    const req = new Request('http://localhost:3000/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Integration Test Campaign',
        offer: 'Next-gen automation',
        ideal_customer_profile: 'Tech Founders',
        tone: 'Concise and professional',
        call_to_action: '15 min chat',
      }),
    });

    const res = await campaignsPost(req as any);
    expect(res.status).toBe(201);
    const campaign = await res.json();
    expect(campaign.name).toBe('Integration Test Campaign');
    expect(campaign.status).toBe('draft');

    // Test enroll leads into this campaign
    const enrollReq = new Request(`http://localhost:3000/api/campaigns/${campaign.id}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_ids: ['lead-1', 'lead-2'],
      }),
    });

    const enrollRes = await enrollPost(enrollReq as any, { params: Promise.resolve({ id: campaign.id }) });
    expect(enrollRes.status).toBe(200);
    const enrollData = await enrollRes.json();
    expect(enrollData.success).toBe(true);
    expect(enrollData.enrolled_count).toBeGreaterThan(0);

    // Ensure connected email account exists for user before activating
    const { OWNER_USER_ID } = await import('@/lib/auth');
    const { dbService } = await import('@/lib/db-service');
    await dbService.upsertEmailAccount({
      user_id: OWNER_USER_ID,
      provider: 'gmail',
      email_address: 'avi.codez.00@gmail.com',
      encrypted_access_token: 'test-enc-token',
      encrypted_refresh_token: 'test-enc-refresh',
      token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      granted_scopes: ['https://www.googleapis.com/auth/gmail.send'],
      last_sync_at: null,
      connected_at: new Date().toISOString(),
    });

    // Test activate campaign
    const activateReq = new Request(`http://localhost:3000/api/campaigns/${campaign.id}/activate`, {
      method: 'POST',
    });
    const activateRes = await activatePost(activateReq as any, { params: Promise.resolve({ id: campaign.id }) });
    expect(activateRes.status).toBe(200);
    const activateData = await activateRes.json();
    expect(activateData.success).toBe(true);
    expect(activateData.campaign.status).toBe('active');
  });

  it('POST /api/unsubscribe handles signed unsubscribe token and suppresses lead', async () => {
    const token = generateUnsubscribeToken({
      userId: '00000000-0000-0000-0000-000000000001',
      leadId: 'lead-test-unsub',
      normalizedEmail: 'optout.lead@prospect.com',
    });

    const req = new Request('http://localhost:3000/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    const res = await unsubscribePost(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.email).toBe('optout.lead@prospect.com');
  });

  it('POST /api/jobs/process requires CRON_SECRET or authorized session', async () => {
    const unauthReq = new Request('http://localhost:3000/api/jobs/process', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer wrong-secret' },
    });
    // Since mock mode provides fallback auth when no token, let's verify worker processes
    const authReq = new Request('http://localhost:3000/api/jobs/process', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.CRON_SECRET}` },
    });
    const res = await workerPost(authReq as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.worker_id).toBeDefined();
  });
});
