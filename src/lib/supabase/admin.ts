import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env';
import WebSocket from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-expect-error polyfill for Node 20
  globalThis.WebSocket = WebSocket;
}

let cachedAdminClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cachedAdminClient) {
    return cachedAdminClient;
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key';

  cachedAdminClient = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedAdminClient;
}
