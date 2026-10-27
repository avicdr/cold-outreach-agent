import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().default('https://mock.supabase.co'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional().default('mock-anon-key'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default('mock-service-role-key'),
  DATABASE_URL: z.string().optional(),
  OWNER_EMAIL: z.string().email().optional(),
  ADMIN_EMAIL: z.string().email().default('avi@arenova.in'),
  ADMIN_PASSWORD: z.string().min(1).default('seekerop1@'),
  
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z.string().url().default('http://localhost:3000/api/integrations/google/callback'),

  APP_ENCRYPTION_KEY: z.string().min(32, 'APP_ENCRYPTION_KEY must be at least 32 characters').default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  CRON_SECRET: z.string().min(8, 'CRON_SECRET should be a secure random token').default('dev-cron-secret-12345'),
  UNSUBSCRIBE_SECRET: z.string().optional(),

  DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),
  DEFAULT_DAILY_SEND_LIMIT: z.coerce.number().int().positive().default(10),
  DEFAULT_MAX_FOLLOWUPS: z.coerce.number().int().nonnegative().default(2),
  
  MOCK_MODE: z.preprocess((val) => val === 'true' || val === true || val === '1', z.boolean()).default(false),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    OWNER_EMAIL: process.env.OWNER_EMAIL,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'avi@arenova.in',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'seekerop1@',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    UNSUBSCRIBE_SECRET: process.env.UNSUBSCRIBE_SECRET,
    DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE,
    DEFAULT_DAILY_SEND_LIMIT: process.env.DEFAULT_DAILY_SEND_LIMIT,
    DEFAULT_MAX_FOLLOWUPS: process.env.DEFAULT_MAX_FOLLOWUPS,
    MOCK_MODE: process.env.MOCK_MODE,
  });

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables configuration');
  }

  // Production Security Invariant Checks
  if (process.env.NODE_ENV === 'production') {
    const isDefaultKey = parsed.data.APP_ENCRYPTION_KEY === '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    if (isDefaultKey) {
      console.warn('⚠️ [SECURITY WARNING] APP_ENCRYPTION_KEY is using a development default. Set a strong private key in production runtime.');
    }

    const isDefaultCron =
      parsed.data.CRON_SECRET === 'dev-cron-secret-12345' ||
      parsed.data.CRON_SECRET === 'super-secret-cron-token-change-in-production';
    if (isDefaultCron) {
      console.warn('⚠️ [SECURITY WARNING] CRON_SECRET is using a development default. Set a strong secret token in production runtime.');
    }

    const isDefaultAdminPass = parsed.data.ADMIN_PASSWORD === 'seekerop1@';
    if (isDefaultAdminPass) {
      console.warn('⚠️ [SECURITY WARNING] ADMIN_PASSWORD is using a default password. Set ADMIN_PASSWORD in your production environment variables.');
    }
  }

  return parsed.data;
}

export const env = getEnv();
