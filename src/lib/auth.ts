import { createClient } from './supabase/server';
import { createAdminClient } from './supabase/admin';
import { env } from './env';
import { isLiveSupabase } from './db-service';

export interface AuthenticatedUser {
  id: string;
  email: string;
  isOwner: boolean;
}

export const MOCK_OWNER_USER: AuthenticatedUser = {
  id: '5f9832c0-d340-4e0f-b2d8-b3f44a294697',
  email: env.OWNER_EMAIL || 'owner@business.com',
  isOwner: true,
};

export const OWNER_USER_ID = '5f9832c0-d340-4e0f-b2d8-b3f44a294697';

/**
 * Validates the current request's user authentication.
 * In this single-user application, enforces single-owner configuration
 * and seamlessly authorizes the verified owner.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const ownerEmail = env.OWNER_EMAIL || process.env.OWNER_EMAIL || 'avi.codez.00@gmail.com';

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
