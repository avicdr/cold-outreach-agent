import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import WebSocket from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-expect-error polyfill for Node 20
  globalThis.WebSocket = WebSocket;
}

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Can happen in Server Components where cookies cannot be set
        }
      },
    },
  });
}
