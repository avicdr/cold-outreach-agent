-- Migration: 20261027000000_security_hardening.sql
-- Production Security Hardening: RLS for discovery jobs, warmup messages, and function permission lockdown

-- 1. Discovery Jobs RLS
ALTER TABLE public.discovery_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'discovery_jobs' AND policyname = 'Users can access their own discovery jobs'
  ) THEN
    CREATE POLICY "Users can access their own discovery jobs"
      ON public.discovery_jobs FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 2. Warmup Messages RLS
ALTER TABLE public.warmup_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'warmup_messages' AND policyname = 'Users can access their own warmup messages'
  ) THEN
    CREATE POLICY "Users can access their own warmup messages"
      ON public.warmup_messages FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.email_accounts ea
          WHERE (ea.id = warmup_messages.from_account_id OR ea.id = warmup_messages.to_account_id)
            AND ea.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 3. Function Permissions Lockdown
-- Ensure internal backend queue workers execute claim_jobs, but client-side users cannot directly claim arbitrary jobs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'claim_jobs') THEN
    REVOKE EXECUTE ON FUNCTION public.claim_jobs(TEXT, INT, INTERVAL) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.claim_jobs(TEXT, INT, INTERVAL) TO service_role;
  END IF;
END $$;

-- Ensure get_dashboard_counts cannot be executed anonymously
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_dashboard_counts') THEN
    REVOKE EXECUTE ON FUNCTION public.get_dashboard_counts(UUID) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_dashboard_counts(UUID) TO authenticated, service_role;
  END IF;
END $$;
