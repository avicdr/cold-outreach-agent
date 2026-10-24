import OpenAI from 'openai';
import { env } from './env';

export interface CallOpenAIOptions {
  systemInstruction?: string;
  prompt: string;
  model?: string;
  responseMimeType?: string;
  temperature?: number;
}

/**
 * Returns an initialized OpenAI client or null if OPENAI_API_KEY is not configured.
 */
export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return null;
  }
  return new OpenAI({ apiKey: apiKey.trim() });
}

/**
 * Checks whether an OpenAI API key is present.
 */
export function isOpenAIConfigured(): boolean {
  const apiKey = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;
  return Boolean(apiKey && apiKey.trim().length > 0);
}

/**
 * Cleans markdown code fences or backticks from JSON string responses.
 */
export function cleanJsonText(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Calls OpenAI chat completion with automatic model fallback and JSON format support.
 */
export async function callOpenAIWithFallback(options: CallOpenAIOptions): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const configuredModel = options.model || process.env.OPENAI_MODEL || env.OPENAI_MODEL || 'gpt-4o-mini';
  const candidateModels = Array.from(
    new Set([configuredModel, 'gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'].filter(Boolean))
  );

  const isJsonExpected =
    options.responseMimeType === 'application/json' ||
    options.prompt.toLowerCase().includes('json') ||
    (options.systemInstruction && options.systemInstruction.toLowerCase().includes('json'));

  let systemPrompt = options.systemInstruction || '';
  if (isJsonExpected && !systemPrompt.toLowerCase().includes('json')) {
    systemPrompt = systemPrompt ? `${systemPrompt}\n\nRespond with valid JSON.` : 'Respond with valid JSON.';
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: options.prompt });

  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        response_format: isJsonExpected ? { type: 'json_object' } : undefined,
        temperature: options.temperature ?? 0.2,
      });

      const text = response.choices[0]?.message?.content;
      if (text && text.trim().length > 0) {
        return cleanJsonText(text);
      }
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || String(err);
      console.warn(`[OpenAI Fallback] Model ${model} failed (${msg}). Checking next candidate...`);
    }
  }

  throw lastError || new Error('All OpenAI candidate models failed');
}
