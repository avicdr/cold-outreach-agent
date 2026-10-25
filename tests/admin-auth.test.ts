import { describe, it, expect } from 'vitest';
import { verifyAdminCredentials, createAdminSessionToken, verifyAdminSessionToken } from '@/lib/admin-auth';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { POST as logoutPost } from '@/app/api/auth/logout/route';

describe('Admin Authentication System', () => {
  it('validates single-owner credentials for avi@arenova.in / seekerop1@', () => {
    expect(verifyAdminCredentials('avi@arenova.in', 'seekerop1@')).toBe(true);
    expect(verifyAdminCredentials('AVI@ARENOVA.IN', 'seekerop1@')).toBe(true);
    expect(verifyAdminCredentials('avi@arenova.in ', 'seekerop1@')).toBe(true);
    expect(verifyAdminCredentials('wrong@arenova.in', 'seekerop1@')).toBe(false);
    expect(verifyAdminCredentials('avi@arenova.in', 'wrongpassword')).toBe(false);
    expect(verifyAdminCredentials('', '')).toBe(false);
  });

  it('generates and verifies signed admin session token', async () => {
    const token = await createAdminSessionToken('avi@arenova.in');
    expect(typeof token).toBe('string');
    expect(token.includes('.')).toBe(true);

    const session = await verifyAdminSessionToken(token);
    expect(session).not.toBeNull();
    expect(session?.email).toBe('avi@arenova.in');
    expect(session?.role).toBe('admin');
  });

  it('rejects tampered or forged session token', async () => {
    const token = await createAdminSessionToken('avi@arenova.in');
    const tampered = token.slice(0, -4) + 'abcd';
    const session = await verifyAdminSessionToken(tampered);
    expect(session).toBeNull();
  });

  it('POST /api/auth/login validates credentials and sets session cookie', async () => {
    const validReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'avi@arenova.in', password: 'seekerop1@' }),
    });

    const res = await loginPost(validReq);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.user.email).toBe('avi@arenova.in');

    const invalidReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'avi@arenova.in', password: 'wrong' }),
    });

    const invalidRes = await loginPost(invalidReq);
    expect(invalidRes.status).toBe(401);
  });

  it('POST /api/auth/logout succeeds', async () => {
    const res = await logoutPost();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
