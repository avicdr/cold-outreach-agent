-- Supabase Cold Email Automation Agent Schema
-- Migration: 20261020000000_init_schema.sql

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Profiles Table (Single-user business profile and sender defaults)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name TEXT NOT NULL DEFAULT '',
  business_website TEXT NOT NULL DEFAULT '',
  business_description TEXT NOT NULL DEFAULT '',
  value_proposition TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  sender_email TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  daily_send_limit INT NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Email Accounts (Encrypted OAuth credentials for Gmail)
CREATE TABLE IF NOT EXISTS public.email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gmail',
  email_address TEXT NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  granted_scopes TEXT[] NOT NULL DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_email_accounts_user_provider UNIQUE (user_id, provider)
);

-- 3. Leads Table
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  normalized_email TEXT NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  job_title TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'contacted', 'replied', 'unsubscribed', 'bounced')),
  source_import TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_leads_user_normalized_email UNIQUE (user_id, normalized_email)
);

-- 4. Campaigns Table
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  business_context TEXT NOT NULL DEFAULT '',
  ideal_customer_profile TEXT NOT NULL DEFAULT '',
  offer TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT 'Professional and concise',
  call_to_action TEXT NOT NULL DEFAULT '15-minute quick discovery call',
  initial_email_instructions TEXT NOT NULL DEFAULT '',
  sending_config JSONB NOT NULL DEFAULT '{
    "days": [1, 2, 3, 4, 5],
    "start_hour": 9,
    "end_hour": 17,
    "timezone": "Asia/Kolkata",
    "daily_limit": 10,
    "hourly_limit": 3
  }'::jsonb,
  followup_config JSONB NOT NULL DEFAULT '{
    "max_followups": 2,
    "steps": [
      { "step": 1, "delay_days": 4, "instructions": "Polite follow-up adding a new perspective or short case study" },
      { "step": 2, "delay_days": 9, "instructions": "Final friendly breakup email with low friction question" }
    ]
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ
);

-- 5. Campaign Leads (Enrollment join table)
CREATE TABLE IF NOT EXISTS public.campaign_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'drafted', 'in_progress', 'replied', 'unsubscribed', 'completed', 'failed')),
  current_step INT NOT NULL DEFAULT 0,
  next_action_at TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_campaign_leads_enrollment UNIQUE (campaign_id, lead_id)
);

-- 6. Email Messages Table
CREATE TABLE IF NOT EXISTS public.email_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_lead_id UUID NOT NULL REFERENCES public.campaign_leads(id) ON DELETE CASCADE,
  step_number INT NOT NULL DEFAULT 0,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  personalization_basis JSONB NOT NULL DEFAULT '[]'::jsonb,
  unsupported_claims JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_email_messages_step UNIQUE (campaign_lead_id, step_number)
);

-- 7. Suppressions Table (Global opt-out and bounce suppression)
CREATE TABLE IF NOT EXISTS public.suppressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  normalized_email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'unsubscribe' CHECK (reason IN ('unsubscribe', 'bounce', 'manual', 'complaint')),
  source TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_suppressions_user_email UNIQUE (user_id, normalized_email)
);

-- 8. Reply Events Table
CREATE TABLE IF NOT EXISTS public.reply_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  email_message_id UUID REFERENCES public.email_messages(id) ON DELETE SET NULL,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  classification TEXT NOT NULL DEFAULT 'other' CHECK (classification IN ('positive', 'neutral', 'objection', 'out_of_office', 'unsubscribe', 'other')),
  classification_summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_reply_events_gmail_msg UNIQUE (gmail_message_id)
);

-- 9. Job Queue Table (Persistent background tasks)
CREATE TABLE IF NOT EXISTS public.job_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type TEXT NOT NULL CHECK (job_type IN ('generate_email', 'send_email', 'sync_replies', 'schedule_followup', 'process_unsubscribe', 'reconcile_send', 'cleanup_expired_jobs')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT UNIQUE,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'dead')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  locked_at TIMESTAMPTZ,
  lock_expires_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Activity Logs Table (Audit trail)
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_user_normalized ON public.leads(user_id, normalized_email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_status ON public.campaigns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign ON public.campaign_leads(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_lead ON public.campaign_leads(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_next_action ON public.campaign_leads(next_action_at) WHERE status IN ('enrolled', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_email_messages_status_sched ON public.email_messages(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_gmail_msg ON public.email_messages(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_gmail_thread ON public.email_messages(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_suppressions_user_email ON public.suppressions(user_id, normalized_email);
CREATE INDEX IF NOT EXISTS idx_reply_events_thread ON public.reply_events(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_reply_events_user_received ON public.reply_events(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_queue_fetch ON public.job_queue(status, run_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_job_queue_locked ON public.job_queue(status, lock_expires_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs(user_id, created_at DESC);

-- PostgreSQL Atomic Job Claiming Function
CREATE OR REPLACE FUNCTION public.claim_jobs(
  p_worker_id TEXT,
  p_batch_size INT DEFAULT 5,
  p_lock_duration INTERVAL DEFAULT INTERVAL '5 minutes'
)
RETURNS SETOF public.job_queue
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.job_queue
  SET 
    status = 'running',
    locked_at = now(),
    lock_expires_at = now() + p_lock_duration,
    attempts = attempts + 1,
    updated_at = now()
  WHERE id IN (
    SELECT jq.id
    FROM public.job_queue jq
    WHERE 
      (jq.status = 'queued' AND jq.run_at <= now())
      OR (jq.status = 'running' AND jq.lock_expires_at <= now() AND jq.attempts < jq.max_attempts)
    ORDER BY jq.run_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  RETURNING *;
END;
$$;

-- RLS (Row Level Security) Configuration
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reply_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Note: job_queue is handled securely by backend service workers with service_role key
ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can access their own profile"
  ON public.profiles FOR ALL
  USING (auth.uid() = id);

CREATE POLICY "Users can access their own email accounts"
  ON public.email_accounts FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can access their own leads"
  ON public.leads FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can access their own campaigns"
  ON public.campaigns FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can access their campaign leads"
  ON public.campaign_leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_leads.campaign_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access their email messages"
  ON public.email_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_leads cl
      JOIN public.campaigns c ON c.id = cl.campaign_id
      WHERE cl.id = email_messages.campaign_lead_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access their suppressions"
  ON public.suppressions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can access their reply events"
  ON public.reply_events FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can access their activity logs"
  ON public.activity_logs FOR ALL
  USING (auth.uid() = user_id);
