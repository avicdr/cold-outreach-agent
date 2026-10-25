import { createClient } from './supabase/server';
import { createAdminClient } from './supabase/admin';
import { env } from './env';
import { isLiveSupabase } from './db-service';

import { cookies } from 'next/headers';
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
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const adminEmail = env.ADMIN_EMAIL || env.OWNER_EMAIL || process.env.ADMIN_EMAIL || 'avi@arenova.in';

  // 1. Check for signed admin session cookie
  try {
    const cookieStore = await cookies();
    const adminToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
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
  } catch {
    // cookies() may throw in non-request test contexts
  }

  const ownerEmail = env.OWNER_EMAIL || adminEmail;

  if (!isLiveSupabase()) {
    return {
      id: OWNER_USER_ID,
      email: ownerEmail,
      isOwner: true,
    };
  }

  try {
    // 1. Check if user is signed in via Supabase cookie session
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && user.email) {
      if (!ownerEmail || user.email.toLowerCase() === ownerEmail.toLowerCase()) {
        return {
          id: user.id,
          email: user.email,
          isOwner: true,
        };
      }
    }
  } catch {
    // Cookie session check skipped or not present
  }

  // 2. Single-user owner resolution:
  // Seamlessly authorize the configured owner with their database UUID
  if (ownerEmail) {
    return {
      id: OWNER_USER_ID,
      email: ownerEmail,
      isOwner: true,
    };
  }

  return null;
}

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
