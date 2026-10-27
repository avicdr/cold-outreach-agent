import { createClient } from './supabase/server';
import { createAdminClient } from './supabase/admin';
import { env } from './env';
import { isLiveSupabase } from './db-service';

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { cache } from 'react';
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from './admin-auth';

export interface AuthenticatedUser {
  id: string;
  email: string;
  isOwner: boolean;
}

export const OWNER_USER_ID = '5f9832c0-d340-4e0f-b2d8-b3f44a294697';

export const MOCK_OWNER_USER: AuthenticatedUser = {
  id: OWNER_USER_ID,
  email: env.ADMIN_EMAIL || env.OWNER_EMAIL || 'avi@arenova.in',
  isOwner: true,
};

/**
 * Validates the current request's user authentication.
 * In this single-user application, enforces single-owner configuration
 * and seamlessly authorizes the verified admin owner.
 * Deduplicated per-request via React.cache.
 */
let testAuthUser: AuthenticatedUser | null | undefined = undefined;

/**
 * Test helper for unit test isolation only. Completely inert outside test environment.
 */
export function setTestAuthUser(user: AuthenticatedUser | null | undefined) {
  if (process.env.NODE_ENV === 'test') {
    testAuthUser = user;
  }
}

/**
 * Validates the current request's user authentication.
 * Strictly verifies signed admin session cookies or active Supabase session.
 * Rejects unauthenticated requests by returning null.
 */
export const getAuthenticatedUser = cache(async function getAuthenticatedUser(
  request?: Request | NextRequest
): Promise<AuthenticatedUser | null> {
  const adminEmail = (env.ADMIN_EMAIL || env.OWNER_EMAIL || process.env.ADMIN_EMAIL || 'avi@arenova.in').trim().toLowerCase();

  // Test mode explicit override
  if (process.env.NODE_ENV === 'test' && testAuthUser !== undefined) {
    return testAuthUser;
  }

  let adminToken: string | undefined;

  // 1. Try extracting token from explicit request parameter if provided
  if (request) {
    // NextRequest cookies helper
    if ('cookies' in request && typeof (request as any).cookies?.get === 'function') {
      adminToken = (request as any).cookies.get(ADMIN_COOKIE_NAME)?.value;
    }

    // Header-based cookie fallback
    if (!adminToken && request.headers) {
      const cookieHeader = request.headers.get('cookie') || '';
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE_NAME}=([^;]*)`));
      if (match) {
        adminToken = decodeURIComponent(match[1]);
      }
      
      // Authorization Bearer token fallback for admin API calls
      if (!adminToken) {
        const authHeader = request.headers.get('authorization') || '';
        if (authHeader.startsWith('Bearer ')) {
          adminToken = authHeader.slice(7).trim();
        }
      }
    }
  }

  // 2. Try extracting from Next.js server cookie store
  if (!adminToken) {
    try {
      const cookieStore = await cookies();
      adminToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    } catch {
      // cookies() may throw in non-request test contexts
    }
  }

  // 3. Verify admin session token if found
  if (adminToken) {
    const session = await verifyAdminSessionToken(adminToken);
    if (session) {
      return {
        id: OWNER_USER_ID,
        email: session.email,
        isOwner: true,
      };
    }
  }

  // 4. Check Supabase cookie session if live Supabase is active
  if (isLiveSupabase()) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && user.email) {
        if (user.email.toLowerCase() === adminEmail) {
          return {
            id: user.id,
            email: user.email,
            isOwner: true,
          };
        }
      }
    } catch {
      // Cookie session check skipped
    }
  }

  // 5. In test environment without explicit testAuthUser override, allow default owner for legacy unit tests
  if (process.env.NODE_ENV === 'test') {
    return {
      id: OWNER_USER_ID,
      email: adminEmail,
      isOwner: true,
    };
  }

  // Unauthenticated: Strictly deny access
  return null;
});

/**
 * Requires user authentication for API routes. Returns user or throws error response.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}
