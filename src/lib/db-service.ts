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
  LeadGroup,
  AccountDailyStats,
  JobType,
  SendingConfig,
  DiscoveryJob,
} from '@/types/database';
import {
  getNextSendingWindowDate,
  createDateInTimezone,
  getTimezoneParts,
  calculateStaggeredSchedule,
  calculateStaggeredScheduleWithAccounts,
} from './scheduler';

export const isLiveSupabase = () => {
  return (
    !env.MOCK_MODE &&
    Boolean(env.NEXT_PUBLIC_SUPABASE_URL) &&
    !env.NEXT_PUBLIC_SUPABASE_URL.includes('mock.supabase.co') &&
    Boolean(env.SUPABASE_SERVICE_ROLE_KEY) &&
    !env.SUPABASE_SERVICE_ROLE_KEY.includes('mock-service-role-key')
  );
};

export function isMailerDaemonOrBounce(senderEmail: string, summary?: string | null): boolean {
  const s = (senderEmail || '').toLowerCase();
  const sum = (summary || '').toLowerCase();
  return (
    s.includes('mailer-daemon') ||
    s.includes('mail-daemon') ||
    s.includes('mailer_daemon') ||
    s.includes('postmaster') ||
    s.includes('mail delivery subsystem') ||
    s.includes('delivery status') ||
    s.startsWith('bounce') ||
    s.includes('noreply') ||
    s.includes('no-reply') ||
    sum.includes('delivery failure') ||
    sum.includes('domain could not be found') ||
    sum.includes('address not found') ||
    sum.includes('undeliverable') ||
    sum.includes('undelivered mail') ||
    sum.includes('mailer daemon') ||
    sum.includes('outbound sales pitch') ||
    sum.includes('draft rather than a reply') ||
    sum.includes('outbound pitch')
  );
}

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
  async getLeads(
    userId: string,
    filters?: { status?: string; search?: string; limit?: number; offset?: number; groupId?: string }
  ): Promise<{ leads: Lead[]; total: number }> {
    if (!isLiveSupabase()) {
      let all = Array.from(mockDb.leads.values()).filter((l) => l.user_id === userId);
      if (filters?.status) {
        all = all.filter((l) => l.status === filters.status);
      }
      if (filters?.groupId) {
        if (filters.groupId === 'ungrouped') {
          all = all.filter((l) => !l.group_id);
        } else {
          all = all.filter((l) => l.group_id === filters.groupId);
        }
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
      const paginated = all.slice(offset, offset + limit).map((l) => ({
        ...l,
        lead_group: l.group_id ? mockDb.leadGroups.get(l.group_id) || null : null,
      }));
      return { leads: paginated, total };
    }

    const supabase = createAdminClient();
    let query = supabase.from('leads').select('*', { count: 'exact' }).eq('user_id', userId);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.groupId) {
      if (filters.groupId === 'ungrouped') {
        query = query.is('group_id', null);
      } else {
        query = query.eq('group_id', filters.groupId);
      }
    }
    if (filters?.search) {
      query = query.or(`email.ilike.%${filters.search}%,first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,company.ilike.%${filters.search}%`);
    }
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;
    const { data, count, error } = await query.range(offset, offset + limit - 1).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    let leadsWithGroup: Lead[] = data || [];
    const groupIds = Array.from(new Set(leadsWithGroup.map((l) => l.group_id).filter(Boolean))) as string[];
    if (groupIds.length > 0) {
      try {
        const { data: groupsData } = await supabase.from('lead_groups').select('*').in('id', groupIds);
        if (groupsData) {
          const map = new Map(groupsData.map((g) => [g.id, g]));
          leadsWithGroup = leadsWithGroup.map((l) => ({
            ...l,
            lead_group: l.group_id ? map.get(l.group_id) || null : null,
          }));
        }
      } catch {
        // Table lead_groups might not exist yet; safe fallback
      }
    }

    return { leads: leadsWithGroup, total: count || 0 };
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
          group_id: lead.group_id || null,
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
      group_id: l.group_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    let { data, error } = await supabase.from('leads').insert(rows).select();
    if (error && (error.message.includes('group_id') || error.message.includes('lead_groups') || error.message.includes('schema cache') || error.message.includes('foreign key'))) {
      // If column group_id doesn't exist on older schema or relation fails, fallback without group_id
      const fallbackRows = rows.map(({ group_id, ...rest }) => rest);
      const fallbackRes = await supabase.from('leads').insert(fallbackRows).select();
      data = fallbackRes.data;
      error = fallbackRes.error;
    }
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

  async enrollLeadGroupInCampaign(campaignId: string, groupId: string): Promise<{ enrolled: number }> {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    const { leads } = await this.getLeads(campaign.user_id, { groupId, limit: 10000 });
    const activeLeadIds = leads.filter((l) => l.status === 'active').map((l) => l.id);
    if (activeLeadIds.length === 0) return { enrolled: 0 };
    return this.enrollLeadsInCampaign(campaignId, activeLeadIds);
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
  async getMessages(filters?: { campaignId?: string; status?: string; limit?: number; select?: string }): Promise<EmailMessage[]> {
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
    const selectClause = filters?.select || '*, campaign_lead:campaign_leads(*, lead:leads(*))';
    let query = supabase.from('email_messages').select(selectClause);
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
    userId?: string;
    campaignId?: string;
    status?: string;
    leadGroupId?: string;
    search?: string;
    sortBy?: 'scheduled_at' | 'created_at' | 'sent_at' | 'updated_at' | 'step_number';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }): Promise<{ messages: EmailMessage[]; total: number }> {
    const sortBy = filters?.sortBy || (filters?.status === 'scheduled' ? 'scheduled_at' : 'created_at');
    const sortOrder = filters?.sortOrder || (sortBy === 'scheduled_at' ? 'asc' : 'desc');

    if (!isLiveSupabase()) {
      let msgs = Array.from(mockDb.emailMessages.values());
      if (filters?.userId) {
        msgs = msgs.filter((m) => {
          const cl = mockDb.campaignLeads.get(m.campaign_lead_id);
          const c = cl ? mockDb.campaigns.get(cl.campaign_id) : null;
          return c?.user_id === filters.userId;
        });
      }
      if (filters?.campaignId) {
        msgs = msgs.filter((m) => {
          const cl = mockDb.campaignLeads.get(m.campaign_lead_id);
          return cl?.campaign_id === filters.campaignId;
        });
      }
      if (filters?.status) {
        msgs = msgs.filter((m) => m.status === filters.status);
      } else if (sortBy === 'scheduled_at') {
        msgs = msgs.filter((m) => (m.status === 'scheduled' || m.status === 'paused') && Boolean(m.scheduled_at));
      } else if (sortBy === 'sent_at') {
        msgs = msgs.filter((m) => m.status === 'sent');
      }
      if (filters?.leadGroupId) {
        msgs = msgs.filter((m) => {
          const cl = mockDb.campaignLeads.get(m.campaign_lead_id);
          const lead = cl ? mockDb.leads.get(cl.lead_id) : null;
          return lead?.group_id === filters.leadGroupId;
        });
      }
      if (filters?.search) {
        const s = filters.search.toLowerCase().trim();
        msgs = msgs.filter((m) => {
          const cl = mockDb.campaignLeads.get(m.campaign_lead_id);
          const lead = cl ? mockDb.leads.get(cl.lead_id) : null;
          return (
            (m.subject && m.subject.toLowerCase().includes(s)) ||
            (lead?.first_name && lead.first_name.toLowerCase().includes(s)) ||
            (lead?.last_name && lead.last_name.toLowerCase().includes(s)) ||
            (lead?.email && lead.email.toLowerCase().includes(s)) ||
            (lead?.company && lead.company.toLowerCase().includes(s))
          );
        });
      }
      const total = msgs.length;
      msgs.sort((a, b) => {
        const valA = (a as any)[sortBy] ? new Date((a as any)[sortBy]).getTime() : 0;
        const valB = (b as any)[sortBy] ? new Date((b as any)[sortBy]).getTime() : 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
      const offset = filters?.offset || 0;
      const limit = filters?.limit ?? 50;
      const paged = msgs.slice(offset, offset + limit).map((m) => {
        const cl = mockDb.campaignLeads.get(m.campaign_lead_id);
        const lead = cl ? mockDb.leads.get(cl.lead_id) : undefined;
        const c = cl ? mockDb.campaigns.get(cl.campaign_id) : null;
        let accId = m.email_account_id;
        if (!accId && m.step_number > 0) {
          const step0 = Array.from(mockDb.emailMessages.values()).find(
            (other) => other.campaign_lead_id === m.campaign_lead_id && other.step_number === 0
          );
          accId = step0?.email_account_id || null;
        }
        const acc = accId ? mockDb.emailAccounts.get(accId) || null : null;
        return {
          ...m,
          email_account_id: accId || m.email_account_id,
          lead,
          campaign_id: cl?.campaign_id,
          campaign_name: c?.name,
          email_account: acc,
        };
      });
      return { messages: paged, total };
    }

    const supabase = createAdminClient();
    const leadJoin = filters?.leadGroupId ? 'lead:leads!inner(*)' : 'lead:leads(*)';
    let query = supabase.from('email_messages').select(
      `*, campaign_lead:campaign_leads!inner(*, campaign:campaigns!inner(id, name, user_id), ${leadJoin})`,
      { count: 'exact' }
    );
    if (filters?.status) {
      query = query.eq('status', filters.status);
    } else if (sortBy === 'scheduled_at') {
      query = query.in('status', ['scheduled', 'paused']).not('scheduled_at', 'is', null);
    } else if (sortBy === 'sent_at') {
      query = query.eq('status', 'sent');
    }
    if (filters?.leadGroupId) query = query.eq('campaign_lead.lead.group_id', filters.leadGroupId);
    if (filters?.campaignId) {
      query = query.eq('campaign_lead.campaign_id', filters.campaignId);
    } else if (filters?.userId) {
      query = query.eq('campaign_lead.campaign.user_id', filters.userId);
    }

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim();
      const { data: matchedLeads } = await supabase
        .from('leads')
        .select('id')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`)
        .limit(100);
      const matchedLeadIds = (matchedLeads || []).map((l: any) => l.id);
      let matchedClIds: string[] = [];
      if (matchedLeadIds.length > 0) {
        const { data: matchedCls } = await supabase
          .from('campaign_leads')
          .select('id')
          .in('lead_id', matchedLeadIds);
        matchedClIds = (matchedCls || []).map((c: any) => c.id);
      }
      if (matchedClIds.length > 0) {
        query = query.or(`subject.ilike.%${q}%,campaign_lead_id.in.(${matchedClIds.join(',')})`);
      } else {
        query = query.ilike('subject', `%${q}%`);
      }
    }

    query = query.order(sortBy, { ascending: sortOrder === 'asc', nullsFirst: false });

    const offset = filters?.offset || 0;
    const limit = filters?.limit ?? 50;
    const { data, count, error } = await query.range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);

    // Resolve step 0 email_account_id for any follow-up messages missing email_account_id
    const rawList = data || [];
    const followupsNeedingStep0 = rawList.filter((m: any) => m.step_number > 0 && !m.email_account_id);
    const step0Map = new Map<string, string>();
    if (followupsNeedingStep0.length > 0) {
      const neededClIds = Array.from(new Set(followupsNeedingStep0.map((m: any) => m.campaign_lead_id)));
      const { data: step0List } = await supabase
        .from('email_messages')
        .select('campaign_lead_id, email_account_id')
        .eq('step_number', 0)
        .in('campaign_lead_id', neededClIds);
      (step0List || []).forEach((s0: any) => {
        if (s0.email_account_id) step0Map.set(s0.campaign_lead_id, s0.email_account_id);
      });
    }

    let accountMap = new Map<string, EmailAccount>();
    if (filters?.userId) {
      try {
        const accs = await this.getEmailAccounts(filters.userId);
        accountMap = new Map(accs.map((a) => [a.id, a]));
      } catch {}
    }

    const messages = rawList.map((m: any) => {
      const resolvedAccountId = m.email_account_id || (m.step_number > 0 ? step0Map.get(m.campaign_lead_id) : null);
      return {
        ...m,
        email_account_id: resolvedAccountId || m.email_account_id,
        lead: m.campaign_lead?.lead || undefined,
        campaign_id: m.campaign_lead?.campaign_id || m.campaign_lead?.campaign?.id || undefined,
        campaign_name: m.campaign_lead?.campaign?.name || undefined,
        email_account: resolvedAccountId ? accountMap.get(resolvedAccountId) || null : null,
      };
    });
    return { messages, total: count ?? messages.length };
  },

  async getMessage(id: string): Promise<EmailMessage | null> {
    if (!id) return null;
    if (!isLiveSupabase()) {
      const msg = mockDb.emailMessages.get(id);
      if (!msg) return null;
      const cl = mockDb.campaignLeads.get(msg.campaign_lead_id);
      const lead = cl ? mockDb.leads.get(cl.lead_id) : undefined;
      const c = cl ? mockDb.campaigns.get(cl.campaign_id) : null;
      return { ...msg, lead, campaign_id: cl?.campaign_id, campaign_name: c?.name };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from('email_messages').select('*, campaign_lead:campaign_leads(*, campaign:campaigns(id, name), lead:leads(*))').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return {
      ...data,
      lead: data.campaign_lead?.lead || undefined,
      campaign_id: data.campaign_lead?.campaign_id || data.campaign_lead?.campaign?.id || undefined,
      campaign_name: data.campaign_lead?.campaign?.name || undefined,
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
    // Strictly enforce that follow-up messages (step_number > 0) inherit the same email account as Step 0
    if (message.step_number > 0 && !message.email_account_id) {
      if (!isLiveSupabase()) {
        const step0 = Array.from(mockDb.emailMessages.values()).find(
          (m) => m.campaign_lead_id === message.campaign_lead_id && m.step_number === 0
        );
        if (step0?.email_account_id) {
          message.email_account_id = step0.email_account_id;
        }
      } else {
        const supabase = createAdminClient();
        const { data: step0 } = await supabase
          .from('email_messages')
          .select('email_account_id')
          .eq('campaign_lead_id', message.campaign_lead_id)
          .eq('step_number', 0)
          .maybeSingle();
        if (step0?.email_account_id) {
          message.email_account_id = step0.email_account_id;
        }
      }
    }

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
 
  async getLatestScheduledDateForCampaign(campaignId: string): Promise<Date | null> {
    if (!isLiveSupabase()) {
      const cls = Array.from(mockDb.campaignLeads.values()).filter((c) => c.campaign_id === campaignId);
      const clIds = new Set(cls.map((c) => c.id));
      const scheduledMsgs = Array.from(mockDb.emailMessages.values()).filter(
        (m) => clIds.has(m.campaign_lead_id) && m.status === 'scheduled' && m.scheduled_at
      );
      if (scheduledMsgs.length === 0) return null;
      const timestamps = scheduledMsgs.map((m) => new Date(m.scheduled_at!).getTime());
      return new Date(Math.max(...timestamps));
    }

    const supabase = createAdminClient();
    const { data: cls } = await supabase.from('campaign_leads').select('id').eq('campaign_id', campaignId);
    const clIds = (cls || []).map((c) => c.id);
    if (clIds.length === 0) return null;

    const { data, error } = await supabase
      .from('email_messages')
      .select('scheduled_at')
      .in('campaign_lead_id', clIds)
      .eq('status', 'scheduled')
      .not('scheduled_at', 'is', null)
      .order('scheduled_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0 || !data[0].scheduled_at) return null;
    return new Date(data[0].scheduled_at);
  },

  async rescheduleCampaignScheduledMessages(campaignId: string): Promise<{ rescheduledCount: number }> {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

    let accounts: EmailAccount[] = [];
    if (campaign.account_group_id) {
      const allAccounts = await this.getEmailAccounts(campaign.user_id, { status: 'active' });
      const inGroup = allAccounts.filter((a) => a.group_id === campaign.account_group_id);
      accounts = inGroup.length > 0 ? inGroup : allAccounts;
    } else if (campaign.email_account_id) {
      const allAccounts = await this.getEmailAccounts(campaign.user_id, { status: 'active' });
      const matched = allAccounts.filter((a) => a.id === campaign.email_account_id);
      accounts = matched.length > 0 ? matched : allAccounts;
    } else {
      accounts = await this.getEmailAccounts(campaign.user_id, { status: 'active' });
    }

    if (!isLiveSupabase()) {
      const cls = Array.from(mockDb.campaignLeads.values()).filter((c) => c.campaign_id === campaignId);
      const clIds = new Set(cls.map((c) => c.id));
      const scheduledMsgs = Array.from(mockDb.emailMessages.values())
        .filter((m) => clIds.has(m.campaign_lead_id) && m.status === 'scheduled')
        .sort((a, b) => (a.step_number || 0) - (b.step_number || 0) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      if (scheduledMsgs.length === 0) return { rescheduledCount: 0 };

      const scheduleSlots = calculateStaggeredScheduleWithAccounts(campaign, accounts, scheduledMsgs.length, new Date());
      for (let i = 0; i < scheduledMsgs.length; i++) {
        const msg = scheduledMsgs[i];
        const slot = scheduleSlots[i] || scheduleSlots[scheduleSlots.length - 1];
        const newDate = slot ? slot.date : new Date();
        msg.scheduled_at = newDate.toISOString();
        if (msg.step_number > 0) {
          const step0 = Array.from(mockDb.emailMessages.values()).find(
            (other) => other.campaign_lead_id === msg.campaign_lead_id && other.step_number === 0
          );
          if (step0?.email_account_id) {
            msg.email_account_id = step0.email_account_id;
          }
        } else if (slot?.accountId) {
          msg.email_account_id = slot.accountId;
        }
        for (const job of mockDb.jobQueue.values()) {
          if (job.job_type === 'send_email' && (job.payload as any)?.emailMessageId === msg.id && job.status === 'queued') {
            job.run_at = newDate.toISOString();
          }
        }
      }
      return { rescheduledCount: scheduledMsgs.length };
    }

    const supabase = createAdminClient();
    const { data: cls, error: clErr } = await supabase.from('campaign_leads').select('id').eq('campaign_id', campaignId);
    if (clErr) throw new Error(clErr.message);
    const clIds = (cls || []).map((c) => c.id);
    if (clIds.length === 0) return { rescheduledCount: 0 };

    const { data: messages, error: msgErr } = await supabase
      .from('email_messages')
      .select('id, campaign_lead_id, step_number, created_at, scheduled_at, email_account_id')
      .in('campaign_lead_id', clIds)
      .eq('status', 'scheduled')
      .order('step_number', { ascending: true })
      .order('created_at', { ascending: true });

    if (msgErr) throw new Error(msgErr.message);
    if (!messages || messages.length === 0) return { rescheduledCount: 0 };

    // Resolve Step 0 email accounts for follow-ups
    const { data: step0List } = await supabase
      .from('email_messages')
      .select('campaign_lead_id, email_account_id')
      .eq('step_number', 0)
      .in('campaign_lead_id', clIds);
    const step0Map = new Map((step0List || []).map((s: any) => [s.campaign_lead_id, s.email_account_id]));

    const scheduleSlots = calculateStaggeredScheduleWithAccounts(campaign, accounts, messages.length, new Date());

    const BATCH_SIZE = 25;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (msg, bIdx) => {
          const globalIdx = i + bIdx;
          const slot = scheduleSlots[globalIdx];
          const newIso = (slot?.date || new Date()).toISOString();
          const targetAccountId = msg.step_number > 0
            ? (msg.email_account_id || step0Map.get(msg.campaign_lead_id) || slot?.accountId)
            : slot?.accountId;

          await supabase
            .from('email_messages')
            .update({
              scheduled_at: newIso,
              ...(targetAccountId ? { email_account_id: targetAccountId } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq('id', msg.id);

          await supabase
            .from('job_queue')
            .update({ run_at: newIso })
            .eq('job_type', 'send_email')
            .eq('status', 'queued')
            .filter('payload->>emailMessageId', 'eq', msg.id);
        })
      );
    }

    return { rescheduledCount: messages.length };
  },

  async pauseCampaignMessages(campaignId: string): Promise<{ pausedCount: number }> {
    if (!campaignId) return { pausedCount: 0 };

    if (!isLiveSupabase()) {
      const cls = Array.from(mockDb.campaignLeads.values()).filter((c) => c.campaign_id === campaignId);
      const clIds = new Set(cls.map((c) => c.id));
      const scheduledMsgs = Array.from(mockDb.emailMessages.values()).filter(
        (m) => clIds.has(m.campaign_lead_id) && m.status === 'scheduled'
      );

      if (scheduledMsgs.length === 0) return { pausedCount: 0 };

      const msgIds = new Set(scheduledMsgs.map((m) => m.id));
      for (const msg of scheduledMsgs) {
        msg.status = 'paused';
        msg.updated_at = new Date().toISOString();
      }

      // Remove queued send_email jobs for these messages
      for (const [jobId, job] of Array.from(mockDb.jobQueue.entries())) {
        if (
          job.job_type === 'send_email' &&
          job.status === 'queued' &&
          msgIds.has((job.payload as any)?.emailMessageId)
        ) {
          mockDb.jobQueue.delete(jobId);
        }
      }

      return { pausedCount: scheduledMsgs.length };
    }

    const supabase = createAdminClient();
    const { data: cls, error: clErr } = await supabase
      .from('campaign_leads')
      .select('id')
      .eq('campaign_id', campaignId);
    if (clErr) throw new Error(clErr.message);
    const clIds = (cls || []).map((c) => c.id);
    if (clIds.length === 0) return { pausedCount: 0 };

    const { data: messages, error: msgErr } = await supabase
      .from('email_messages')
      .select('id')
      .in('campaign_lead_id', clIds)
      .eq('status', 'scheduled');

    if (msgErr) throw new Error(msgErr.message);
    if (!messages || messages.length === 0) return { pausedCount: 0 };

    const msgIds = messages.map((m) => m.id);

    // Update messages to paused and delete queued send_email jobs in chunks
    for (let i = 0; i < msgIds.length; i += 100) {
      const chunk = msgIds.slice(i, i + 100);
      const { error: updErr } = await supabase
        .from('email_messages')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .in('id', chunk);
      if (updErr) throw new Error(updErr.message);

      const formatted = `(${chunk.join(',')})`;
      const { error: jobDelErr } = await supabase
        .from('job_queue')
        .delete()
        .eq('job_type', 'send_email')
        .eq('status', 'queued')
        .filter('payload->>emailMessageId', 'in', formatted);
      if (jobDelErr) {
        console.warn('Warning: Failed to bulk delete queued send_email jobs:', jobDelErr.message);
      }
    }

    return { pausedCount: msgIds.length };
  },

  async resumeAndRescheduleCampaignMessages(campaignId: string): Promise<{ rescheduledCount: number }> {
    if (!campaignId) return { rescheduledCount: 0 };

    const campaign = await this.getCampaign(campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

    let accounts: EmailAccount[] = [];
    if (campaign.account_group_id) {
      const allAccounts = await this.getEmailAccounts(campaign.user_id, { status: 'active' });
      const inGroup = allAccounts.filter((a) => a.group_id === campaign.account_group_id);
      accounts = inGroup.length > 0 ? inGroup : allAccounts;
    } else if (campaign.email_account_id) {
      const allAccounts = await this.getEmailAccounts(campaign.user_id, { status: 'active' });
      const matched = allAccounts.filter((a) => a.id === campaign.email_account_id);
      accounts = matched.length > 0 ? matched : allAccounts;
    } else {
      accounts = await this.getEmailAccounts(campaign.user_id, { status: 'active' });
    }
    if (accounts.length === 0) {
      const connected = await this.getConnectedEmailAccount(campaign.user_id);
      if (connected) accounts = [connected];
    }

    if (!isLiveSupabase()) {
      const cls = Array.from(mockDb.campaignLeads.values()).filter((c) => c.campaign_id === campaignId);
      const clIds = new Set(cls.map((c) => c.id));
      const msgsToReschedule = Array.from(mockDb.emailMessages.values())
        .filter((m) => clIds.has(m.campaign_lead_id) && (m.status === 'paused' || m.status === 'scheduled'))
        .sort(
          (a, b) =>
            (a.step_number || 0) - (b.step_number || 0) ||
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

      if (msgsToReschedule.length === 0) return { rescheduledCount: 0 };

      const scheduleSlots = calculateStaggeredScheduleWithAccounts(campaign, accounts, msgsToReschedule.length, new Date());
      for (let i = 0; i < msgsToReschedule.length; i++) {
        const msg = msgsToReschedule[i];
        const slot = scheduleSlots[i] || scheduleSlots[scheduleSlots.length - 1];
        const newDate = slot ? slot.date : new Date();
        const newIso = newDate.toISOString();
        msg.status = 'scheduled';
        msg.scheduled_at = newIso;
        if (msg.step_number > 0) {
          const step0 = Array.from(mockDb.emailMessages.values()).find(
            (other) => other.campaign_lead_id === msg.campaign_lead_id && other.step_number === 0
          );
          if (step0?.email_account_id) {
            msg.email_account_id = step0.email_account_id;
          }
        } else if (slot?.accountId) {
          msg.email_account_id = slot.accountId;
        }
        msg.updated_at = new Date().toISOString();

        // Remove old queued job if any
        for (const [jobId, job] of Array.from(mockDb.jobQueue.entries())) {
          if (
            job.job_type === 'send_email' &&
            job.status === 'queued' &&
            (job.payload as any)?.emailMessageId === msg.id
          ) {
            mockDb.jobQueue.delete(jobId);
          }
        }

        // Enqueue new send job
        await this.enqueueJob(
          'send_email',
          { emailMessageId: msg.id },
          `resume_send_${msg.id}_${newDate.getTime()}`,
          newDate
        );
      }

      return { rescheduledCount: msgsToReschedule.length };
    }

    const supabase = createAdminClient();
    const { data: cls, error: clErr } = await supabase
      .from('campaign_leads')
      .select('id')
      .eq('campaign_id', campaignId);
    if (clErr) throw new Error(clErr.message);
    const clIds = (cls || []).map((c) => c.id);
    if (clIds.length === 0) return { rescheduledCount: 0 };

    // Fetch paused (or scheduled) messages for these leads to reschedule cleanly
    const { data: messages, error: msgErr } = await supabase
      .from('email_messages')
      .select('id, campaign_lead_id, step_number, created_at, scheduled_at, email_account_id, status')
      .in('campaign_lead_id', clIds)
      .in('status', ['paused', 'scheduled'])
      .order('step_number', { ascending: true })
      .order('created_at', { ascending: true });

    if (msgErr) throw new Error(msgErr.message);
    if (!messages || messages.length === 0) return { rescheduledCount: 0 };

    // Resolve Step 0 accounts for follow-ups
    const { data: step0List } = await supabase
      .from('email_messages')
      .select('campaign_lead_id, email_account_id')
      .eq('step_number', 0)
      .in('campaign_lead_id', clIds);
    const step0Map = new Map((step0List || []).map((s: any) => [s.campaign_lead_id, s.email_account_id]));

    const msgIds = messages.map((m) => m.id);

    // Delete existing queued send_email jobs for these messages in chunks first
    for (let i = 0; i < msgIds.length; i += 100) {
      const chunk = msgIds.slice(i, i + 100);
      const formatted = `(${chunk.join(',')})`;
      await supabase
        .from('job_queue')
        .delete()
        .eq('job_type', 'send_email')
        .eq('status', 'queued')
        .filter('payload->>emailMessageId', 'in', formatted);
    }

    const scheduleSlots = calculateStaggeredScheduleWithAccounts(campaign, accounts, messages.length, new Date());

    // Update email messages in parallel batches of 25
    const BATCH_SIZE = 25;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((msg, bIdx) => {
          const globalIdx = i + bIdx;
          const slot = scheduleSlots[globalIdx];
          const newDate = slot ? slot.date : new Date();
          const targetAccountId = msg.step_number > 0
            ? (msg.email_account_id || step0Map.get(msg.campaign_lead_id) || slot?.accountId)
            : slot?.accountId;

          return supabase
            .from('email_messages')
            .update({
              status: 'scheduled',
              scheduled_at: newDate.toISOString(),
              ...(targetAccountId ? { email_account_id: targetAccountId } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq('id', msg.id);
        })
      );
    }

    // Bulk insert new queued jobs into job_queue
    const newJobs = messages.map((msg, idx) => {
      const slot = scheduleSlots[idx];
      const newDate = slot ? slot.date : new Date();
      return {
        job_type: 'send_email',
        payload: { emailMessageId: msg.id },
        idempotency_key: `resume_send_${msg.id}_${newDate.getTime()}`,
        run_at: newDate.toISOString(),
        status: 'queued',
        attempts: 0,
        max_attempts: 3,
      };
    });

    for (let i = 0; i < newJobs.length; i += 50) {
      const chunk = newJobs.slice(i, i + 50);
      const { error: insErr } = await supabase.from('job_queue').insert(chunk);
      if (insErr) {
        console.warn('Warning inserting resume send_email jobs in bulk:', insErr.message);
      }
    }

    return { rescheduledCount: messages.length };
  },

  /**
   * Syncs schedule and redistributes messages across all active inboxes whenever
   * an email account is added, updated, or removed from an account group.
   */
  async syncGroupCampaignsSchedule(groupId: string, userId: string): Promise<void> {
    if (!groupId) return;
    try {
      const campaigns = await this.getCampaigns(userId);
      const activeGroupCampaigns = campaigns.filter(
        (c) => c.account_group_id === groupId && c.status === 'active'
      );
      if (activeGroupCampaigns.length === 0) return;

      const allAccounts = await this.getEmailAccounts(userId, { status: 'active' });
      const inGroup = allAccounts.filter((a) => a.group_id === groupId);
      const totalDailyCapacity = inGroup.reduce((sum, a) => sum + (a.daily_limit || 18), 0);

      for (const campaign of activeGroupCampaigns) {
        if (totalDailyCapacity > 0) {
          await this.updateCampaign(campaign.id, {
            sending_config: {
              ...campaign.sending_config,
              daily_limit: totalDailyCapacity,
            },
          });
        }
        await this.rescheduleCampaignScheduledMessages(campaign.id);
      }
    } catch (err) {
      console.error(`[dbService] Error syncing group campaigns schedule for group ${groupId}:`, err);
    }
  },

  // Lead Groups
  async getLeadGroups(userId: string): Promise<LeadGroup[]> {
    if (!userId) return [];
    let groups: LeadGroup[] = [];
    if (!isLiveSupabase()) {
      groups = Array.from(mockDb.leadGroups.values()).filter((g) => g.user_id === userId);
    } else {
      const supabase = createAdminClient();
      try {
        const { data, error } = await supabase
          .from('lead_groups')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (!error && data) {
          groups = data;
        } else {
          groups = Array.from(mockDb.leadGroups.values()).filter((g) => g.user_id === userId);
        }
      } catch {
        groups = Array.from(mockDb.leadGroups.values()).filter((g) => g.user_id === userId);
      }
    }

    // Populate leads count for each group
    try {
      if (!isLiveSupabase()) {
        const allLeads = Array.from(mockDb.leads.values()).filter((l) => l.user_id === userId);
        return groups.map((g) => ({
          ...g,
          leads_count: allLeads.filter((l) => l.group_id === g.id).length,
        }));
      } else {
        const supabase = createAdminClient();
        const { data: countsData } = await supabase
          .from('leads')
          .select('group_id')
          .eq('user_id', userId)
          .not('group_id', 'is', null);

        const countMap = new Map<string, number>();
        (countsData || []).forEach((row: { group_id: string }) => {
          if (row.group_id) {
            countMap.set(row.group_id, (countMap.get(row.group_id) || 0) + 1);
          }
        });

        return groups.map((g) => ({
          ...g,
          leads_count: countMap.get(g.id) || 0,
        }));
      }
    } catch {
      return groups.map((g) => ({ ...g, leads_count: 0 }));
    }
  },

  async getLeadGroup(id: string): Promise<LeadGroup | null> {
    if (!id) return null;
    if (!isLiveSupabase()) {
      const g = mockDb.leadGroups.get(id);
      if (!g) return null;
      const count = Array.from(mockDb.leads.values()).filter((l) => l.group_id === id).length;
      return { ...g, leads_count: count };
    }
    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase.from('lead_groups').select('*').eq('id', id).maybeSingle();
      if (error || !data) {
        return mockDb.leadGroups.get(id) || null;
      }
      let count = 0;
      try {
        const { count: c } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('group_id', id);
        count = c || 0;
      } catch {
        count = 0;
      }
      return { ...data, leads_count: count };
    } catch {
      return mockDb.leadGroups.get(id) || null;
    }
  },

  async createLeadGroup(
    userId: string,
    group: {
      name: string;
      description?: string;
    }
  ): Promise<LeadGroup> {
    const id = crypto.randomUUID();
    const newGroup: LeadGroup = {
      id,
      user_id: userId,
      name: group.name.trim(),
      description: (group.description || '').trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      leads_count: 0,
    };

    if (!isLiveSupabase()) {
      mockDb.leadGroups.set(id, newGroup);
      return newGroup;
    }

    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('lead_groups')
        .insert({
          id,
          user_id: userId,
          name: group.name.trim(),
          description: (group.description || '').trim(),
        })
        .select()
        .single();
      if (error) {
        if (
          error.message.includes('schema cache') ||
          error.message.includes('lead_groups') ||
          error.message.includes('relation')
        ) {
          console.warn('Live lead_groups table unavailable, falling back to mockDb:', error.message);
          mockDb.leadGroups.set(id, newGroup);
          return newGroup;
        }
        throw new Error(error.message);
      }
      return {
        ...data,
        leads_count: 0,
      };
    } catch (err: any) {
      if (
        err.message?.includes('schema cache') ||
        err.message?.includes('lead_groups') ||
        err.message?.includes('relation')
      ) {
        console.warn('Live lead_groups insert threw error, falling back to mockDb:', err.message);
        mockDb.leadGroups.set(id, newGroup);
        return newGroup;
      }
      throw err;
    }
  },

  async updateLeadGroup(id: string, updates: { name?: string; description?: string }): Promise<LeadGroup> {
    const cleanUpdates: Record<string, any> = {};
    if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
    if (updates.description !== undefined) cleanUpdates.description = updates.description.trim();

    if (!isLiveSupabase()) {
      const existing = mockDb.leadGroups.get(id);
      if (!existing) throw new Error('Lead group not found');
      const updated = { ...existing, ...cleanUpdates, updated_at: new Date().toISOString() };
      mockDb.leadGroups.set(id, updated);
      const count = Array.from(mockDb.leads.values()).filter((l) => l.group_id === id).length;
      return { ...updated, leads_count: count };
    }

    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('lead_groups')
        .update({ ...cleanUpdates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) {
        if (
          error.message.includes('schema cache') ||
          error.message.includes('lead_groups') ||
          error.message.includes('relation')
        ) {
          const existing = mockDb.leadGroups.get(id);
          if (existing) {
            const updated = { ...existing, ...cleanUpdates, updated_at: new Date().toISOString() };
            mockDb.leadGroups.set(id, updated);
            return updated;
          }
        }
        throw new Error(error.message);
      }
      const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('group_id', id);
      return {
        ...data,
        leads_count: count || 0,
      };
    } catch (err: any) {
      const existing = mockDb.leadGroups.get(id);
      if (existing) {
        const updated = { ...existing, ...cleanUpdates, updated_at: new Date().toISOString() };
        mockDb.leadGroups.set(id, updated);
        return updated;
      }
      throw err;
    }
  },

  async deleteLeadGroup(id: string): Promise<void> {
    if (!isLiveSupabase()) {
      mockDb.leadGroups.delete(id);
      for (const lead of mockDb.leads.values()) {
        if (lead.group_id === id) {
          lead.group_id = null;
        }
      }
      return;
    }

    const supabase = createAdminClient();
    try {
      await supabase.from('leads').update({ group_id: null }).eq('group_id', id);
    } catch {
      // Ignore if group_id column doesn't exist
    }
    try {
      await supabase.from('lead_groups').delete().eq('id', id);
    } catch {
      // Ignore if lead_groups doesn't exist
    }
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
          account_count: groupAccounts.length,
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
      account_count: 0,
      daily_capacity: 0,
    };
  },

  async updateAccountGroup(id: string, updates: Partial<AccountGroup>): Promise<AccountGroup> {
    const { accounts_count, account_count, daily_capacity, ...cleanUpdates } = updates;

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
      accounts_count: accounts_count ?? account_count ?? 0,
      account_count: accounts_count ?? account_count ?? 0,
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

    // Calculate sent_today and remaining_today using targeted projections
    let todaySentMessages: Array<{ email_account_id?: string | null }> = [];
    let todayWarmupSent: Array<{ from_account_id: string }> = [];
    let todayWarmupReceived: Array<{ to_account_id: string }> = [];
    try {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      if (!isLiveSupabase()) {
        for (const m of mockDb.emailMessages.values()) {
          if (m.status === 'sent' && m.sent_at && m.sent_at >= todayIso) {
            todaySentMessages.push({ email_account_id: m.email_account_id });
          }
        }
        for (const wm of mockDb.warmupMessages.values()) {
          if (wm.sent_at && wm.sent_at >= todayIso) {
            todayWarmupSent.push({ from_account_id: wm.from_account_id });
          }
          if (wm.status === 'replied' && wm.replied_at && wm.replied_at >= todayIso) {
            todayWarmupReceived.push({ to_account_id: wm.to_account_id });
          }
        }
      } else {
        const supabase = createAdminClient();
        const [{ data: outreachData }, { data: sentWarmup }, { data: replyWarmup }] = await Promise.all([
          supabase
            .from('email_messages')
            .select('email_account_id')
            .eq('status', 'sent')
            .gte('sent_at', todayIso),
          supabase
            .from('warmup_messages')
            .select('from_account_id')
            .gte('sent_at', todayIso),
          supabase
            .from('warmup_messages')
            .select('to_account_id')
            .eq('status', 'replied')
            .gte('replied_at', todayIso),
        ]);
        todaySentMessages = outreachData || [];
        todayWarmupSent = sentWarmup || [];
        todayWarmupReceived = replyWarmup || [];
      }
    } catch {
      todaySentMessages = [];
      todayWarmupSent = [];
      todayWarmupReceived = [];
    }

    return accounts.map((acc) => {
      const sentCount = todaySentMessages.filter(
        (m) => m.email_account_id === acc.id || (!m.email_account_id && accounts.length === 1)
      ).length;
      const warmupSentCount = todayWarmupSent.filter((w) => w.from_account_id === acc.id).length;
      const warmupReceivedCount = todayWarmupReceived.filter((w) => w.to_account_id === acc.id).length;
      const limit = acc.daily_limit || 18;

      // If live Supabase and stored warmup counts are stale, asynchronously synchronize the DB column
      if (
        isLiveSupabase() &&
        (acc.warmup_sent_today !== warmupSentCount || acc.warmup_received_today !== warmupReceivedCount)
      ) {
        const supabase = createAdminClient();
        Promise.resolve(
          supabase
            .from('email_accounts')
            .update({
              warmup_sent_today: warmupSentCount,
              warmup_received_today: warmupReceivedCount,
            })
            .eq('id', acc.id)
        ).catch(() => {});
      }

      return {
        ...acc,
        sent_today: sentCount,
        remaining_today: Math.max(0, limit - sentCount),
        warmup_sent_today: warmupSentCount,
        warmup_received_today: warmupReceivedCount,
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
    let warmupSentCount = 0;
    let warmupReceivedCount = 0;
    try {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      if (!isLiveSupabase()) {
        for (const m of mockDb.emailMessages.values()) {
          if (m.email_account_id === acc.id && m.status === 'sent' && m.sent_at && m.sent_at >= todayIso) {
            sentCount++;
          }
        }
        for (const wm of mockDb.warmupMessages.values()) {
          if (wm.from_account_id === acc.id && wm.sent_at && wm.sent_at >= todayIso) {
            warmupSentCount++;
          }
          if (wm.to_account_id === acc.id && wm.status === 'replied' && wm.replied_at && wm.replied_at >= todayIso) {
            warmupReceivedCount++;
          }
        }
      } else {
        const supabase = createAdminClient();
        const [{ count: sentExact }, { count: warmupSentExact }, { count: warmupRecExact }] = await Promise.all([
          supabase
            .from('email_messages')
            .select('*', { count: 'exact', head: true })
            .eq('email_account_id', acc.id)
            .eq('status', 'sent')
            .gte('sent_at', todayIso),
          supabase
            .from('warmup_messages')
            .select('*', { count: 'exact', head: true })
            .eq('from_account_id', acc.id)
            .gte('sent_at', todayIso),
          supabase
            .from('warmup_messages')
            .select('*', { count: 'exact', head: true })
            .eq('to_account_id', acc.id)
            .eq('status', 'replied')
            .gte('replied_at', todayIso),
        ]);
        sentCount = sentExact || 0;
        warmupSentCount = warmupSentExact || 0;
        warmupReceivedCount = warmupRecExact || 0;
      }
    } catch {
      sentCount = 0;
      warmupSentCount = 0;
      warmupReceivedCount = 0;
    }

    const limit = acc.daily_limit || 18;
    return {
      ...acc,
      sent_today: sentCount,
      remaining_today: Math.max(0, limit - sentCount),
      warmup_sent_today: warmupSentCount,
      warmup_received_today: warmupReceivedCount,
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
    const normalizedEmail = (account.email_address || '').toLowerCase().trim();
    const payload = {
      ...defaultFields,
      ...cleanAccount,
      email_address: normalizedEmail,
      updated_at: new Date().toISOString(),
    };


    // 1. If an existing account id is provided, update by primary key directly
    if (account.id) {
      try {
        const { data: updated, error: updateErr } = await supabase
          .from('email_accounts')
          .update(payload)
          .eq('id', account.id)
          .select('*')
          .maybeSingle();
        if (!updateErr && updated) {
          if (updated.group_id) {
            try {
              updated.group = await this.getAccountGroup(updated.group_id);
            } catch {
              updated.group = null;
            }
          }
          return updated;
        }
      } catch {
        // Fallback to upsert below
      }
    }

    // 2. Multi-account schema upsert (user_id, email_address)
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
      if (error && !account.id) {
        throw new Error(error.message);
      }
    } catch (err: any) {
      if (!account.id) throw err;
    }

    // 3. Fallback upsert by id if account.id is provided
    if (account.id) {
      const { data: idData, error: idErr } = await supabase
        .from('email_accounts')
        .upsert(payload, { onConflict: 'id' })
        .select('*')
        .single();
      if (!idErr && idData) {
        if (idData.group_id) {
          try {
            idData.group = await this.getAccountGroup(idData.group_id);
          } catch {
            idData.group = null;
          }
        }
        return idData;
      }
      if (idErr) {
        throw new Error(idErr.message);
      }
    }

    throw new Error('Failed to upsert email account');
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
        const matchesUser = !userId || acc.user_id === userId;
        const matchesId = acc.id === identifier;
        const matchesEmail = acc.email_address?.toLowerCase() === identifier.toLowerCase();
        const matchesProvider = acc.provider === identifier;
        const matchesKey = key.includes(identifier);
        if (matchesUser && (matchesId || matchesEmail || matchesProvider || matchesKey)) {
          mockDb.emailAccounts.delete(key);
        }
      }
      return;
    }

    const supabase = createAdminClient();
    if (identifier.includes('-') && identifier.length === 36) {
      // Unlink messages referencing this account before delete
      try {
        await supabase.from('email_messages').update({ email_account_id: null }).eq('email_account_id', identifier);
      } catch {
        // Ignore if error
      }

      // Delete from warmup_messages if table exists
      try {
        await supabase.from('warmup_messages').delete().or(`from_account_id.eq.${identifier},to_account_id.eq.${identifier}`);
      } catch {
        // Ignore if table does not exist
      }

      const { error } = await supabase.from('email_accounts').delete().eq('id', identifier);
      if (error) {
        console.error('Failed to delete email account by id:', error);
        throw new Error(error.message);
      }
    } else if (identifier.includes('@')) {
      const normalizedEmail = identifier.toLowerCase().trim();
      const { data: found } = await supabase.from('email_accounts').select('id').eq('email_address', normalizedEmail).maybeSingle();
      if (found?.id) {
        try {
          await supabase.from('email_messages').update({ email_account_id: null }).eq('email_account_id', found.id);
        } catch {}
      }

      const { error } = await supabase.from('email_accounts').delete().eq('email_address', normalizedEmail);
      if (error) {
        console.error('Failed to delete email account by email:', error);
        throw new Error(error.message);
      }
    } else {
      let query = supabase.from('email_accounts').delete().eq('provider', identifier);
      if (userId) {
        query = query.eq('user_id', userId);
      }
      const { error } = await query;
      if (error) {
        console.error('Failed to delete email account by provider:', error);
        throw new Error(error.message);
      }
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
    const messages = await this.getMessages({ campaignId, status: 'sent', limit: 1000, select: 'id, status, sent_at' });
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

    // Filter by campaign's assigned group or single inbox if specified
    let candidateAccounts = accounts;
    if (campaign.account_group_id) {
      const inGroup = accounts.filter((a) => a.group_id === campaign.account_group_id);
      if (inGroup.length > 0) {
        candidateAccounts = inGroup;
      } else {
        candidateAccounts = accounts;
      }
    } else if (campaign.email_account_id) {
      const specificAccount = accounts.find((a) => a.id === campaign.email_account_id);
      if (specificAccount) {
        candidateAccounts = [specificAccount];
      } else {
        return {
          status: 'no_accounts',
          error: `Assigned inbox (${campaign.email_account_id}) is not active or connected.`,
        };
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
    const accounts = await this.getEmailAccounts(userId).catch(() => []);
    const ownEmails = new Set(accounts.map((a) => a.email_address.toLowerCase().trim()));

    if (!isLiveSupabase()) {
      return Array.from(mockDb.replyEvents.values())
        .filter(
          (r) =>
            r.user_id === userId &&
            !isMailerDaemonOrBounce(r.sender_email, r.classification_summary) &&
            !ownEmails.has(r.sender_email.toLowerCase())
        )
        .map((r) => {
          const msg = r.email_message_id ? mockDb.emailMessages.get(r.email_message_id) : undefined;
          const cl = msg?.campaign_lead_id ? mockDb.campaignLeads.get(msg.campaign_lead_id) : undefined;
          const lead = cl?.lead_id ? mockDb.leads.get(cl.lead_id) : undefined;
          const campaign = cl?.campaign_id ? mockDb.campaigns.get(cl.campaign_id) : undefined;
          const account = msg?.email_account_id ? mockDb.emailAccounts.get(msg.email_account_id) : undefined;
          const leadName = [lead?.first_name, lead?.last_name].filter(Boolean).join(' ').trim();

          return {
            ...r,
            lead_name: leadName || undefined,
            lead_company: lead?.company || undefined,
            lead_email: lead?.email || undefined,
            campaign_name: campaign?.name || undefined,
            campaign_id: campaign?.id || undefined,
            receiving_account: account?.email_address || undefined,
            email_subject: msg?.subject || undefined,
          };
        });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('reply_events')
      .select(`
        *,
        email_messages (
          id,
          subject,
          email_accounts (id, email_address),
          campaign_leads (
            leads (id, company, first_name, last_name, email, job_title),
            campaigns (id, name)
          )
        )
      `)
      .eq('user_id', userId)
      .not('sender_email', 'ilike', '%mailer-daemon%')
      .not('sender_email', 'ilike', '%mail-daemon%')
      .not('sender_email', 'ilike', '%postmaster%')
      .order('received_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || [])
      .filter((r) => !isMailerDaemonOrBounce(r.sender_email, r.classification_summary) && !ownEmails.has(r.sender_email.toLowerCase()))
      .map((r: any) => {
        const msg = r.email_messages;
        const lead = msg?.campaign_leads?.leads;
        const campaign = msg?.campaign_leads?.campaigns;
        const account = msg?.email_accounts;
        const leadName = [lead?.first_name, lead?.last_name].filter(Boolean).join(' ').trim();
        const { email_messages, ...rest } = r;

        return {
          ...rest,
          lead_name: leadName || undefined,
          lead_company: lead?.company || undefined,
          lead_email: lead?.email || undefined,
          campaign_name: campaign?.name || undefined,
          campaign_id: campaign?.id || undefined,
          receiving_account: account?.email_address || undefined,
          email_subject: msg?.subject || undefined,
        };
      });
  },

  async getPaginatedReplies(
    userId: string,
    options?: { limit?: number; offset?: number; classification?: string }
  ): Promise<{ replies: ReplyEvent[]; total: number }> {
    const accounts = await this.getEmailAccounts(userId).catch(() => []);
    const ownEmails = new Set(accounts.map((a) => a.email_address.toLowerCase().trim()));

    if (!isLiveSupabase()) {
      let all = Array.from(mockDb.replyEvents.values()).filter(
        (r) =>
          r.user_id === userId &&
          !isMailerDaemonOrBounce(r.sender_email, r.classification_summary) &&
          !ownEmails.has(r.sender_email.toLowerCase())
      );
      if (options?.classification) {
        all = all.filter((r) => r.classification === options.classification);
      }
      const total = all.length;
      all.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
      const offset = options?.offset || 0;
      const limit = options?.limit ?? 50;
      const sliced = all.slice(offset, offset + limit).map((r) => {
        const msg = r.email_message_id ? mockDb.emailMessages.get(r.email_message_id) : undefined;
        const cl = msg?.campaign_lead_id ? mockDb.campaignLeads.get(msg.campaign_lead_id) : undefined;
        const lead = cl?.lead_id ? mockDb.leads.get(cl.lead_id) : undefined;
        const campaign = cl?.campaign_id ? mockDb.campaigns.get(cl.campaign_id) : undefined;
        const account = msg?.email_account_id ? mockDb.emailAccounts.get(msg.email_account_id) : undefined;
        const leadName = [lead?.first_name, lead?.last_name].filter(Boolean).join(' ').trim();

        return {
          ...r,
          lead_name: leadName || undefined,
          lead_company: lead?.company || undefined,
          lead_email: lead?.email || undefined,
          campaign_name: campaign?.name || undefined,
          campaign_id: campaign?.id || undefined,
          receiving_account: account?.email_address || undefined,
          email_subject: msg?.subject || undefined,
        };
      });
      return { replies: sliced, total };
    }

    const supabase = createAdminClient();
    let query = supabase
      .from('reply_events')
      .select(`
        *,
        email_messages (
          id,
          subject,
          email_accounts (id, email_address),
          campaign_leads (
            leads (id, company, first_name, last_name, email, job_title),
            campaigns (id, name)
          )
        )
      `, { count: 'exact' })
      .eq('user_id', userId)
      .not('sender_email', 'ilike', '%mailer-daemon%')
      .not('sender_email', 'ilike', '%mail-daemon%')
      .not('sender_email', 'ilike', '%postmaster%')
      .not('sender_email', 'ilike', '%noreply%')
      .not('classification_summary', 'ilike', '%delivery failure%')
      .not('classification_summary', 'ilike', '%domain could not be found%')
      .not('classification_summary', 'ilike', '%undeliverable%')
      .not('classification_summary', 'ilike', '%outbound sales pitch%')
      .not('classification_summary', 'ilike', '%draft rather than a reply%');

    if (options?.classification) {
      query = query.eq('classification', options.classification);
    }
    const offset = options?.offset || 0;
    const limit = options?.limit ?? 50;
    const { data, count, error } = await query.order('received_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);

    const filtered = (data || []).filter(
      (r) => !isMailerDaemonOrBounce(r.sender_email, r.classification_summary) && !ownEmails.has(r.sender_email.toLowerCase())
    );
    const effectiveTotal = Math.max(0, (count ?? 0) - ((data?.length ?? 0) - filtered.length));

    const mapped: ReplyEvent[] = filtered.map((r: any) => {
      const msg = r.email_messages;
      const lead = msg?.campaign_leads?.leads;
      const campaign = msg?.campaign_leads?.campaigns;
      const account = msg?.email_accounts;
      const leadName = [lead?.first_name, lead?.last_name].filter(Boolean).join(' ').trim();
      const { email_messages, ...rest } = r;

      return {
        ...rest,
        lead_name: leadName || undefined,
        lead_company: lead?.company || undefined,
        lead_email: lead?.email || undefined,
        campaign_name: campaign?.name || undefined,
        campaign_id: campaign?.id || undefined,
        receiving_account: account?.email_address || undefined,
        email_subject: msg?.subject || undefined,
      };
    });

    return { replies: mapped, total: effectiveTotal };
  },

  async recordReply(event: Omit<ReplyEvent, 'id' | 'created_at'>): Promise<ReplyEvent> {
    if (isMailerDaemonOrBounce(event.sender_email, event.classification_summary)) {
      return {
        id: crypto.randomUUID(),
        ...event,
        created_at: new Date().toISOString(),
      };
    }
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

  async deleteReply(id: string, userId?: string): Promise<boolean> {
    if (!isLiveSupabase()) {
      const reply = mockDb.replyEvents.get(id);
      if (reply && (!userId || reply.user_id === userId)) {
        mockDb.replyEvents.delete(id);
        return true;
      }
      return false;
    }

    const supabase = createAdminClient();
    let query = supabase.from('reply_events').delete().eq('id', id);
    if (userId) query = query.eq('user_id', userId);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return true;
  },

  async purgeInvalidReplies(userId: string): Promise<number> {
    let purged = 0;
    const accounts = await this.getEmailAccounts(userId).catch(() => []);
    const ownEmails = accounts.map((a) => a.email_address.toLowerCase().trim());
    const ownEmailSet = new Set(ownEmails);

    if (!isLiveSupabase()) {
      for (const [id, r] of Array.from(mockDb.replyEvents.entries())) {
        if (
          r.user_id === userId &&
          (isMailerDaemonOrBounce(r.sender_email, r.classification_summary) || ownEmailSet.has(r.sender_email.toLowerCase()))
        ) {
          mockDb.replyEvents.delete(id);
          purged++;
        }
      }
      return purged;
    }

    try {
      const supabase = createAdminClient();
      // 1. Delete mailer-daemon, bounces, and outbound pitch replies
      await supabase
        .from('reply_events')
        .delete()
        .eq('user_id', userId)
        .or('sender_email.ilike.%mailer-daemon%,sender_email.ilike.%mail-daemon%,sender_email.ilike.%postmaster%,classification_summary.ilike.%delivery failure%,classification_summary.ilike.%domain could not be found%,classification_summary.ilike.%outbound sales pitch%,classification_summary.ilike.%draft rather than a reply%');

      // 2. Delete any self-replies from user's own email accounts
      if (ownEmails.length > 0) {
        const { data: selfReplies } = await supabase
          .from('reply_events')
          .select('id, email_message_id, sender_email')
          .eq('user_id', userId)
          .in('sender_email', ownEmails);

        if (selfReplies && selfReplies.length > 0) {
          const selfReplyIds = selfReplies.map((r) => r.id);
          const messageIds = selfReplies.map((r) => r.email_message_id).filter(Boolean) as string[];

          await supabase.from('reply_events').delete().in('id', selfReplyIds);
          purged += selfReplies.length;

          // Revert any falsely marked leads back to contacted
          if (messageIds.length > 0) {
            const { data: messages } = await supabase
              .from('email_messages')
              .select('id, campaign_leads (lead_id)')
              .in('id', messageIds);

            const leadIds = (messages || [])
              .map((m: any) => m.campaign_leads?.lead_id)
              .filter(Boolean);

            if (leadIds.length > 0) {
              await supabase
                .from('leads')
                .update({ status: 'contacted' })
                .in('id', leadIds)
                .eq('status', 'replied');
            }
          }
        }
      }
    } catch (err) {
      console.warn('purgeInvalidReplies caught:', err);
    }
    return purged;
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
    // 1. Fetch account stats and account groups in parallel with core metric counts
    const accountStatsPromise = this.getAccountDailyStats(userId);
    const accountGroupsPromise = this.getAccountGroups(userId);

    let totalLeads = 0;
    let eligibleLeads = 0;
    let bounceCount = 0;
    let campaignsCount = 0;
    let activeCampaignsCount = 0;
    let suppressionCount = 0;
    let draftsGenerated = 0;
    let emailsSent = 0;
    let repliesReceived = 0;
    let positiveReplies = 0;
    let failedJobs = 0;

    if (!isLiveSupabase()) {
      // In-memory mockDb fast path: direct iteration without full object cloning or N+1 joins
      for (const l of mockDb.leads.values()) {
        if (l.user_id === userId) {
          totalLeads++;
          if (l.status === 'active') eligibleLeads++;
          else if (l.status === 'bounced') bounceCount++;
        }
      }

      const userCampaignIds = new Set<string>();
      for (const c of mockDb.campaigns.values()) {
        if (c.user_id === userId) {
          campaignsCount++;
          userCampaignIds.add(c.id);
          if (c.status === 'active') activeCampaignsCount++;
        }
      }

      for (const m of mockDb.emailMessages.values()) {
        const cl = mockDb.campaignLeads.get(m.campaign_lead_id);
        if (!cl || userCampaignIds.has(cl.campaign_id)) {
          if (m.status === 'draft') draftsGenerated++;
          else if (m.status === 'sent') emailsSent++;
        }
      }

      for (const r of mockDb.replyEvents.values()) {
        if (r.user_id === userId && !isMailerDaemonOrBounce(r.sender_email, r.classification_summary)) {
          repliesReceived++;
          if (r.classification === 'positive') positiveReplies++;
        }
      }

      for (const s of mockDb.suppressions.values()) {
        if (s.user_id === userId) suppressionCount++;
      }

      for (const j of mockDb.jobQueue.values()) {
        if (j.status === 'failed' || j.status === 'dead') failedJobs++;
      }
    } else {
      const supabase = createAdminClient();

      // Primary fast path: Single round-trip PostgreSQL RPC aggregation
      let rpcSucceeded = false;
      try {
        const { data: rpcCounts, error: rpcError } = await (supabase as any).rpc('get_dashboard_counts', {
          p_user_id: userId,
        });
        const counts = rpcCounts as Record<string, unknown> | null;
        if (!rpcError && counts && typeof counts === 'object') {
          totalLeads = Number(counts.totalLeads ?? 0);
          eligibleLeads = Number(counts.eligibleLeads ?? 0);
          bounceCount = Number(counts.bounceCount ?? 0);
          campaignsCount = Number(counts.campaignsCount ?? 0);
          activeCampaignsCount = Number(counts.activeCampaignsCount ?? 0);
          suppressionCount = Number(counts.suppressionCount ?? 0);
          draftsGenerated = Number(counts.draftsGenerated ?? 0);
          emailsSent = Number(counts.emailsSent ?? 0);
          repliesReceived = Number(counts.repliesReceived ?? 0);
          positiveReplies = Number(counts.positiveReplies ?? 0);
          failedJobs = Number(counts.failedJobs ?? 0);
          rpcSucceeded = true;
        }
      } catch {
        rpcSucceeded = false;
      }

      // Secondary fallback: Parallelized database count/projection queries without fetching full entities
      if (!rpcSucceeded) {
        const [
          leadsResult,
          campaignsResult,
          suppressionsCountResult,
          repliesResult,
          failedJobsResult,
          draftsCountResult,
          sentCountResult,
        ] = await Promise.all([
          // Only project status column for leads to count statuses
          supabase.from('leads').select('status').eq('user_id', userId),
          // Only project id and status for campaigns
          supabase.from('campaigns').select('id, status').eq('user_id', userId),
          // Head count for suppressions
          supabase.from('suppressions').select('*', { count: 'exact', head: true }).eq('user_id', userId),
          // Projection for replies
          supabase
            .from('reply_events')
            .select('classification, sender_email, classification_summary')
            .eq('user_id', userId)
            .not('sender_email', 'ilike', '%mailer-daemon%')
            .not('sender_email', 'ilike', '%mail-daemon%')
            .not('sender_email', 'ilike', '%postmaster%'),
          // Head count for failed jobs
          supabase.from('job_queue').select('*', { count: 'exact', head: true }).in('status', ['failed', 'dead']),
          // Head count for drafts
          supabase.from('email_messages').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
          // Head count for sent emails
          supabase.from('email_messages').select('*', { count: 'exact', head: true }).eq('status', 'sent'),
        ]);

        const leadRows = (leadsResult.data || []) as Array<{ status: string }>;
        totalLeads = leadRows.length;
        eligibleLeads = leadRows.filter((l) => l.status === 'active').length;
        bounceCount = leadRows.filter((l) => l.status === 'bounced').length;

        const campaignRows = (campaignsResult.data || []) as Array<{ id: string; status: string }>;
        campaignsCount = campaignRows.length;
        activeCampaignsCount = campaignRows.filter((c) => c.status === 'active').length;

        suppressionCount = suppressionsCountResult.count || 0;

        const replyRows = ((repliesResult.data || []) as Array<{
          sender_email: string;
          classification_summary?: string | null;
          classification: string;
        }>).filter((r) => !isMailerDaemonOrBounce(r.sender_email, r.classification_summary));
        repliesReceived = replyRows.length;
        positiveReplies = replyRows.filter((r) => r.classification === 'positive').length;

        failedJobs = failedJobsResult.count || 0;
        draftsGenerated = draftsCountResult.count || 0;
        emailsSent = sentCountResult.count || 0;
      }
    }

    const [accountStats, accountGroups] = await Promise.all([
      accountStatsPromise,
      accountGroupsPromise,
    ]);

    return {
      totalLeads,
      eligibleLeads,
      draftsGenerated,
      emailsSent,
      repliesReceived,
      positiveReplies,
      bounceCount,
      failedJobs,
      campaignsCount,
      activeCampaignsCount,
      suppressionCount,
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

