import { NextResponse } from 'next/server';
import { verifyAdminCredentials, createAdminSessionToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';
import { checkRateLimit, getClientIp, verifyCsrfOrigin } from '@/lib/security';

export async function POST(req: Request) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'Forbidden: Invalid request origin' }, { status: 403 });
    }

    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`login:${clientIp}`, 5, 60000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please wait a minute before trying again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const body = await req.json();
    const { email, password } = body || {};

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (!verifyAdminCredentials(email, password)) {
      return NextResponse.json(
        { error: 'Invalid admin credentials. Access restricted to authorized administrator only.' },
        { status: 401 }
      );
    }

    const token = await createAdminSessionToken(email);
    const response = NextResponse.json({
      success: true,
      message: 'Authenticated successfully as administrator',
      user: {
        email: email.trim().toLowerCase(),
        role: 'admin',
      },
    });

    response.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Authentication error' }, { status: 500 });
  }
}
