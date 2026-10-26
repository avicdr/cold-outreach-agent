-- Migration: 20261026030000_latency_optimizations.sql
-- Optimizes query performance and API response times across the application.
-- 1. Composite indexes for high-frequency queries and sorting
-- 2. PostgreSQL aggregation function for instantaneous single round-trip dashboard metrics

-- 1. Composite indexes
CREATE INDEX IF NOT EXISTS idx_leads_user_status ON public.leads(user_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_user_created ON public.leads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_user_group ON public.leads(user_id, group_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_created ON public.campaigns(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_status_lead ON public.email_messages(status, campaign_lead_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_sent_stats ON public.email_messages(email_account_id, status, sent_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON public.activity_logs(user_id, created_at DESC);

-- 2. Single round-trip dashboard counts aggregation function
CREATE OR REPLACE FUNCTION public.get_dashboard_counts(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_leads BIGINT := 0;
  v_eligible_leads BIGINT := 0;
  v_bounce_count BIGINT := 0;
  v_campaigns_count BIGINT := 0;
  v_active_campaigns_count BIGINT := 0;
  v_suppression_count BIGINT := 0;
  v_drafts_generated BIGINT := 0;
  v_emails_sent BIGINT := 0;
  v_replies_received BIGINT := 0;
  v_positive_replies BIGINT := 0;
  v_failed_jobs BIGINT := 0;
BEGIN
  -- Lead statistics
  SELECT
    COALESCE(COUNT(*), 0),
    COALESCE(COUNT(*) FILTER (WHERE status = 'active'), 0),
    COALESCE(COUNT(*) FILTER (WHERE status = 'bounced'), 0)
  INTO
    v_total_leads,
    v_eligible_leads,
    v_bounce_count
  FROM public.leads
  WHERE user_id = p_user_id;

  -- Campaign statistics
  SELECT
    COALESCE(COUNT(*), 0),
    COALESCE(COUNT(*) FILTER (WHERE status = 'active'), 0)
  INTO
    v_campaigns_count,
    v_active_campaigns_count
  FROM public.campaigns
  WHERE user_id = p_user_id;

  -- Suppression count
  SELECT
    COALESCE(COUNT(*), 0)
  INTO
    v_suppression_count
  FROM public.suppressions
  WHERE user_id = p_user_id;

  -- Reply statistics (excluding mailer-daemons and bounces)
  SELECT
    COALESCE(COUNT(*), 0),
    COALESCE(COUNT(*) FILTER (WHERE classification = 'positive'), 0)
  INTO
    v_replies_received,
    v_positive_replies
  FROM public.reply_events
  WHERE user_id = p_user_id
    AND sender_email NOT ILIKE '%mailer-daemon%'
    AND sender_email NOT ILIKE '%mail-daemon%'
    AND sender_email NOT ILIKE '%postmaster%';

  -- Email messages statistics for user's campaigns
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE em.status = 'draft'), 0),
    COALESCE(COUNT(*) FILTER (WHERE em.status = 'sent'), 0)
  INTO
    v_drafts_generated,
    v_emails_sent
  FROM public.email_messages em
  JOIN public.campaign_leads cl ON cl.id = em.campaign_lead_id
  JOIN public.campaigns c ON c.id = cl.campaign_id
  WHERE c.user_id = p_user_id;

  -- Failed jobs count
  SELECT
    COALESCE(COUNT(*), 0)
  INTO
    v_failed_jobs
  FROM public.job_queue
  WHERE status IN ('failed', 'dead');

  RETURN jsonb_build_object(
    'totalLeads', v_total_leads,
    'eligibleLeads', v_eligible_leads,
    'bounceCount', v_bounce_count,
    'campaignsCount', v_campaigns_count,
    'activeCampaignsCount', v_active_campaigns_count,
    'suppressionCount', v_suppression_count,
    'draftsGenerated', v_drafts_generated,
    'emailsSent', v_emails_sent,
    'repliesReceived', v_replies_received,
    'positiveReplies', v_positive_replies,
    'failedJobs', v_failed_jobs
  );
END;
$$;
