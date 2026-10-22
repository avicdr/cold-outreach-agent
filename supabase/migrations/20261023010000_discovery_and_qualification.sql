-- Migration: 20261023010000_discovery_and_qualification.sql
-- Autonomous AI Lead Discovery, Qualification, and Enrichment Engine

-- 1. Create discovery_jobs table
CREATE TABLE IF NOT EXISTS public.discovery_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  niche TEXT NOT NULL,
  location TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  radius_km INT NOT NULL DEFAULT 25,
  target_count INT NOT NULL DEFAULT 50,
  min_qualification_score INT NOT NULL DEFAULT 70,
  auto_enroll_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  auto_enroll_enabled BOOLEAN NOT NULL DEFAULT false,
  schedule_frequency TEXT NOT NULL DEFAULT 'once' CHECK (schedule_frequency IN ('once', 'daily', 'weekly')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'paused', 'failed')),
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  discovered_count INT NOT NULL DEFAULT 0,
  qualified_count INT NOT NULL DEFAULT 0,
  high_priority_count INT NOT NULL DEFAULT 0,
  enrolled_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add enrichment and qualification columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS normalized_phone TEXT,
  ADD COLUMN IF NOT EXISTS canonical_domain TEXT,
  ADD COLUMN IF NOT EXISTS place_id TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS rating NUMERIC(3, 2),
  ADD COLUMN IF NOT EXISTS review_count INT,
  ADD COLUMN IF NOT EXISTS google_maps_url TEXT,
  ADD COLUMN IF NOT EXISTS booking_url TEXT,
  ADD COLUMN IF NOT EXISTS has_online_booking BOOLEAN,
  ADD COLUMN IF NOT EXISTS contact_channels JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS observed_friction JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qualification_score INT,
  ADD COLUMN IF NOT EXISTS qualification_priority TEXT CHECK (qualification_priority IN ('high', 'review', 'low')),
  ADD COLUMN IF NOT EXISTS qualification_confidence TEXT CHECK (qualification_confidence IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS qualification_summary TEXT,
  ADD COLUMN IF NOT EXISTS sales_angle TEXT,
  ADD COLUMN IF NOT EXISTS suggested_opening TEXT,
  ADD COLUMN IF NOT EXISTS evidence_urls TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS discovery_job_id UUID REFERENCES public.discovery_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discovery_source TEXT DEFAULT 'places_api',
  ADD COLUMN IF NOT EXISTS discovery_timestamp TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- 3. Indexes for multi-signal deduplication
CREATE INDEX IF NOT EXISTS idx_leads_canonical_domain ON public.leads (user_id, canonical_domain) WHERE canonical_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_normalized_phone ON public.leads (user_id, normalized_phone) WHERE normalized_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_place_id ON public.leads (user_id, place_id) WHERE place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_qualification_score ON public.leads (user_id, qualification_score);
CREATE INDEX IF NOT EXISTS idx_leads_discovery_job_id ON public.leads (discovery_job_id);

-- 4. Indexes for discovery jobs
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_user_status ON public.discovery_jobs (user_id, status);
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_schedule ON public.discovery_jobs (status, next_run_at);
