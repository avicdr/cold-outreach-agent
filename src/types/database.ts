export type LeadStatus = 'active' | 'contacted' | 'replied' | 'unsubscribed' | 'bounced';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
export type CampaignLeadStatus = 'enrolled' | 'drafted' | 'in_progress' | 'replied' | 'unsubscribed' | 'completed' | 'failed';
export type EmailMessageStatus = 'draft' | 'scheduled' | 'paused' | 'sending' | 'sent' | 'failed' | 'cancelled';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'dead';
export type JobType = 
  | 'generate_email' 
  | 'send_email' 
  | 'sync_replies' 
  | 'schedule_followup' 
  | 'process_unsubscribe' 
  | 'reconcile_send' 
  | 'process_warmup'
  | 'send_warmup_email'
  | 'process_discovery'
  | 'cleanup_expired_jobs';

export type ReplyClassification = 'positive' | 'neutral' | 'objection' | 'out_of_office' | 'unsubscribe' | 'other';
export type SuppressionReason = 'unsubscribe' | 'bounce' | 'manual' | 'complaint';
export type WarmupStatus = 'inactive' | 'warming' | 'warm' | 'paused';

export interface Profile {
  id: string;
  business_name: string;
  business_website: string;
  business_description: string;
  value_proposition: string;
  sender_name: string;
  sender_email: string;
  timezone: string;
  daily_send_limit: number;
  created_at: string;
  updated_at: string;
}

export interface AccountGroup {
  id: string;
  user_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  // Warmup configuration
  is_warmup_enabled?: boolean;
  warmup_daily_limit?: number; // Target max warmup emails per inbox per day (default 15)
  warmup_ramp_per_day?: number; // Daily increment (default 2)
  warmup_reply_rate?: number; // Target reply % (default 70)
  // Computed / joined fields
  accounts_count?: number;
  daily_capacity?: number;
}

export interface LeadGroup {
  id: string;
  user_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  leads_count?: number;
}

export type EmailAccountStatus = 'active' | 'paused' | 'error';

export interface EmailAccount {
  id: string;
  user_id: string;
  provider: 'gmail' | 'smtp' | string;
  email_address: string;
  sender_name?: string;
  group_id?: string | null;
  daily_limit: number; // default 18 (typically 15-18)
  min_interval_minutes: number; // default 15 mins
  status: EmailAccountStatus;
  last_sent_at?: string | null;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  token_expires_at: string | null;
  granted_scopes: string[];
  last_sync_at: string | null;
  connected_at: string;
  created_at: string;
  updated_at: string;
  // Warmup properties
  warmup_enabled?: boolean;
  warmup_status?: WarmupStatus;
  warmup_day_count?: number;
  warmup_sent_today?: number;
  warmup_received_today?: number;
  total_warmup_sent?: number;
  total_warmup_received?: number;
  warmup_reputation_score?: number;
  // SMTP / IMAP properties
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_secure?: boolean | null;
  smtp_username?: string | null;
  encrypted_smtp_password?: string | null;
  imap_host?: string | null;
  imap_port?: number | null;
  // Computed / joined fields
  group?: AccountGroup | null;
  sent_today?: number;
  remaining_today?: number;
}

export interface WarmupMessage {
  id: string;
  from_account_id: string;
  to_account_id: string;
  group_id?: string | null;
  subject: string;
  body_text: string;
  gmail_message_id?: string | null;
  gmail_thread_id?: string | null;
  status: 'queued' | 'sent' | 'replied' | 'failed';
  sent_at: string;
  replied_at?: string | null;
  created_at: string;
}

export interface AccountDailyStats {
  totalAccounts: number;
  activeAccounts: number;
  dailyCapacity: number;
  sentToday: number;
  remainingToday: number;
  accounts: (EmailAccount & {
    sent_today: number;
    remaining_today: number;
  })[];
}

export type DiscoveryJobStatus = 'queued' | 'running' | 'completed' | 'paused' | 'failed';
export type DiscoveryScheduleFrequency = 'once' | 'daily' | 'weekly';
export type QualificationPriority = 'high' | 'review' | 'low';
export type QualificationConfidence = 'high' | 'medium' | 'low';

export interface ObservedFrictionItem {
  finding: string;
  evidence_type: 'observed' | 'inferred';
  source_url: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface LeadQualificationResult {
  business_category: string;
  ideal_customer_fit: boolean;
  lead_score: number;
  priority: QualificationPriority;
  confidence: QualificationConfidence;
  qualification_summary: string;
  observed_friction: ObservedFrictionItem[];
  unknowns: string[];
  recommended_sales_angle: string;
  suggested_opening: string;
  disqualification_reasons: string[];
}

export interface Lead {
  id: string;
  user_id: string;
  normalized_email: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  job_title: string;
  website: string;
  notes: string;
  custom_fields: Record<string, string | number | boolean>;
  status: LeadStatus;
  source_import: string;
  group_id?: string | null;
  lead_group?: LeadGroup | null;
  created_at: string;
  updated_at: string;
  // Enriched & Qualified Discovery fields
  phone?: string | null;
  normalized_phone?: string | null;
  canonical_domain?: string | null;
  place_id?: string | null;
  category?: string | null;
  subcategory?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  rating?: number | null;
  review_count?: number | null;
  google_maps_url?: string | null;
  booking_url?: string | null;
  has_online_booking?: boolean | null;
  contact_channels?: string[];
  observed_friction?: ObservedFrictionItem[];
  qualification_score?: number | null;
  qualification_priority?: QualificationPriority | null;
  qualification_confidence?: QualificationConfidence | null;
  qualification_summary?: string | null;
  sales_angle?: string | null;
  suggested_opening?: string | null;
  evidence_urls?: string[];
  discovery_job_id?: string | null;
  discovery_source?: string | null;
  discovery_timestamp?: string | null;
  last_enriched_at?: string | null;
  is_verified?: boolean;
}

export interface DiscoveryJob {
  id: string;
  user_id: string;
  name: string;
  niche: string;
  location: string;
  country: string;
  radius_km: number;
  target_count: number;
  min_qualification_score: number;
  auto_enroll_campaign_id?: string | null;
  auto_enroll_enabled: boolean;
  schedule_frequency: DiscoveryScheduleFrequency;
  status: DiscoveryJobStatus;
  last_run_at?: string | null;
  next_run_at?: string | null;
  discovered_count: number;
  qualified_count: number;
  high_priority_count: number;
  enrolled_count: number;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  // joined relation
  auto_enroll_campaign?: Campaign | null;
}

export interface SendingConfig {
  days: number[]; // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun
  start_hour: number; // 0-23
  end_hour: number; // 0-23
  timezone: string;
  daily_limit: number;
  hourly_limit: number;
}

export interface FollowupStepConfig {
  step: number;
  delay_days: number;
  instructions: string;
}

export interface FollowupConfig {
  max_followups: number;
  steps: FollowupStepConfig[];
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  status: CampaignStatus;
  business_context: string;
  ideal_customer_profile: string;
  offer: string;
  tone: string;
  call_to_action: string;
  initial_email_instructions: string;
  account_group_id?: string | null;
  email_account_id?: string | null;
  resume_url?: string | null;
  sending_config: SendingConfig;
  followup_config: FollowupConfig;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  // Joined relations
  account_group?: AccountGroup | null;
  email_account?: EmailAccount | null;
}

export interface CampaignLead {
  id: string;
  campaign_id: string;
  lead_id: string;
  status: CampaignLeadStatus;
  current_step: number;
  next_action_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  lead?: Lead;
  campaign?: Campaign;
  messages?: EmailMessage[];
}

export interface EmailMessage {
  id: string;
  campaign_lead_id: string;
  step_number: number;
  subject: string;
  body_text: string;
  personalization_basis: string[];
  unsupported_claims: string[];
  status: EmailMessageStatus;
  email_account_id?: string | null;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  // Optional populated relations
  lead?: Lead;
  campaign_id?: string;
  email_account?: EmailAccount | null;
}

export interface JobQueueItem {
  id: string;
  job_type: JobType;
  payload: Record<string, unknown>;
  idempotency_key: string | null;
  run_at: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  locked_at: string | null;
  lock_expires_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Suppression {
  id: string;
  user_id: string;
  normalized_email: string;
  reason: SuppressionReason;
  source: string;
  created_at: string;
}

export interface ReplyEvent {
  id: string;
  user_id: string;
  email_message_id: string | null;
  gmail_message_id: string;
  gmail_thread_id: string;
  sender_email: string;
  received_at: string;
  classification: ReplyClassification;
  classification_summary: string;
  created_at: string;
  // Enriched lead and campaign details
  lead_name?: string;
  lead_company?: string;
  lead_email?: string;
  campaign_name?: string;
  campaign_id?: string;
  receiving_account?: string;
  email_subject?: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
