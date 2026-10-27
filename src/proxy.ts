import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from '@/lib/admin-auth';
import { isSafeRedirectUrl } from '@/lib/security';

// Paths that never require authentication
const PUBLIC_FILE_EXTENSIONS = [
  '.ico',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.webp',
  '.gif',
  '.woff',
  '.woff2',
  '.ttf',
];

const PUBLIC_PATH_PREFIXES = [
  '/_next',
  '/api/auth',
  '/api/health',
  '/api/jobs/process',
  '/api/unsubscribe',
  '/api/integrations/google/callback',
  '/privacy',
  '/tos',
  '/unsubscribe',
];

function getPublicUrl(path: string, request: NextRequest): URL {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost && !forwardedHost.includes('10000') && !forwardedHost.includes('localhost:')) {
    return new URL(path, `${forwardedProto}://${forwardedHost}`);
  }
  return new URL(path, request.nextUrl.origin);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow public static assets
  if (PUBLIC_FILE_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
    return NextResponse.next();
  }

  // 1.5 Intercept any OAuth callback that landed at root or any other URL
  if (
    pathname !== '/api/integrations/google/callback' &&
    request.nextUrl.searchParams.has('code') &&
    request.nextUrl.searchParams.has('state')
  ) {
    const callbackUrl = getPublicUrl(`/api/integrations/google/callback?${request.nextUrl.searchParams.toString()}`, request);
    return NextResponse.redirect(callbackUrl);
  }

  // 2. Allow explicitly public paths
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // 2.5 Allow CRON_SECRET authenticated calls to jobs APIs
  if (pathname.startsWith('/api/jobs')) {
    const authHeader = request.headers.get('authorization') || '';
    const cronSecret = process.env.CRON_SECRET || 'dev-cron-secret-12345';
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      return NextResponse.next();
    }
  }

  // 3. Check for admin session cookie or Bearer token
  const sessionToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const session = await verifyAdminSessionToken(sessionToken);
  const isAuthenticated = Boolean(session);

  // 4. Handle /login route
  if (pathname === '/login') {
    if (isAuthenticated) {
      const redirectParam = request.nextUrl.searchParams.get('redirect');
      const safeRedirect = isSafeRedirectUrl(redirectParam, '/dashboard');
      const redirectUrl = getPublicUrl(safeRedirect, request);
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next();
  }

  // 5. Protected application routes
  if (!isAuthenticated) {
    // If it's an API route that's not explicitly public, return 401 instead of redirecting
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required' },
        { status: 401 }
      );
    }

    const rawRedirect = (pathname !== '/' && pathname !== '/dashboard') ? pathname : '';
    const safeRedirect = rawRedirect ? isSafeRedirectUrl(rawRedirect, '') : '';
    const redirectQuery = safeRedirect ? `?redirect=${encodeURIComponent(safeRedirect)}` : '';
    const loginUrl = getPublicUrl(`/login${redirectQuery}`, request);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Next.js 16 supports proxy as standard export
export default proxy;

// Maintain middleware named export for backward compatibility
export const middleware = proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
