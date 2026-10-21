-- Migration: 20261021000000_multi_account_and_groups.sql
-- Enables multiple email accounts, account grouping, per-inbox rate limiting, and campaign group assignment.

-- 1. Create account_groups table
CREATE TABLE IF NOT EXISTS public.account_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Modify email_accounts table
-- Drop single-account constraint if it exists
ALTER TABLE public.email_accounts DROP CONSTRAINT IF EXISTS uq_email_accounts_user_provider;

-- Add new columns to email_accounts
ALTER TABLE public.email_accounts 
  ADD COLUMN IF NOT EXISTS sender_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.account_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS daily_limit INT NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS min_interval_minutes INT NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;

-- Add unique constraint on (user_id, email_address)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_email_accounts_user_email'
  ) THEN
    ALTER TABLE public.email_accounts ADD CONSTRAINT uq_email_accounts_user_email UNIQUE (user_id, email_address);
  END IF;
END $$;

-- 3. Add account_group_id to campaigns
ALTER TABLE public.campaigns 
  ADD COLUMN IF NOT EXISTS account_group_id UUID REFERENCES public.account_groups(id) ON DELETE SET NULL;

-- 4. Add email_account_id to email_messages
ALTER TABLE public.email_messages 
  ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES public.email_accounts(id) ON DELETE SET NULL;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON public.email_accounts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_email_accounts_group ON public.email_accounts(group_id);
CREATE INDEX IF NOT EXISTS idx_account_groups_user ON public.account_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_group ON public.campaigns(account_group_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_account ON public.email_messages(email_account_id, sent_at);

-- 6. RLS Policies
ALTER TABLE public.account_groups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their own account groups'
  ) THEN
    CREATE POLICY "Users can access their own account groups"
      ON public.account_groups FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;
