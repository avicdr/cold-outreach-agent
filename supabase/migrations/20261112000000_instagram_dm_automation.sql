-- Migration: 20261112000000_instagram_dm_automation.sql
-- Segregated Instagram DM Automation Engine (Accounts, Lead Groups, Leads, Campaigns, Messages, Replies)

-- 1. Instagram Accounts Table
CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  ig_user_id TEXT,
  auth_method TEXT NOT NULL DEFAULT 'session' CHECK (auth_method IN ('login', 'session', 'graph_api')),
  encrypted_session_id TEXT,
  encrypted_cookies_json TEXT,
  encrypted_password TEXT,
  encrypted_access_token TEXT,
  daily_limit INT NOT NULL DEFAULT 25,
  min_interval_minutes INT NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error', 'challenge_required')),
  last_error TEXT,
  last_sent_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_instagram_accounts_user_username UNIQUE (user_id, username)
);

-- 2. Instagram Lead Groups Table
CREATE TABLE IF NOT EXISTS public.instagram_lead_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_instagram_lead_groups_user_name UNIQUE (user_id, name)
);

-- 3. Instagram Leads Table (independent from email leads)
CREATE TABLE IF NOT EXISTS public.instagram_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  normalized_handle TEXT DEFAULT '',
  instagram_handle TEXT NOT NULL DEFAULT '',
  instagram_url TEXT NOT NULL DEFAULT '',
  ig_user_id TEXT,
  full_name TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  niche TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  followers_count INT,
  website TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  personalization_hook TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  group_id UUID REFERENCES public.instagram_lead_groups(id) ON DELETE SET NULL,
  source_email_lead_id UUID,
  source_import TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'contacted', 'replied', 'do_not_contact', 'invalid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_instagram_leads_user_handle
  ON public.instagram_leads (user_id, normalized_handle)
  WHERE normalized_handle IS NOT NULL AND normalized_handle <> '';

-- 4. Instagram Campaigns Table (independent from email campaigns)
CREATE TABLE IF NOT EXISTS public.instagram_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  business_context TEXT NOT NULL DEFAULT '',
  ideal_customer_profile TEXT NOT NULL DEFAULT '',
  offer TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT 'Casual, warm, conversational, zero fluff',
  call_to_action TEXT NOT NULL DEFAULT 'Quick chat or 10-minute intro call',
  initial_dm_instructions TEXT NOT NULL DEFAULT 'Keep under 60 words. Sound like a real human DM, not an email.',
  sending_config JSONB NOT NULL DEFAULT '{
    "days": [1, 2, 3, 4, 5],
    "start_hour": 9,
    "end_hour": 20,
    "timezone": "Asia/Kolkata",
    "daily_limit": 25,
    "hourly_limit": 6
  }'::jsonb,
  followup_config JSONB NOT NULL DEFAULT '{
    "max_followups": 2,
    "steps": [
      { "step": 1, "delay_days": 3, "instructions": "Friendly short follow-up bump with a relevant quick insight" },
      { "step": 2, "delay_days": 7, "instructions": "Light final check-in with a low-friction question" }
    ]
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ
);

-- 5. Instagram Campaign Leads (Enrollment join table)
CREATE TABLE IF NOT EXISTS public.instagram_campaign_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.instagram_campaigns(id) ON DELETE CASCADE,
  instagram_lead_id UUID NOT NULL REFERENCES public.instagram_leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'drafted', 'in_progress', 'replied', 'do_not_contact', 'completed', 'failed')),
  current_step INT NOT NULL DEFAULT 0,
  next_action_at TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_instagram_campaign_leads_enrollment UNIQUE (campaign_id, instagram_lead_id)
);

-- 6. Instagram Messages Table
CREATE TABLE IF NOT EXISTS public.instagram_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_lead_id UUID NOT NULL REFERENCES public.instagram_campaign_leads(id) ON DELETE CASCADE,
  step_number INT NOT NULL DEFAULT 0,
  body_text TEXT NOT NULL,
  personalization_basis JSONB NOT NULL DEFAULT '[]'::jsonb,
  unsupported_claims JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'paused', 'sending', 'sent', 'failed', 'cancelled')),
  instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  ig_thread_id TEXT,
  ig_message_id TEXT,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_instagram_messages_step UNIQUE (campaign_lead_id, step_number)
);

-- 7. Instagram Reply Events Table
CREATE TABLE IF NOT EXISTS public.instagram_reply_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  instagram_message_id UUID REFERENCES public.instagram_messages(id) ON DELETE SET NULL,
  instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  ig_thread_id TEXT NOT NULL,
  ig_message_id TEXT NOT NULL,
  sender_handle TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  classification TEXT NOT NULL DEFAULT 'other' CHECK (classification IN ('positive', 'neutral', 'objection', 'out_of_office', 'unsubscribe', 'other')),
  classification_summary TEXT NOT NULL DEFAULT '',
  reply_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_instagram_reply_events_msg UNIQUE (user_id, ig_message_id)
);

-- 8. Expand job_queue.job_type check constraint for Instagram DM jobs
ALTER TABLE public.job_queue DROP CONSTRAINT IF EXISTS job_queue_job_type_check;
ALTER TABLE public.job_queue ADD CONSTRAINT job_queue_job_type_check CHECK (
  job_type IN (
    'generate_email',
    'send_email',
    'sync_replies',
    'schedule_followup',
    'process_unsubscribe',
    'reconcile_send',
    'process_warmup',
    'send_warmup_email',
    'process_discovery',
    'cleanup_expired_jobs',
    'generate_ig_dm',
    'send_ig_dm',
    'schedule_ig_followup',
    'sync_ig_replies'
  )
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ig_accounts_user ON public.instagram_accounts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ig_leads_user ON public.instagram_leads(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ig_leads_group ON public.instagram_leads(group_id);
CREATE INDEX IF NOT EXISTS idx_ig_campaigns_user_status ON public.instagram_campaigns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ig_campaign_leads_campaign ON public.instagram_campaign_leads(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_ig_messages_status_sched ON public.instagram_messages(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_ig_messages_thread ON public.instagram_messages(ig_thread_id);
CREATE INDEX IF NOT EXISTS idx_ig_reply_events_user ON public.instagram_reply_events(user_id, received_at DESC);

-- RLS Policies
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_lead_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_reply_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access their own instagram accounts" ON public.instagram_accounts;
CREATE POLICY "Users can access their own instagram accounts"
  ON public.instagram_accounts FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can access their own instagram lead groups" ON public.instagram_lead_groups;
CREATE POLICY "Users can access their own instagram lead groups"
  ON public.instagram_lead_groups FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can access their own instagram leads" ON public.instagram_leads;
CREATE POLICY "Users can access their own instagram leads"
  ON public.instagram_leads FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can access their own instagram campaigns" ON public.instagram_campaigns;
CREATE POLICY "Users can access their own instagram campaigns"
  ON public.instagram_campaigns FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can access their instagram campaign leads" ON public.instagram_campaign_leads;
CREATE POLICY "Users can access their instagram campaign leads"
  ON public.instagram_campaign_leads FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.instagram_campaigns c
      WHERE c.id = instagram_campaign_leads.campaign_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can access their instagram messages" ON public.instagram_messages;
CREATE POLICY "Users can access their instagram messages"
  ON public.instagram_messages FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.instagram_campaign_leads cl
      JOIN public.instagram_campaigns c ON c.id = cl.campaign_id
      WHERE cl.id = instagram_messages.campaign_lead_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can access their instagram reply events" ON public.instagram_reply_events;
CREATE POLICY "Users can access their instagram reply events"
  ON public.instagram_reply_events FOR ALL USING (auth.uid() = user_id);
