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
  AccountGroup,
  AccountDailyStats,
  JobType,
  SendingConfig,
  DiscoveryJob,
} from '@/types/database';
import { getNextSendingWindowDate, createDateInTimezone, getTimezoneParts } from './scheduler';

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

  async getPaginatedMessages(filters?: {
    campaignId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ messages: EmailMessage[]; total: number }> {
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
      const total = msgs.length;
      msgs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const offset = filters?.offset || 0;
      const limit = filters?.limit ?? 50;
      const paged = msgs.slice(offset, offset + limit).map((m) => {
        const cl = mockDb.campaignLeads.get(m.campaign_lead_id);
        const lead = cl ? mockDb.leads.get(cl.lead_id) : undefined;
        return { ...m, lead, campaign_id: cl?.campaign_id };
      });
      return { messages: paged, total };
    }

    const supabase = createAdminClient();
    let query = supabase.from('email_messages').select('*, campaign_lead:campaign_leads(*, lead:leads(*))', { count: 'exact' });
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.campaignId) {
      const { data: cls, error: clErr } = await supabase
        .from('campaign_leads')
        .select('id')
        .eq('campaign_id', filters.campaignId);
      if (clErr) throw new Error(clErr.message);
      const clIds = (cls || []).map((c) => c.id);
      if (clIds.length === 0) return { messages: [], total: 0 };
      query = query.in('campaign_lead_id', clIds);
    }
    const offset = filters?.offset || 0;
    const limit = filters?.limit ?? 50;
    const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    const messages = (data || []).map((m: any) => ({
      ...m,
      lead: m.campaign_lead?.lead || undefined,
      campaign_id: m.campaign_lead?.campaign_id || undefined,
    }));
    return { messages, total: count ?? messages.length };
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
        email_account_id: message.email_account_id || null,
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

    if (existing?.id || fieldsToSave.id) {
      const targetId = fieldsToSave.id || existing?.id;
      const { data, error } = await supabase
        .from('email_messages')
        .update({
          ...fieldsToSave,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetId)
        .select('*, campaign_lead:campaign_leads(*, lead:leads(*))')
        .single();
      if (error) throw new Error(error.message);
      return {
        ...data,
        lead: data.campaign_lead?.lead || undefined,
        campaign_id: data.campaign_lead?.campaign_id || undefined,
      };
    }

    const payload = {
      subject: 'Follow up',
      body_text: '',
      ...fieldsToSave,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('email_messages')
      .insert(payload)
      .select('*, campaign_lead:campaign_leads(*, lead:leads(*))')
      .single();
    if (error) throw new Error(error.message);
    return {
      ...data,
      lead: data.campaign_lead?.lead || undefined,
      campaign_id: data.campaign_lead?.campaign_id || undefined,
    };
  },

  // Account Groups
  async getAccountGroups(userId: string): Promise<AccountGroup[]> {
    if (!userId) return [];
    let groups: AccountGroup[] = [];
    if (!isLiveSupabase()) {
      groups = Array.from(mockDb.accountGroups.values()).filter((g) => g.user_id === userId);
    } else {
      const supabase = createAdminClient();
      try {
        const { data, error } = await supabase
          .from('account_groups')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true });
        if (!error && data) {
          groups = data;
        }
      } catch {
        groups = [];
      }
    }

    // Populate accounts count and daily capacity for each group
    try {
      const accounts = await this.getEmailAccounts(userId);
      return groups.map((g) => {
        const groupAccounts = accounts.filter((a) => a.group_id === g.id);
        const dailyCapacity = groupAccounts.reduce((sum, a) => sum + (a.status === 'active' ? (a.daily_limit || 18) : 0), 0);
        return {
          ...g,
          accounts_count: groupAccounts.length,
          daily_capacity: dailyCapacity,
        };
      });
    } catch {
      return groups;
    }
  },

  async getAccountGroup(id: string): Promise<AccountGroup | null> {
    if (!id) return null;
    if (!isLiveSupabase()) {
      return mockDb.accountGroups.get(id) || null;
    }
    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase.from('account_groups').select('*').eq('id', id).maybeSingle();
      if (error || !data) return null;
      return data;
    } catch {
      return null;
    }
  },

  async createAccountGroup(
    userId: string,
    group: {
      name: string;
      description?: string;
      is_warmup_enabled?: boolean;
      warmup_daily_limit?: number;
      warmup_ramp_per_day?: number;
      warmup_reply_rate?: number;
    }
  ): Promise<AccountGroup> {
    const id = crypto.randomUUID();
    const newGroup: AccountGroup = {
      id,
      user_id: userId,
      name: group.name,
      description: group.description || '',
      is_warmup_enabled: group.is_warmup_enabled ?? false,
      warmup_daily_limit: group.warmup_daily_limit ?? 15,
      warmup_ramp_per_day: group.warmup_ramp_per_day ?? 2,
      warmup_reply_rate: group.warmup_reply_rate ?? 70,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      accounts_count: 0,
      daily_capacity: 0,
    };

    const dbPayload = {
      id,
      user_id: userId,
      name: group.name,
      description: group.description || '',
      is_warmup_enabled: group.is_warmup_enabled ?? false,
      warmup_daily_limit: group.warmup_daily_limit ?? 15,
      warmup_ramp_per_day: group.warmup_ramp_per_day ?? 2,
      warmup_reply_rate: group.warmup_reply_rate ?? 70,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };


    if (!isLiveSupabase()) {
      mockDb.accountGroups.set(id, newGroup);
      return newGroup;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from('account_groups').insert(dbPayload).select().single();
    if (error) throw new Error(error.message);
    return {
      ...data,
      accounts_count: 0,
      daily_capacity: 0,
    };
  },

  async updateAccountGroup(id: string, updates: Partial<AccountGroup>): Promise<AccountGroup> {
    const { accounts_count, daily_capacity, ...cleanUpdates } = updates;

    if (!isLiveSupabase()) {
      const existing = mockDb.accountGroups.get(id);
      if (!existing) throw new Error('Account group not found');
      const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
      mockDb.accountGroups.set(id, updated);
      return updated;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('account_groups')
      .update({ ...cleanUpdates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return {
      ...data,
      accounts_count: accounts_count ?? 0,
      daily_capacity: daily_capacity ?? 0,
    };
  },


  async deleteAccountGroup(id: string): Promise<void> {
    if (!isLiveSupabase()) {
      mockDb.accountGroups.delete(id);
      for (const acc of mockDb.emailAccounts.values()) {
        if (acc.group_id === id) {
          acc.group_id = null;
        }
      }
      return;
    }

    const supabase = createAdminClient();
    try {
      await supabase.from('email_accounts').update({ group_id: null }).eq('group_id', id);
    } catch {
      // Ignore if group_id column doesn't exist
    }
    try {
      await supabase.from('account_groups').delete().eq('id', id);
    } catch {
      // Ignore if account_groups doesn't exist
    }
  },

  // Email Accounts
  async getEmailAccounts(userId: string, filters?: { groupId?: string; status?: string }): Promise<EmailAccount[]> {
    if (!userId) return [];
    let accounts: EmailAccount[] = [];

    if (!isLiveSupabase()) {
      accounts = Array.from(mockDb.emailAccounts.values()).filter((a) => a.user_id === userId);
      // Deduplicate in mock mode if both id and composite keys were stored
      const seen = new Set<string>();
      accounts = accounts.filter((a) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      });
    } else {
      const supabase = createAdminClient();
      try {
        // Query plain email_accounts without PostgREST joins to prevent schema cache relationship errors
        const { data, error } = await supabase
          .from('email_accounts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true });

        if (error) {
          // Fallback if order fails
          const fallback = await supabase.from('email_accounts').select('*').eq('user_id', userId);
          if (fallback.error) {
            console.error('Failed to fetch email accounts from Supabase:', fallback.error);
            accounts = [];
          } else {
            accounts = fallback.data || [];
          }
        } else {
          accounts = data || [];
        }
      } catch (err) {
        console.error('Exception fetching email accounts from Supabase:', err);
        accounts = [];
      }
    }

    // Default missing properties for backwards compatibility
    accounts = accounts.map((acc) => ({
      ...acc,
      daily_limit: acc.daily_limit ?? 18,
      min_interval_minutes: acc.min_interval_minutes ?? 15,
      status: acc.status || 'active',
    }));

    if (filters?.groupId) {
      accounts = accounts.filter((a) => a.group_id === filters.groupId);
    }
    if (filters?.status) {
      accounts = accounts.filter((a) => a.status === filters.status);
    }

    // Attach group in memory
    const groupIds = Array.from(new Set(accounts.map((acc) => acc.group_id).filter(Boolean))) as string[];
    if (groupIds.length > 0) {
      try {
        if (!isLiveSupabase()) {
          accounts = accounts.map((acc) => {
            const group = acc.group_id ? mockDb.accountGroups.get(acc.group_id) || null : null;
            return { ...acc, group };
          });
        } else {
          const supabase = createAdminClient();
          const { data: groupsData, error: groupsError } = await supabase
            .from('account_groups')
            .select('*')
            .in('id', groupIds);
          if (!groupsError && groupsData) {
            const groupMap = new Map(groupsData.map((g) => [g.id, g]));
            accounts = accounts.map((acc) => ({
              ...acc,
              group: acc.group_id ? groupMap.get(acc.group_id) || null : null,
            }));
          }
        }
      } catch {
        // Table account_groups might not exist yet; safe fallback
      }
    }

    // Calculate sent_today and remaining_today
    let todaySentMessages: Array<{ email_account_id?: string | null }> = [];
    try {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const allMessages = await this.getMessages({ limit: 10000 });
      todaySentMessages = allMessages.filter(
        (m) => m.status === 'sent' && m.sent_at && new Date(m.sent_at) >= today
      );
    } catch {
      todaySentMessages = [];
    }

    return accounts.map((acc) => {
      const sentCount = todaySentMessages.filter(
        (m) => m.email_account_id === acc.id || (!m.email_account_id && accounts.length === 1)
      ).length;
      const limit = acc.daily_limit || 18;
      return {
        ...acc,
        sent_today: sentCount,
        remaining_today: Math.max(0, limit - sentCount),
      };
    });
  },

  async getEmailAccount(id: string): Promise<EmailAccount | null> {
    if (!id) return null;
    let acc: EmailAccount | null = null;
    if (!isLiveSupabase()) {
      acc = mockDb.emailAccounts.get(id) || null;
      if (!acc) {
        acc = Array.from(mockDb.emailAccounts.values()).find((a) => a.id === id || a.email_address === id) || null;
      }
    } else {
      const supabase = createAdminClient();
      try {
        const { data } = await supabase.from('email_accounts').select('*').eq('id', id).maybeSingle();
        acc = data || null;
      } catch {
        acc = null;
      }
    }
    if (!acc) return null;

    acc = {
      ...acc,
      daily_limit: acc.daily_limit ?? 18,
      min_interval_minutes: acc.min_interval_minutes ?? 15,
      status: acc.status || 'active',
    };

    if (acc.group_id) {
      try {
        acc.group = await this.getAccountGroup(acc.group_id);
      } catch {
        acc.group = null;
      }
    }

    let sentCount = 0;
    try {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const allMessages = await this.getMessages({ limit: 10000 });
      sentCount = allMessages.filter(
        (m) => m.email_account_id === acc!.id && m.status === 'sent' && m.sent_at && new Date(m.sent_at) >= today
      ).length;
    } catch {
      sentCount = 0;
    }

    const limit = acc.daily_limit || 18;
    return {
      ...acc,
      sent_today: sentCount,
      remaining_today: Math.max(0, limit - sentCount),
    };
  },

  async getConnectedEmailAccount(userId: string): Promise<EmailAccount | null> {
    if (!userId) return null;
    const accounts = await this.getEmailAccounts(userId, { status: 'active' });
    if (accounts.length > 0) return accounts[0];

    const all = await this.getEmailAccounts(userId);
    return all.length > 0 ? all[0] : null;
  },

  async upsertEmailAccount(account: Partial<EmailAccount> & { user_id: string; email_address: string; provider?: string }): Promise<EmailAccount> {
    const defaultFields = {
      provider: account.provider || 'gmail',
      sender_name: account.sender_name || '',
      group_id: account.group_id || null,
      daily_limit: account.daily_limit ?? 18,
      min_interval_minutes: account.min_interval_minutes ?? 15,
      status: (account.status || 'active') as 'active' | 'paused' | 'error',
      last_sent_at: account.last_sent_at || null,
      encrypted_access_token: account.encrypted_access_token || '',
      encrypted_refresh_token: account.encrypted_refresh_token || '',
      token_expires_at: account.token_expires_at || null,
      granted_scopes: account.granted_scopes || [],
      last_sync_at: account.last_sync_at || null,
      connected_at: account.connected_at || new Date().toISOString(),
      smtp_host: account.smtp_host || null,
      smtp_port: account.smtp_port || null,
      smtp_secure: account.smtp_secure ?? (account.smtp_port === 465 || !account.smtp_port ? true : false),
      smtp_username: account.smtp_username || null,
      encrypted_smtp_password: account.encrypted_smtp_password || null,
      imap_host: account.imap_host || null,
      imap_port: account.imap_port || null,
    };

    if (!isLiveSupabase()) {
      let existing = account.id ? mockDb.emailAccounts.get(account.id) : undefined;
      if (!existing) {
        existing = Array.from(mockDb.emailAccounts.values()).find(
          (a) => a.user_id === account.user_id && a.email_address.toLowerCase() === account.email_address.toLowerCase()
        );
      }

      const id = existing?.id || account.id || crypto.randomUUID();
      const acc: EmailAccount = {
        ...defaultFields,
        ...account,
        id,
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockDb.emailAccounts.set(id, acc);
      return acc;
    }

    const supabase = createAdminClient();
    const { group: _g, sent_today: _st, remaining_today: _rt, ...cleanAccount } = account;
    const payload = {
      ...defaultFields,
      ...cleanAccount,
      updated_at: new Date().toISOString(),
    };


    // 1. Multi-account schema upsert (user_id, email_address)
    try {
      const { data, error } = await supabase
        .from('email_accounts')
        .upsert(payload, { onConflict: 'user_id,email_address' })
        .select('*')
        .single();
      if (!error && data) {
        if (data.group_id) {
          try {
            data.group = await this.getAccountGroup(data.group_id);
          } catch {
            data.group = null;
          }
        }
        return data;
      }
    } catch {
      // Fallback
    }

    // 2. Direct upsert
    try {
      const { data, error } = await supabase
        .from('email_accounts')
        .upsert(payload)
        .select('*')
        .single();
      if (!error && data) {
        if (data.group_id) {
          try {
            data.group = await this.getAccountGroup(data.group_id);
          } catch {
            data.group = null;
          }
        }
        return data;
      }
    } catch {
      // Fallback to legacy schema
    }

    // 3. Fallback for unmigrated schema (where only original columns exist: user_id, provider unique)
    const legacyPayload = {
      user_id: account.user_id,
      provider: account.provider || 'gmail',
      email_address: account.email_address,
      encrypted_access_token: account.encrypted_access_token || '',
      encrypted_refresh_token: account.encrypted_refresh_token || '',
      token_expires_at: account.token_expires_at || null,
      granted_scopes: account.granted_scopes || [],
      last_sync_at: account.last_sync_at || null,
      connected_at: account.connected_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const legacyRes = await supabase
      .from('email_accounts')
      .upsert(legacyPayload, { onConflict: 'user_id,provider' })
      .select('*')
      .single();

    if (legacyRes.error) {
      throw new Error(legacyRes.error.message);
    }

    return {
      daily_limit: 18,
      min_interval_minutes: 15,
      status: 'active',
      ...legacyRes.data,
    };
  },

  async updateEmailAccount(id: string, updates: Partial<EmailAccount>): Promise<EmailAccount> {
    if (!isLiveSupabase()) {
      const existing = await this.getEmailAccount(id);
      if (!existing) throw new Error('Email account not found');
      const updated = {
        ...existing,
        ...updates,
        updated_at: new Date().toISOString(),
      };
      mockDb.emailAccounts.set(existing.id, updated);
      mockDb.emailAccounts.set(`${existing.user_id}:${existing.email_address.toLowerCase()}`, updated);
      return updated;
    }

    const supabase = createAdminClient();
    const { group: _g, sent_today: _st, remaining_today: _rt, ...cleanUpdates } = updates;
    const { data, error } = await supabase
      .from('email_accounts')
      .update({ ...cleanUpdates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    if (data && data.group_id) {
      try {
        data.group = await this.getAccountGroup(data.group_id);
      } catch {
        data.group = null;
      }
    }
    return data;
  },

  async deleteEmailAccount(userId: string, identifier: string): Promise<void> {
    if (!isLiveSupabase()) {
      for (const [key, acc] of Array.from(mockDb.emailAccounts.entries())) {
        if (
          acc.user_id === userId &&
          (acc.id === identifier || acc.email_address === identifier || acc.provider === identifier || key.includes(identifier))
        ) {
          mockDb.emailAccounts.delete(key);
        }
      }
      return;
    }

    const supabase = createAdminClient();
    if (identifier.includes('-') && identifier.length === 36) {
      await supabase.from('email_accounts').delete().eq('user_id', userId).eq('id', identifier);
    } else if (identifier.includes('@')) {
      await supabase.from('email_accounts').delete().eq('user_id', userId).eq('email_address', identifier);
    } else {
      await supabase.from('email_accounts').delete().eq('user_id', userId).eq('provider', identifier);
    }
  },

  async recordAccountSend(accountId: string): Promise<void> {
    const now = new Date().toISOString();
    if (!isLiveSupabase()) {
      const acc = mockDb.emailAccounts.get(accountId);
      if (acc) {
        acc.last_sent_at = now;
        acc.updated_at = now;
        mockDb.emailAccounts.set(accountId, acc);
      }
      return;
    }

    const supabase = createAdminClient();
    try {
      await supabase.from('email_accounts').update({ last_sent_at: now, updated_at: now }).eq('id', accountId);
    } catch {
      // Ignore if last_sent_at column doesn't exist yet
    }
  },

  async getCampaignSendStats(
    campaignId: string,
    sendingConfig: SendingConfig
  ): Promise<{
    sentToday: number;
    sentPastHour: number;
    earliestHourSendMs: number;
    todayEndMs: number;
  }> {
    const messages = await this.getMessages({ campaignId, status: 'sent', limit: 1000 });
    const now = Date.now();
    const timeZone = sendingConfig.timezone || env.DEFAULT_TIMEZONE || 'UTC';

    const tzParts = getTimezoneParts(new Date(), timeZone);
    const startOfTodayUtc = createDateInTimezone(tzParts.year, tzParts.month, tzParts.day, 0, 0, 0, timeZone);
    const endOfTodayUtc = createDateInTimezone(tzParts.year, tzParts.month, tzParts.day, 23, 59, 59, timeZone);

    const sentTodayMessages = messages.filter((m) => {
      if (!m.sent_at) return false;
      const sentTime = new Date(m.sent_at).getTime();
      return sentTime >= startOfTodayUtc.getTime() && sentTime <= endOfTodayUtc.getTime();
    });

    const pastHourMessages = messages.filter((m) => {
      if (!m.sent_at) return false;
      const sentTime = new Date(m.sent_at).getTime();
      return now - sentTime < 60 * 60 * 1000;
    });

    const earliestHourSendMs = pastHourMessages.length > 0
      ? Math.min(...pastHourMessages.map((m) => new Date(m.sent_at!).getTime()))
      : now;

    return {
      sentToday: sentTodayMessages.length,
      sentPastHour: pastHourMessages.length,
      earliestHourSendMs,
      todayEndMs: endOfTodayUtc.getTime(),
    };
  },

  async getAccountDailyStats(userId: string): Promise<AccountDailyStats> {
    const accounts = await this.getEmailAccounts(userId);
    const activeAccounts = accounts.filter((a) => a.status === 'active');
    const dailyCapacity = activeAccounts.reduce((sum, a) => sum + (a.daily_limit || 18), 0);
    const sentToday = activeAccounts.reduce((sum, a) => sum + (a.sent_today || 0), 0);
    const remainingToday = Math.max(0, dailyCapacity - sentToday);

    return {
      totalAccounts: accounts.length,
      activeAccounts: activeAccounts.length,
      dailyCapacity,
      sentToday,
      remainingToday,
      accounts: accounts as any,
    };
  },

  async getAvailableEmailAccountForCampaign(campaign: Campaign): Promise<
    | { status: 'available'; account: EmailAccount }
    | { status: 'no_accounts'; error: string }
    | { status: 'daily_limit_reached'; rescheduleAt: Date }
    | { status: 'cooldown'; rescheduleAt: Date; accountEmail: string }
  > {
    const accounts = await this.getEmailAccounts(campaign.user_id, { status: 'active' });
    if (accounts.length === 0) {
      return {
        status: 'no_accounts',
        error: 'No active email accounts connected for user.',
      };
    }

    // Filter by campaign's assigned group if specified
    let candidateAccounts = accounts;
    if (campaign.account_group_id) {
      const inGroup = accounts.filter((a) => a.group_id === campaign.account_group_id);
      if (inGroup.length > 0) {
        candidateAccounts = inGroup;
      } else {
        candidateAccounts = accounts;
      }
    }

    const now = Date.now();
    const candidateStats = candidateAccounts.map((acc) => {
      const limit = acc.daily_limit || 18;
      const sentToday = acc.sent_today || 0;
      const hasDailyCapacity = sentToday < limit;
      const intervalMs = (acc.min_interval_minutes || 15) * 60 * 1000;
      const lastSentTime = acc.last_sent_at ? new Date(acc.last_sent_at).getTime() : 0;
      const timeSinceLastSend = now - lastSentTime;
      const isInCooldown = lastSentTime > 0 && timeSinceLastSend < intervalMs;
      const remainingCooldownMs = isInCooldown ? intervalMs - timeSinceLastSend : 0;

      return {
        account: acc,
        sentToday,
        limit,
        hasDailyCapacity,
        isInCooldown,
        remainingCooldownMs,
        lastSentTime,
      };
    });

    // 1. Check if all candidates have reached their daily limit
    const withCapacity = candidateStats.filter((c) => c.hasDailyCapacity);
    if (withCapacity.length === 0) {
      // Re-schedule for next morning at sending start hour in campaign timezone
      const tomorrowInTz = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const nextWindow = getNextSendingWindowDate(campaign.sending_config, tomorrowInTz);
      return {
        status: 'daily_limit_reached',
        rescheduleAt: nextWindow,
      };
    }

    // 2. Check cooldown among candidates that have capacity
    const readyAccounts = withCapacity.filter((c) => !c.isInCooldown);
    if (readyAccounts.length === 0) {
      // Find the account that exits cooldown earliest
      const shortestCooldown = withCapacity.reduce((min, c) =>
        c.remainingCooldownMs < min.remainingCooldownMs ? c : min
      );
      const readyAt = new Date(now + shortestCooldown.remainingCooldownMs + 2000);
      return {
        status: 'cooldown',
        rescheduleAt: readyAt,
        accountEmail: shortestCooldown.account.email_address,
      };
    }

    // 3. Round-robin & load balance: sort by lowest sentToday, then oldest lastSentTime
    readyAccounts.sort((a, b) => {
      if (a.sentToday !== b.sentToday) {
        return a.sentToday - b.sentToday;
      }
      return a.lastSentTime - b.lastSentTime;
    });

    return {
      status: 'available',
      account: readyAccounts[0].account,
    };
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

  async getPaginatedReplies(
    userId: string,
    options?: { limit?: number; offset?: number; classification?: string }
  ): Promise<{ replies: ReplyEvent[]; total: number }> {
    if (!isLiveSupabase()) {
      let all = Array.from(mockDb.replyEvents.values()).filter((r) => r.user_id === userId);
      if (options?.classification) {
        all = all.filter((r) => r.classification === options.classification);
      }
      const total = all.length;
      all.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
      const offset = options?.offset || 0;
      const limit = options?.limit ?? 50;
      return { replies: all.slice(offset, offset + limit), total };
    }

    const supabase = createAdminClient();
    let query = supabase.from('reply_events').select('*', { count: 'exact' }).eq('user_id', userId);
    if (options?.classification) {
      query = query.eq('classification', options.classification);
    }
    const offset = options?.offset || 0;
    const limit = options?.limit ?? 50;
    const { data, count, error } = await query.order('received_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return { replies: data || [], total: count ?? 0 };
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

  async claimJobs(
    workerId: string,
    batchSize: number = 5,
    lockDurationSeconds: number = 300,
    force: boolean = false
  ): Promise<JobQueueItem[]> {
    if (!isLiveSupabase()) {
      return mockDb.claimJobs(workerId, batchSize, lockDurationSeconds, force);
    }

    const supabase = createAdminClient();

    // If force is enabled, claim the next queued jobs even if run_at is in the future
    if (force) {
      const { data: queuedJobs, error: selectError } = await supabase
        .from('job_queue')
        .select('*')
        .eq('status', 'queued')
        .order('run_at', { ascending: true })
        .limit(batchSize);

      if (selectError || !queuedJobs || queuedJobs.length === 0) return [];

      const jobIds = queuedJobs.map((j) => j.id);
      const now = new Date().toISOString();
      const lockExpiresAt = new Date(Date.now() + lockDurationSeconds * 1000).toISOString();

      const { data: claimed, error: updateError } = await supabase
        .from('job_queue')
        .update({
          status: 'running',
          locked_at: now,
          lock_expires_at: lockExpiresAt,
          updated_at: now,
        })
        .in('id', jobIds)
        .select();

      if (updateError) throw new Error(updateError.message);
      return claimed || [];
    }

    const { data, error } = await supabase.rpc('claim_jobs', {
      p_worker_id: workerId,
      p_batch_size: batchSize,
      p_lock_duration: `${lockDurationSeconds} seconds`,
    });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getQueuedJobsDiagnostics(): Promise<{
    total_queued: number;
    next_run_at: string | null;
  }> {
    if (!isLiveSupabase()) {
      const queued = Array.from(mockDb.jobQueue.values())
        .filter((j) => j.status === 'queued')
        .sort((a, b) => new Date(a.run_at).getTime() - new Date(b.run_at).getTime());
      return {
        total_queued: queued.length,
        next_run_at: queued[0]?.run_at || null,
      };
    }

    const supabase = createAdminClient();
    const { data, count, error } = await supabase
      .from('job_queue')
      .select('id, run_at', { count: 'exact' })
      .eq('status', 'queued')
      .order('run_at', { ascending: true })
      .limit(1);

    if (error || !data) {
      return { total_queued: 0, next_run_at: null };
    }

    return {
      total_queued: count || data.length,
      next_run_at: data[0]?.run_at || null,
    };
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

  async getJobs(options?: {
    status?: string;
    jobType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    jobs: JobQueueItem[];
    total: number;
    counts: {
      all: number;
      failed: number;
      queued: number;
      running: number;
      completed: number;
    };
  }> {
    if (!isLiveSupabase()) {
      const allJobs = Array.from(mockDb.jobQueue.values());
      const counts = {
        all: allJobs.length,
        failed: allJobs.filter((j) => j.status === 'failed' || j.status === 'dead').length,
        queued: allJobs.filter((j) => j.status === 'queued').length,
        running: allJobs.filter((j) => j.status === 'running').length,
        completed: allJobs.filter((j) => j.status === 'completed').length,
      };

      let filtered = allJobs;
      if (options?.status && options.status !== 'all') {
        if (options.status === 'failed') {
          filtered = filtered.filter((j) => j.status === 'failed' || j.status === 'dead');
        } else {
          filtered = filtered.filter((j) => j.status === options.status);
        }
      }
      if (options?.jobType && options.jobType !== 'all') {
        filtered = filtered.filter((j) => j.job_type === options.jobType);
      }

      filtered.sort((a, b) => new Date(b.created_at || b.run_at).getTime() - new Date(a.created_at || a.run_at).getTime());

      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;
      const paged = filtered.slice(offset, offset + limit);

      return {
        jobs: paged,
        total: filtered.length,
        counts,
      };
    }

    const supabase = createAdminClient();

    const [allCount, failedCount, queuedCount, runningCount, completedCount] = await Promise.all([
      supabase.from('job_queue').select('*', { count: 'exact', head: true }),
      supabase.from('job_queue').select('*', { count: 'exact', head: true }).in('status', ['failed', 'dead']),
      supabase.from('job_queue').select('*', { count: 'exact', head: true }).eq('status', 'queued'),
      supabase.from('job_queue').select('*', { count: 'exact', head: true }).eq('status', 'running'),
      supabase.from('job_queue').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    ]);

    const counts = {
      all: allCount.count || 0,
      failed: failedCount.count || 0,
      queued: queuedCount.count || 0,
      running: runningCount.count || 0,
      completed: completedCount.count || 0,
    };

    let query = supabase.from('job_queue').select('*', { count: 'exact' });

    if (options?.status && options.status !== 'all') {
      if (options.status === 'failed') {
        query = query.in('status', ['failed', 'dead']);
      } else {
        query = query.eq('status', options.status);
      }
    }

    if (options?.jobType && options.jobType !== 'all') {
      query = query.eq('job_type', options.jobType);
    }

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);

    return {
      jobs: data || [],
      total: count || (data ? data.length : 0),
      counts,
    };
  },

  async retryJob(jobId: string): Promise<JobQueueItem | null> {
    const now = new Date().toISOString();
    if (!isLiveSupabase()) {
      const job = mockDb.jobQueue.get(jobId);
      if (job) {
        job.status = 'queued';
        job.attempts = 0;
        job.last_error = null;
        job.locked_at = null;
        job.lock_expires_at = null;
        job.run_at = now;
        job.updated_at = now;
        return { ...job };
      }
      return null;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('job_queue')
      .update({
        status: 'queued',
        attempts: 0,
        last_error: null,
        locked_at: null,
        lock_expires_at: null,
        run_at: now,
        updated_at: now,
      })
      .eq('id', jobId)
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  },

  async retryAllFailedJobs(): Promise<number> {
    const now = new Date().toISOString();
    if (!isLiveSupabase()) {
      let count = 0;
      for (const job of mockDb.jobQueue.values()) {
        if (job.status === 'failed' || job.status === 'dead') {
          job.status = 'queued';
          job.attempts = 0;
          job.last_error = null;
          job.locked_at = null;
          job.lock_expires_at = null;
          job.run_at = now;
          job.updated_at = now;
          count++;
        }
      }
      return count;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('job_queue')
      .update({
        status: 'queued',
        attempts: 0,
        last_error: null,
        locked_at: null,
        lock_expires_at: null,
        run_at: now,
        updated_at: now,
      })
      .in('status', ['failed', 'dead'])
      .select('id');

    if (error) throw new Error(error.message);
    return data ? data.length : 0;
  },

  async deleteJob(jobId: string): Promise<boolean> {
    if (!isLiveSupabase()) {
      return mockDb.jobQueue.delete(jobId);
    }
    const supabase = createAdminClient();
    const { error } = await supabase.from('job_queue').delete().eq('id', jobId);
    if (error) throw new Error(error.message);
    return true;
  },

  async clearFailedJobs(): Promise<number> {
    if (!isLiveSupabase()) {
      let count = 0;
      for (const [id, job] of mockDb.jobQueue.entries()) {
        if (job.status === 'failed' || job.status === 'dead') {
          mockDb.jobQueue.delete(id);
          count++;
        }
      }
      return count;
    }
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('job_queue')
      .delete()
      .in('status', ['failed', 'dead'])
      .select('id');
    if (error) throw new Error(error.message);
    return data ? data.length : 0;
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

    const accountStats = await this.getAccountDailyStats(userId);
    const accountGroups = await this.getAccountGroups(userId);

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
      totalAccounts: accountStats.totalAccounts,
      activeAccounts: accountStats.activeAccounts,
      dailyCapacity: accountStats.dailyCapacity,
      sentToday: accountStats.sentToday,
      remainingToday: accountStats.remainingToday,
      accountGroupsCount: accountGroups.length,
      accounts: accountStats.accounts,
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

  // Discovery Jobs
  async getDiscoveryJobs(userId: string): Promise<DiscoveryJob[]> {
    if (!isLiveSupabase()) {
      return Array.from(mockDb.discoveryJobs.values())
        .filter((j: any) => j.user_id === userId)
        .map((j: any) => ({
          ...j,
          auto_enroll_campaign: j.auto_enroll_campaign_id ? mockDb.campaigns.get(j.auto_enroll_campaign_id) : null,
        }))
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('discovery_jobs')
      .select('*, auto_enroll_campaign:campaigns(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async getDiscoveryJob(id: string): Promise<DiscoveryJob | null> {
    if (!id) return null;
    if (!isLiveSupabase()) {
      const job = mockDb.discoveryJobs.get(id);
      if (!job) return null;
      return {
        ...job,
        auto_enroll_campaign: job.auto_enroll_campaign_id ? mockDb.campaigns.get(job.auto_enroll_campaign_id) : null,
      };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('discovery_jobs')
      .select('*, auto_enroll_campaign:campaigns(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data || null;
  },

  async createDiscoveryJob(
    userId: string,
    jobData: Omit<DiscoveryJob, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  ): Promise<DiscoveryJob> {
    const id = crypto.randomUUID();
    const newJob: DiscoveryJob = {
      ...jobData,
      id,
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (!isLiveSupabase()) {
      mockDb.discoveryJobs.set(id, newJob);
      return newJob;
    }

    const supabase = createAdminClient();
    // Strip virtual joined fields before insert
    const { auto_enroll_campaign, ...cleanRow } = newJob as any;
    const { data, error } = await supabase.from('discovery_jobs').insert(cleanRow).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  async updateDiscoveryJob(id: string, updates: Partial<DiscoveryJob>): Promise<DiscoveryJob> {
    const now = new Date().toISOString();
    if (!isLiveSupabase()) {
      const existing = mockDb.discoveryJobs.get(id);
      if (!existing) throw new Error(`Discovery job not found: ${id}`);
      const updated = { ...existing, ...updates, updated_at: now };
      mockDb.discoveryJobs.set(id, updated);
      return updated;
    }

    const supabase = createAdminClient();
    const { auto_enroll_campaign, ...cleanUpdates } = updates as any;
    const { data, error } = await supabase
      .from('discovery_jobs')
      .update({ ...cleanUpdates, updated_at: now })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  async deleteDiscoveryJob(id: string): Promise<void> {
    if (!isLiveSupabase()) {
      mockDb.discoveryJobs.delete(id);
      return;
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from('discovery_jobs').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // Multi-signal Deduplication
  async findExistingLeadBySignals(
    userId: string,
    signals: {
      place_id?: string;
      canonical_domain?: string;
      normalized_phone?: string;
      company?: string;
      city?: string;
      normalized_email?: string;
    }
  ): Promise<Lead | null> {
    if (!isLiveSupabase()) {
      const userLeads = Array.from(mockDb.leads.values()).filter((l) => l.user_id === userId);

      // Signal 1: Place ID
      if (signals.place_id) {
        const found = userLeads.find((l) => l.place_id === signals.place_id);
        if (found) return found;
      }
      // Signal 2: Canonical Domain
      if (signals.canonical_domain) {
        const found = userLeads.find((l) => l.canonical_domain === signals.canonical_domain);
        if (found) return found;
      }
      // Signal 3: Normalized Phone
      if (signals.normalized_phone) {
        const found = userLeads.find((l) => l.normalized_phone === signals.normalized_phone);
        if (found) return found;
      }
      // Signal 4: Company + City
      if (signals.company && signals.city) {
        const found = userLeads.find(
          (l) =>
            l.company.toLowerCase() === signals.company!.toLowerCase() &&
            l.city?.toLowerCase() === signals.city!.toLowerCase()
        );
        if (found) return found;
      }
      // Signal 5: Normalized Email
      if (signals.normalized_email) {
        const found = userLeads.find((l) => l.normalized_email === signals.normalized_email);
        if (found) return found;
      }
      return null;
    }

    const supabase = createAdminClient();

    // Check Signal 1: Place ID
    if (signals.place_id) {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', userId)
        .eq('place_id', signals.place_id)
        .maybeSingle();
      if (data) return data;
    }

    // Check Signal 2: Canonical Domain
    if (signals.canonical_domain) {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', userId)
        .eq('canonical_domain', signals.canonical_domain)
        .maybeSingle();
      if (data) return data;
    }

    // Check Signal 3: Normalized Phone
    if (signals.normalized_phone) {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', userId)
        .eq('normalized_phone', signals.normalized_phone)
        .maybeSingle();
      if (data) return data;
    }

    // Check Signal 4: Company + City
    if (signals.company && signals.city) {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', userId)
        .ilike('company', signals.company)
        .ilike('city', signals.city)
        .maybeSingle();
      if (data) return data;
    }

    // Check Signal 5: Normalized Email
    if (signals.normalized_email) {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', userId)
        .eq('normalized_email', signals.normalized_email)
        .maybeSingle();
      if (data) return data;
    }

    return null;
  },

  // Deduplicating Lead Upsert
  async saveOrUpdateDiscoveredLead(
    userId: string,
    leadData: Partial<Lead> & {
      company: string;
      canonical_domain?: string;
      normalized_phone?: string;
      place_id?: string;
    }
  ): Promise<{ lead: Lead; isNew: boolean }> {
    const existing = await this.findExistingLeadBySignals(userId, {
      place_id: leadData.place_id || undefined,
      canonical_domain: leadData.canonical_domain || undefined,
      normalized_phone: leadData.normalized_phone || undefined,
      company: leadData.company,
      city: leadData.city || undefined,
      normalized_email: leadData.normalized_email || (leadData.email ? leadData.email.toLowerCase().trim() : undefined),
    });

    if (existing) {
      // If manually verified, do NOT overwrite core contact fields with AI inferred data
      const updates: Partial<Lead> = {};

      if (!existing.is_verified) {
        if (!existing.phone && leadData.phone) updates.phone = leadData.phone;
        if (!existing.normalized_phone && leadData.normalized_phone) updates.normalized_phone = leadData.normalized_phone;
        if (!existing.canonical_domain && leadData.canonical_domain) updates.canonical_domain = leadData.canonical_domain;
        if (!existing.website && leadData.website) updates.website = leadData.website;
        if (!existing.address && leadData.address) updates.address = leadData.address;
        if (!existing.city && leadData.city) updates.city = leadData.city;
        if (!existing.state && leadData.state) updates.state = leadData.state;
        if (!existing.country && leadData.country) updates.country = leadData.country;
        if (existing.rating == null && leadData.rating != null) updates.rating = leadData.rating;
        if (existing.review_count == null && leadData.review_count != null) updates.review_count = leadData.review_count;
      }

      // Always update enrichment & qualification if newly qualified
      if (leadData.qualification_score != null) {
        updates.qualification_score = leadData.qualification_score;
        updates.qualification_priority = leadData.qualification_priority;
        updates.qualification_confidence = leadData.qualification_confidence;
        updates.qualification_summary = leadData.qualification_summary;
        updates.sales_angle = leadData.sales_angle;
        updates.suggested_opening = leadData.suggested_opening;
        updates.observed_friction = leadData.observed_friction;
        updates.evidence_urls = leadData.evidence_urls;
        updates.last_enriched_at = new Date().toISOString();
      }

      if (leadData.booking_url && !existing.booking_url) updates.booking_url = leadData.booking_url;
      if (leadData.has_online_booking != null && existing.has_online_booking == null) updates.has_online_booking = leadData.has_online_booking;
      if (leadData.contact_channels && leadData.contact_channels.length > 0) {
        const mergedChannels = Array.from(new Set([...(existing.contact_channels || []), ...leadData.contact_channels]));
        updates.contact_channels = mergedChannels;
      }

      const updated = await this.updateLead(existing.id, updates);
      return { lead: updated, isNew: false };
    }

    // Brand new lead: create unique record
    const id = crypto.randomUUID();
    const rawEmail = leadData.email || (leadData.canonical_domain ? `contact@${leadData.canonical_domain}` : `unverified_${id.slice(0, 8)}@lead.local`);
    const normalizedEmail = rawEmail.toLowerCase().trim();

    const newLead: Lead = {
      id,
      user_id: userId,
      company: leadData.company,
      first_name: leadData.first_name || '',
      last_name: leadData.last_name || '',
      job_title: leadData.job_title || 'Owner / Practice Manager',
      email: rawEmail,
      normalized_email: normalizedEmail,
      website: leadData.website || '',
      canonical_domain: leadData.canonical_domain || null,
      phone: leadData.phone || null,
      normalized_phone: leadData.normalized_phone || null,
      place_id: leadData.place_id || null,
      category: leadData.category || null,
      subcategory: leadData.subcategory || null,
      address: leadData.address || null,
      city: leadData.city || null,
      state: leadData.state || null,
      country: leadData.country || 'US',
      rating: leadData.rating || null,
      review_count: leadData.review_count || null,
      google_maps_url: leadData.google_maps_url || null,
      booking_url: leadData.booking_url || null,
      has_online_booking: leadData.has_online_booking ?? null,
      contact_channels: leadData.contact_channels || [],
      observed_friction: leadData.observed_friction || [],
      qualification_score: leadData.qualification_score || null,
      qualification_priority: leadData.qualification_priority || null,
      qualification_confidence: leadData.qualification_confidence || null,
      qualification_summary: leadData.qualification_summary || null,
      sales_angle: leadData.sales_angle || null,
      suggested_opening: leadData.suggested_opening || null,
      evidence_urls: leadData.evidence_urls || [],
      discovery_job_id: leadData.discovery_job_id || null,
      discovery_source: leadData.discovery_source || 'places_api',
      discovery_timestamp: new Date().toISOString(),
      last_enriched_at: new Date().toISOString(),
      is_verified: false,
      notes: leadData.notes || '',
      custom_fields: leadData.custom_fields || {},
      status: 'active',
      source_import: leadData.source_import || 'discovery_engine',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (!isLiveSupabase()) {
      mockDb.leads.set(id, newLead);
      return { lead: newLead, isNew: true };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from('leads').insert(newLead).select().single();
    if (error) throw new Error(error.message);
    return { lead: data, isNew: true };
  },

  // Query Qualified Leads with multi-dimensional filtering
  async getQualifiedLeads(
    userId: string,
    filters?: {
      minScore?: number;
      priority?: string;
      category?: string;
      search?: string;
      discoveryJobId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ leads: Lead[]; total: number }> {
    if (!isLiveSupabase()) {
      let leads = Array.from(mockDb.leads.values()).filter((l) => l.user_id === userId);
      if (filters?.minScore != null) {
        leads = leads.filter((l) => (l.qualification_score || 0) >= filters.minScore!);
      }
      if (filters?.priority) {
        leads = leads.filter((l) => l.qualification_priority === filters.priority);
      }
      if (filters?.category) {
        leads = leads.filter((l) => l.category?.toLowerCase() === filters.category!.toLowerCase());
      }
      if (filters?.discoveryJobId) {
        leads = leads.filter((l) => l.discovery_job_id === filters.discoveryJobId);
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        leads = leads.filter(
          (l) =>
            l.company.toLowerCase().includes(q) ||
            l.email.toLowerCase().includes(q) ||
            (l.city && l.city.toLowerCase().includes(q)) ||
            (l.qualification_summary && l.qualification_summary.toLowerCase().includes(q))
        );
      }
      const total = leads.length;
      const offset = filters?.offset || 0;
      const limit = filters?.limit || 50;
      return {
        leads: leads.slice(offset, offset + limit),
        total,
      };
    }

    const supabase = createAdminClient();
    let query = supabase.from('leads').select('*', { count: 'exact' }).eq('user_id', userId);

    if (filters?.minScore != null) {
      query = query.gte('qualification_score', filters.minScore);
    }
    if (filters?.priority) {
      query = query.eq('qualification_priority', filters.priority);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.discoveryJobId) {
      query = query.eq('discovery_job_id', filters.discoveryJobId);
    }
    if (filters?.search) {
      query = query.or(
        `company.ilike.%${filters.search}%,email.ilike.%${filters.search}%,city.ilike.%${filters.search}%,qualification_summary.ilike.%${filters.search}%`
      );
    }

    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;
    const { data, count, error } = await query
      .order('qualification_score', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);
    return { leads: data || [], total: count || 0 };
  },
};

