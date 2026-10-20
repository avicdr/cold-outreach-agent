import { NextResponse } from 'next/server';
import { isLiveSupabase } from '@/lib/db-service';
import { env } from '@/lib/env';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'cold-outreach-agent',
    database: isLiveSupabase() ? 'supabase-postgresql' : 'mock-in-memory',
    gemini_model: env.GEMINI_MODEL,
    mock_mode: env.MOCK_MODE,
  });
}
