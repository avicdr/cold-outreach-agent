-- Migration: 20261024000000_lead_groups.sql
-- Enables grouping of leads, batch uploading leads into groups, and filtering leads by group.

-- 1. Create lead_groups table
CREATE TABLE IF NOT EXISTS public.lead_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add group_id to leads table
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.lead_groups(id) ON DELETE SET NULL;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_leads_group ON public.leads(group_id);
CREATE INDEX IF NOT EXISTS idx_lead_groups_user ON public.lead_groups(user_id);

-- 4. Unique constraint on (user_id, name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_lead_groups_user_name'
  ) THEN
    ALTER TABLE public.lead_groups ADD CONSTRAINT uq_lead_groups_user_name UNIQUE (user_id, name);
  END IF;
END $$;

-- 5. RLS Policies
ALTER TABLE public.lead_groups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their own lead groups'
  ) THEN
    CREATE POLICY "Users can access their own lead groups"
      ON public.lead_groups FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;
