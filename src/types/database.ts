export type LeadStatus = 'active' | 'contacted' | 'replied' | 'unsubscribed' | 'bounced';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
export type CampaignLeadStatus = 'enrolled' | 'drafted' | 'in_progress' | 'replied' | 'unsubscribed' | 'completed' | 'failed';
export type EmailMessageStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'dead';
export type JobType = 
  | 'generate_email' 
  | 'send_email' 
  | 'sync_replies' 
  | 'schedule_followup' 
  | 'process_unsubscribe' 
  | 'reconcile_send' 
  | 'cleanup_expired_jobs';

export type ReplyClassification = 'positive' | 'neutral' | 'objection' | 'out_of_office' | 'unsubscribe' | 'other';
export type SuppressionReason = 'unsubscribe' | 'bounce' | 'manual' | 'complaint';

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

export interface EmailAccount {
  id: string;
  user_id: string;
  provider: 'gmail';
  email_address: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  token_expires_at: string | null;
  granted_scopes: string[];
  last_sync_at: string | null;
  connected_at: string;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
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
  sending_config: SendingConfig;
  followup_config: FollowupConfig;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
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
