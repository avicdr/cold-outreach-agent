-- Add email_account_id and resume_url to campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES public.email_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS resume_url TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_campaigns_email_account_id ON public.campaigns(email_account_id);
