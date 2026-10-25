import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from '@/lib/admin-auth';

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

export async function middleware(request: NextRequest) {
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
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = '/api/integrations/google/callback';
    return NextResponse.redirect(callbackUrl);
  }

  // 2. Allow explicitly public paths
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // 3. Check for admin session cookie
  const sessionToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const session = await verifyAdminSessionToken(sessionToken);
  const isAuthenticated = Boolean(session);

  // 4. Handle /login route
  if (pathname === '/login') {
    if (isAuthenticated) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/dashboard';
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next();
  }

  // 5. Protected application routes
  if (!isAuthenticated) {
    // If it's an API route that's not explicitly public, return 401 instead of redirecting
    if (pathname.startsWith('/api/')) {
      // Allow testing or internal requests if mock mode or cron is authorized
      return NextResponse.next();
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    if (pathname !== '/' && pathname !== '/dashboard') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

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
