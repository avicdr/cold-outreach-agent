-- Migration: 20261023000000_warmup_system.sql
-- Adds warmup configurations, daily ramp schedule, and reputation metrics for account groups and inboxes.

-- 1. Warmup columns on account_groups
ALTER TABLE public.account_groups
  ADD COLUMN IF NOT EXISTS is_warmup_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warmup_daily_limit INT NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS warmup_ramp_per_day INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS warmup_reply_rate INT NOT NULL DEFAULT 70;

-- 2. Warmup columns on email_accounts
ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS warmup_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warmup_status TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS warmup_day_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_sent_today INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_received_today INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_warmup_sent INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_warmup_received INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_reputation_score INT NOT NULL DEFAULT 100;

-- 3. Create warmup_messages table for tracking peer warmup exchanges
CREATE TABLE IF NOT EXISTS public.warmup_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_account_id UUID NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  to_account_id UUID NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.account_groups(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('queued', 'sent', 'replied', 'failed')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warmup_messages_from ON public.warmup_messages(from_account_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_warmup_messages_to ON public.warmup_messages(to_account_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_warmup_messages_group ON public.warmup_messages(group_id);

ALTER TABLE public.warmup_messages ENABLE ROW LEVEL SECURITY;
