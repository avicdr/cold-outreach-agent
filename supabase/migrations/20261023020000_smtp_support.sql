-- Migration: 20261023020000_smtp_support.sql
-- Adds SMTP & IMAP configuration columns to email_accounts for GoDaddy / Titan / custom email hosting

ALTER TABLE public.email_accounts 
  ADD COLUMN IF NOT EXISTS smtp_host TEXT,
  ADD COLUMN IF NOT EXISTS smtp_port INT,
  ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS smtp_username TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_smtp_password TEXT,
  ADD COLUMN IF NOT EXISTS imap_host TEXT,
  ADD COLUMN IF NOT EXISTS imap_port INT;
