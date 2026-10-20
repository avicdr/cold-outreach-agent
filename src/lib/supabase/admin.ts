import { createClient } from '@supabase/supabase-js';
import { env } from '../env';
import WebSocket from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-expect-error polyfill for Node 20
  globalThis.WebSocket = WebSocket;
}

export function createAdminClient() {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key';

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
