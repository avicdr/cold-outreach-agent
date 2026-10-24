import { NextResponse } from 'next/server';
import { isLiveSupabase } from '@/lib/db-service';
import { env } from '@/lib/env';
import { isOpenAIConfigured } from '@/lib/openai';

export async function GET() {
  const hasGemini = Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim());
  const hasOpenAI = isOpenAIConfigured();

  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'cold-outreach-agent',
    database: isLiveSupabase() ? 'supabase-postgresql' : 'mock-in-memory',
    ai_provider: hasGemini ? 'gemini' : hasOpenAI ? 'openai' : 'mock',
    ai_fallback_available: hasGemini && hasOpenAI,
    gemini_model: env.GEMINI_MODEL,
    openai_model: env.OPENAI_MODEL,
    mock_mode: env.MOCK_MODE,
  });
}
