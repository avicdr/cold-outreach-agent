-- Migration: 20261031000000_email_verification_reacher.sql
-- Description: Add email verification and deliverability fields to leads table to prevent bounces via Reacher / check-if-email-exists

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unverified';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS verification_details JSONB DEFAULT NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ DEFAULT NULL;

-- Performance indexes for querying unverified leads or filtering by deliverability
CREATE INDEX IF NOT EXISTS idx_leads_verification_status ON public.leads(verification_status);
CREATE INDEX IF NOT EXISTS idx_leads_is_verified ON public.leads(is_verified);

