-- Migration: Add 'paused' status to email_messages check constraint
ALTER TABLE public.email_messages 
DROP CONSTRAINT IF EXISTS email_messages_status_check;

ALTER TABLE public.email_messages 
ADD CONSTRAINT email_messages_status_check 
CHECK (status IN ('draft', 'scheduled', 'paused', 'sending', 'sent', 'failed', 'cancelled'));

-- Create index on status for faster filtering
CREATE INDEX IF NOT EXISTS idx_email_messages_status ON public.email_messages(status);
