import crypto from 'crypto';
import { env } from './env';
import { mockDb } from './supabase/mock-db';
import { createAdminClient } from './supabase/admin';
import {
  Profile,
  Lead,
  Campaign,
  CampaignLead,
  EmailMessage,
  JobQueueItem,
  Suppression,
  ReplyEvent,
  ActivityLog,
  EmailAccount,
  JobType,
} from '@/types/database';

export const isLiveSupabase = () => {
  return (
    !env.MOCK_MODE &&
    Boolean(env.NEXT_PUBLIC_SUPABASE_URL) &&
    !env.NEXT_PUBLIC_SUPABASE_URL.includes('mock.supabase.co') &&
    Boolean(env.SUPABASE_SERVICE_ROLE_KEY) &&
    !env.SUPABASE_SERVICE_ROLE_KEY.includes('mock-service-role-key')
  );
};

export const dbService = {
  // Profiles
  async getProfile(userId: string): Promise<Profile> {
    const ownerEmail = env.OWNER_EMAIL || process.env.OWNER_EMAIL || '';

    if (!isLiveSupabase()) {
      let profile = mockDb.profiles.get(userId);
      if (!profile) {
        profile = {
          id: userId,
          business_name: '',
          business_website: '',
          business_description: '',
          value_proposition: '',
          sender_name: '',
          sender_email: ownerEmail,
          timezone: env.DEFAULT_TIMEZONE,
          daily_send_limit: env.DEFAULT_DAILY_SEND_LIMIT,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mockDb.profiles.set(userId, profile);
      }
      return profile;
    }

    const supabase = createAdminClient();
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (!data) {
      const initialProfile: Profile = {
        id: userId,
        business_name: '',
        business_website: '',
        business_description: '',
        value_proposition: '',
        sender_name: '',
        sender_email: ownerEmail,
        timezone: env.DEFAULT_TIMEZONE,
        daily_send_limit: env.DEFAULT_DAILY_SEND_LIMIT,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await supabase.from('profiles').upsert(initialProfile);
      return initialProfile;
    }
    return data;
  },

  async updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile> {
    if (!isLiveSupabase()) {
      const existing = await this.getProfile(userId);
      const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
      mockDb.profiles.set(userId, updated);
      return updated;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  // Leads
  async getLeads(userId: string, filters?: { status?: string; search?: string; limit?: number; offset?: number }): Promise<{ leads: Lead[]; total: number }> {
    if (!isLiveSupabase()) {
      let all = Array.from(mockDb.leads.values()).filter((l) => l.user_id === userId);
      if (filters?.status) {
        all = all.filter((l) => l.status === filters.status);
      }
      if (filters?.search) {
        const query = filters.search.toLowerCase();
        all = all.filter(
          (l) =>
            l.email.toLowerCase().includes(query) ||
            l.first_name.toLowerCase().includes(query) ||
            l.last_name.toLowerCase().includes(query) ||
            l.company.toLowerCase().includes(query)
        );
      }
      const total = all.length;
      const offset = filters?.offset || 0;
      const limit = filters?.limit || 50;
      const paginated = all.slice(offset, offset + limit);
      return { leads: paginated, total };
    }

    const supabase = createAdminClient();
    let query = supabase.from('leads').select('*', { count: 'exact' }).eq('user_id', userId);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.search) {
      query = query.or(`email.ilike.%${filters.search}%,first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,company.ilike.%${filters.search}%`);
    }
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;
    const { data, count, error } = await query.range(offset, offset + limit - 1).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return { leads: data || [], total: count || 0 };
  },

  async insertLeads(userId: string, leads: Omit<Lead, 'id' | 'user_id' | 'created_at' | 'updated_at'>[]): Promise<{ inserted: number; errors: string[] }> {
    const errors: string[] = [];
    let insertedCount = 0;

    if (!isLiveSupabase()) {
      for (const lead of leads) {
        // Check uniqueness per user
        const existing = Array.from(mockDb.leads.values()).find(
          (l) => l.user_id === userId && l.normalized_email === lead.normalized_email
        );
        if (existing) {
          errors.push(`Duplicate lead email: ${lead.email}`);
          continue;
        }

        const id = crypto.randomUUID();
        const newLead: Lead = {
          ...lead,
          id,
          user_id: userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mockDb.leads.set(id, newLead);
        insertedCount++;
      }
      return { inserted: insertedCount, errors };
    }

    const supabase = createAdminClient();
    const rows = leads.map((l) => ({
      ...l,
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase.from('leads').insert(rows).select();
    if (error) {
      errors.push(error.message);
      return { inserted: 0, errors };
    }
    return { inserted: data?.length || 0, errors };
  },

  async updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
    if (!isLiveSupabase()) {
      const existing = mockDb.leads.get(id);
      if (!existing) throw new Error('Lead not found');
      const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
      mockDb.leads.set(id, updated);
      return updated;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  async getLead(id: string): Promise<Lead | null> {
    if (!id) return null;
    if (!isLiveSupabase()) {
      return mockDb.leads.get(id) || null;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from('leads').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
  },

  async getExistingNormalizedEmails(userId: string): Promise<Set<string>> {
    if (!isLiveSupabase()) {
      const set = new Set<string>();
      for (const lead of mockDb.leads.values()) {
        if (lead.user_id === userId) set.add(lead.normalized_email);
      }
      return set;
    }

    const supabase = createAdminClient();
    const { data } = await supabase.from('leads').select('normalized_email').eq('user_id', userId);
    return new Set((data || []).map((row) => row.normalized_email));
  },

  // Suppressions
  async getSuppressedNormalizedEmails(userId: string): Promise<Set<string>> {
    if (!isLiveSupabase()) {
      const set = new Set<string>();
      for (const s of mockDb.suppressions.values()) {
        if (s.user_id === userId) set.add(s.normalized_email);
      }
      return set;
    }

    const supabase = createAdminClient();
    const { data } = await supabase.from('suppressions').select('normalized_email').eq('user_id', userId);
    return new Set((data || []).map((row) => row.normalized_email));
  },

  async addSuppression(userId: string, normalizedEmail: string, reason: Suppression['reason'], source = 'user'): Promise<void> {
    if (!isLiveSupabase()) {
      const id = crypto.randomUUID();
      mockDb.suppressions.set(id, {
        id,
        user_id: userId,
        normalized_email: normalizedEmail,
        reason,
        source,
        created_at: new Date().toISOString(),
      });
      // Also update status of any leads with this email to 'unsubscribed'
      for (const lead of mockDb.leads.values()) {
        if (lead.user_id === userId && lead.normalized_email === normalizedEmail) {
          lead.status = 'unsubscribed';
        }
      }
      return;
    }

    const supabase = createAdminClient();
    await supabase.from('suppressions').upsert(
      {
        user_id: userId,
        normalized_email: normalizedEmail,
        reason,
        source,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,normalized_email' }
    );
    await supabase.from('leads').update({ status: 'unsubscribed' }).eq('user_id', userId).eq('normalized_email', normalizedEmail);
  },

  // Campaigns
  async getCampaigns(userId: string): Promise<Campaign[]> {
    if (!userId) return [];
    if (!isLiveSupabase()) {
      return Array.from(mockDb.campaigns.values()).filter((c) => c.user_id === userId);
    }
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('campaigns').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getCampaign(id: string): Promise<Campaign | null> {
    if (!id) return null;
    if (!isLiveSupabase()) {
      return mockDb.campaigns.get(id) || null;
    }
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('campaigns').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
  },

  async createCampaign(userId: string, campaign: Omit<Campaign, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<Campaign> {
    if (!isLiveSupabase()) {
      const id = crypto.randomUUID();
      const newCamp: Campaign = {
        ...campaign,
        id,
        user_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        activated_at: null,
      };
      mockDb.campaigns.set(id, newCamp);
      return newCamp;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from('campaigns').insert({ ...campaign, user_id: userId }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  async updateCampaign(id: string, updates: Partial<Campaign>): Promise<Campaign> {
    if (!isLiveSupabase()) {
      const camp = mockDb.campaigns.get(id);
      if (!camp) throw new Error('Campaign not found');
      const updated = { ...camp, ...updates, updated_at: new Date().toISOString() };
      mockDb.campaigns.set(id, updated);
      return updated;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from('campaigns').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  // Campaign Leads Enrollment
  async enrollLeadsInCampaign(campaignId: string, leadIds: string[]): Promise<{ enrolled: number }> {
    if (!isLiveSupabase()) {
      let count = 0;
      for (const leadId of leadIds) {
        const key = `${campaignId}:${leadId}`;
        const alreadyEnrolled = Array.from(mockDb.campaignLeads.values()).some(
          (cl) => cl.campaign_id === campaignId && cl.lead_id === leadId
        );
        if (!alreadyEnrolled) {
          const id = crypto.randomUUID();
          mockDb.campaignLeads.set(id, {
            id,
            campaign_id: campaignId,
            lead_id: leadId,
            status: 'enrolled',
            current_step: 0,
            next_action_at: new Date().toISOString(),
            enrolled_at: new Date().toISOString(),
            completed_at: null,
            last_error: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          count++;
        }
      }
      return { enrolled: count };
    }

    const supabase = createAdminClient();
    const rows = leadIds.map((leadId) => ({
      campaign_id: campaignId,
      lead_id: leadId,
      status: 'enrolled',
      current_step: 0,
      next_action_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase.from('campaign_leads').upsert(rows, { onConflict: 'campaign_id,lead_id' }).select();
    if (error) throw new Error(error.message);
    return { enrolled: data?.length || 0 };
  },

  async getCampaignLeads(campaignId: string): Promise<CampaignLead[]> {
    if (!campaignId) return [];
    if (!isLiveSupabase()) {
      const cls = Array.from(mockDb.campaignLeads.values()).filter((cl) => cl.campaign_id === campaignId);
      return cls.map((cl) => ({
        ...cl,
        lead: mockDb.leads.get(cl.lead_id),
      }));
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from('campaign_leads').select('*, lead:leads(*)').eq('campaign_id', campaignId);
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getCampaignLead(id: string): Promise<CampaignLead | null> {
    if (!id) return null;
    if (!isLiveSupabase()) {
      const cl = mockDb.campaignLeads.get(id);
      if (!cl) return null;
      return {
        ...cl,
        lead: mockDb.leads.get(cl.lead_id),
      };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from('campaign_leads').select('*, lead:leads(*)').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
  },

  // Email Messages
  async getMessages(filters?: { campaignId?: string; status?: string; limit?: number }): Promise<EmailMessage[]> {
    if (!isLiveSupabase()) {
      let msgs = Array.from(mockDb.emailMessages.values());
      if (filters?.campaignId) {
        msgs = msgs.filter((m) => {
          const cl = mockDb.campaignLeads.get(m.campaign_lead_id);
          return cl?.campaign_id === filters.campaignId;
        });
      }
      if (filters?.status) {
        msgs = msgs.filter((m) => m.status === filters.status);
      }
      return msgs.map((m) => {
        const cl = mockDb.campaignLeads.get(m.campaign_lead_id);
        const lead = cl ? mockDb.leads.get(cl.lead_id) : undefined;
        return { ...m, lead, campaign_id: cl?.campaign_id };
      });
    }

    const supabase = createAdminClient();
    let query = supabase.from('email_messages').select('*, campaign_lead:campaign_leads(*, lead:leads(*))');
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.campaignId) {
      const { data: cls, error: clErr } = await supabase
        .from('campaign_leads')
        .select('id')
        .eq('campaign_id', filters.campaignId);
      if (clErr) throw new Error(clErr.message);
      const clIds = (cls || []).map((c) => c.id);
      if (clIds.length === 0) return [];
      query = query.in('campaign_lead_id', clIds);
    }
    const limit = filters?.limit ?? (filters?.campaignId ? 500 : 50);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data || []).map((m: any) => ({
      ...m,
      lead: m.campaign_lead?.lead || undefined,
      campaign_id: m.campaign_lead?.campaign_id || undefined,
    }));
  },

  async getMessage(id: string): Promise<EmailMessage | null> {
    if (!id) return null;
    if (!isLiveSupabase()) {
      const msg = mockDb.emailMessages.get(id);
      if (!msg) return null;
      const cl = mockDb.campaignLeads.get(msg.campaign_lead_id);
      const lead = cl ? mockDb.leads.get(cl.lead_id) : undefined;
      return { ...msg, lead, campaign_id: cl?.campaign_id };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from('email_messages').select('*, campaign_lead:campaign_leads(*, lead:leads(*))').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return {
      ...data,
      lead: data.campaign_lead?.lead || undefined,
      campaign_id: data.campaign_lead?.campaign_id || undefined,
    };
  },

  async getMessageByLeadAndStep(campaignLeadId: string, stepNumber: number): Promise<EmailMessage | null> {
    if (!campaignLeadId) return null;
    if (!isLiveSupabase()) {
      const msg = Array.from(mockDb.emailMessages.values()).find(
        (m) => m.campaign_lead_id === campaignLeadId && m.step_number === stepNumber
      );
      if (!msg) return null;
      const cl = mockDb.campaignLeads.get(msg.campaign_lead_id);
      const lead = cl ? mockDb.leads.get(cl.lead_id) : undefined;
      return { ...msg, lead };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('email_messages')
      .select('*, campaign_lead:campaign_leads(*, lead:leads(*))')
      .eq('campaign_lead_id', campaignLeadId)
      .eq('step_number', stepNumber)
      .maybeSingle();

    if (error || !data) return null;
    return {
      ...data,
      lead: data.campaign_lead?.lead || undefined,
    };
  },

  async createOrUpdateMessage(message: Partial<EmailMessage> & { campaign_lead_id: string; step_number: number }): Promise<EmailMessage> {
    if (!isLiveSupabase()) {
      // Find existing message for step
      let existing = Array.from(mockDb.emailMessages.values()).find(
        (m) => m.campaign_lead_id === message.campaign_lead_id && m.step_number === message.step_number
      );

      if (existing) {
        const updated: EmailMessage = {
          ...existing,
          ...message,
          updated_at: new Date().toISOString(),
        };
        mockDb.emailMessages.set(existing.id, updated);
        return updated;
      }

      const id = message.id || crypto.randomUUID();
      const newMsg: EmailMessage = {
        id,
        campaign_lead_id: message.campaign_lead_id,
        step_number: message.step_number,
        subject: message.subject || '',
        body_text: message.body_text || '',
        personalization_basis: message.personalization_basis || [],
        unsupported_claims: message.unsupported_claims || [],
        status: message.status || 'draft',
        gmail_message_id: message.gmail_message_id || null,
        gmail_thread_id: message.gmail_thread_id || null,
        scheduled_at: message.scheduled_at || null,
        sent_at: message.sent_at || null,
        error_code: null,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.emailMessages.set(id, newMsg);
      return newMsg;
    }

    const { lead, campaign_id, campaign_lead, ...fieldsToSave } = message as any;

    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from('email_messages')
      .select('id')
      .eq('campaign_lead_id', fieldsToSave.campaign_lead_id)
      .eq('step_number', fieldsToSave.step_number)
      .maybeSingle();

    const payload = {
      ...fieldsToSave,
      ...(existing?.id ? { id: existing.id } : {}),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('email_messages')
      .upsert(payload, { onConflict: 'campaign_lead_id,step_number' })
      .select('*, campaign_lead:campaign_leads(*, lead:leads(*))')
      .single();
    if (error) throw new Error(error.message);
    return {
      ...data,
      lead: data.campaign_lead?.lead || undefined,
      campaign_id: data.campaign_lead?.campaign_id || undefined,
    };
  },

  // Email Accounts
  async getConnectedEmailAccount(userId: string): Promise<EmailAccount | null> {
    if (!userId) return null;
    if (!isLiveSupabase()) {
      return mockDb.emailAccounts.get(`${userId}:gmail`) || null;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'gmail')
      .maybeSingle();
    if (error) return null;
    return data || null;
  },

  async upsertEmailAccount(account: Omit<EmailAccount, 'id' | 'created_at' | 'updated_at'>): Promise<EmailAccount> {
    if (!isLiveSupabase()) {
      const key = `${account.user_id}:${account.provider}`;
      const existing = mockDb.emailAccounts.get(key);
      const acc: EmailAccount = {
        id: existing?.id || crypto.randomUUID(),
        ...account,
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.emailAccounts.set(key, acc);
      return acc;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from('email_accounts').upsert(account, { onConflict: 'user_id,provider' }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  async deleteEmailAccount(userId: string, provider = 'gmail'): Promise<void> {
    if (!isLiveSupabase()) {
      mockDb.emailAccounts.delete(`${userId}:${provider}`);
      return;
    }

    const supabase = createAdminClient();
    await supabase.from('email_accounts').delete().eq('user_id', userId).eq('provider', provider);
  },

  // Replies
  async getReplies(userId: string): Promise<ReplyEvent[]> {
    if (!isLiveSupabase()) {
      return Array.from(mockDb.replyEvents.values()).filter((r) => r.user_id === userId);
    }
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('reply_events').select('*').eq('user_id', userId).order('received_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async recordReply(event: Omit<ReplyEvent, 'id' | 'created_at'>): Promise<ReplyEvent> {
    if (!isLiveSupabase()) {
      const id = crypto.randomUUID();
      const newReply: ReplyEvent = {
        ...event,
        id,
        created_at: new Date().toISOString(),
      };
      mockDb.replyEvents.set(id, newReply);
      return newReply;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from('reply_events').upsert(event, { onConflict: 'gmail_message_id' }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  // Job Queue
  async enqueueJob(jobType: JobType, payload: Record<string, unknown>, idempotencyKey?: string, runAt?: Date): Promise<JobQueueItem> {
    if (!isLiveSupabase()) {
      if (idempotencyKey) {
        const existing = Array.from(mockDb.jobQueue.values()).find((j) => j.idempotency_key === idempotencyKey);
        if (existing) return existing;
      }

      const id = crypto.randomUUID();
      const item: JobQueueItem = {
        id,
        job_type: jobType,
        payload,
        idempotency_key: idempotencyKey || null,
        run_at: (runAt || new Date()).toISOString(),
        status: 'queued',
        attempts: 0,
        max_attempts: 3,
        locked_at: null,
        lock_expires_at: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.jobQueue.set(id, item);
      return item;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('job_queue')
      .upsert(
        {
          job_type: jobType,
          payload,
          idempotency_key: idempotencyKey || null,
          run_at: (runAt || new Date()).toISOString(),
          status: 'queued',
        },
        { onConflict: 'idempotency_key' }
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async claimJobs(workerId: string, batchSize: number = 5, lockDurationSeconds: number = 300): Promise<JobQueueItem[]> {
    if (!isLiveSupabase()) {
      return mockDb.claimJobs(workerId, batchSize, lockDurationSeconds);
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('claim_jobs', {
      p_worker_id: workerId,
      p_batch_size: batchSize,
      p_lock_duration: `${lockDurationSeconds} seconds`,
    });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async completeJob(jobId: string): Promise<void> {
    if (!isLiveSupabase()) {
      const job = mockDb.jobQueue.get(jobId);
      if (job) {
        job.status = 'completed';
        job.updated_at = new Date().toISOString();
      }
      return;
    }

    const supabase = createAdminClient();
    await supabase.from('job_queue').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', jobId);
  },

  async failJob(jobId: string, errorMsg: string): Promise<void> {
    if (!isLiveSupabase()) {
      const job = mockDb.jobQueue.get(jobId);
      if (job) {
        job.status = job.attempts >= job.max_attempts ? 'dead' : 'failed';
        job.last_error = errorMsg;
        job.updated_at = new Date().toISOString();
      }
      return;
    }

    const supabase = createAdminClient();
    const { data } = await supabase.from('job_queue').select('attempts, max_attempts').eq('id', jobId).single();
    const isDead = data ? data.attempts >= data.max_attempts : false;
    await supabase.from('job_queue').update({
      status: isDead ? 'dead' : 'failed',
      last_error: errorMsg,
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);
  },

  // Analytics & Stats
  async getDashboardStats(userId: string) {
    const leads = await this.getLeads(userId, { limit: 10000 });
    const campaigns = await this.getCampaigns(userId);
    const messages = await this.getMessages({ limit: 10000 });
    const replies = await this.getReplies(userId);
    const suppressions = await this.getSuppressedNormalizedEmails(userId);

    const totalLeads = leads.total;
    const eligibleLeads = leads.leads.filter((l) => l.status === 'active').length;
    const draftsGenerated = messages.filter((m) => m.status === 'draft').length;
    const emailsSent = messages.filter((m) => m.status === 'sent').length;
    const repliesReceived = replies.length;
    const positiveReplies = replies.filter((r) => r.classification === 'positive').length;
    const bounceCount = leads.leads.filter((l) => l.status === 'bounced').length;
    
    // Failed jobs count
    let failedJobs = 0;
    if (!isLiveSupabase()) {
      failedJobs = Array.from(mockDb.jobQueue.values()).filter((j) => j.status === 'failed' || j.status === 'dead').length;
    } else {
      const supabase = createAdminClient();
      const { count } = await supabase
        .from('job_queue')
        .select('*', { count: 'exact', head: true })
        .in('status', ['failed', 'dead']);
      failedJobs = count || 0;
    }

    return {
      totalLeads,
      eligibleLeads,
      draftsGenerated,
      emailsSent,
      repliesReceived,
      positiveReplies,
      bounceCount,
      failedJobs,
      campaignsCount: campaigns.length,
      activeCampaignsCount: campaigns.filter((c) => c.status === 'active').length,
      suppressionCount: suppressions.size,
    };
  },

  // Activity Logs
  async logActivity(userId: string, eventType: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
    const log: ActivityLog = {
      id: crypto.randomUUID(),
      user_id: userId,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
      created_at: new Date().toISOString(),
    };
    if (!isLiveSupabase()) {
      mockDb.activityLogs.unshift(log);
      return log;
    }
    const supabase = createAdminClient();
    await supabase.from('activity_logs').insert(log);
    return log;
  },
};
