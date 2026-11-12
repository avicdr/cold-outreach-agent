import crypto from 'crypto';
import { isLiveSupabase, dbService } from '@/lib/db-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { mockDb } from '@/lib/supabase/mock-db';
import {
  InstagramAccount,
  InstagramLeadGroup,
  InstagramLead,
  InstagramCampaign,
  InstagramCampaignLead,
  InstagramMessage,
  InstagramReplyEvent,
  SendingConfig,
} from '@/types/database';
import {
  normalizeInstagramHandle,
  formatInstagramHandle,
  buildInstagramUrl,
} from './handles';
import {
  calculateStaggeredScheduleWithAccounts,
  getTimezoneParts,
  createDateInTimezone,
} from '@/lib/scheduler';

function getTodayStartUtc(timezone: string): Date {
  const now = new Date();
  const parts = getTimezoneParts(now, timezone);
  return createDateInTimezone(parts.year, parts.month, parts.day, 0, 0, 0, timezone);
}

export const instagramDb = {
  // ==========================================
  // Instagram Accounts
  // ==========================================
  async getInstagramAccounts(
    userId: string,
    filters?: { status?: string }
  ): Promise<InstagramAccount[]> {
    if (!isLiveSupabase()) {
      let list = Array.from(mockDb.instagramAccounts.values()).filter((a) => a.user_id === userId);
      if (filters?.status) list = list.filter((a) => a.status === filters.status);
      return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    const supabase = createAdminClient();
    let query = supabase
      .from('instagram_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getInstagramAccount(id: string): Promise<InstagramAccount | null> {
    if (!isLiveSupabase()) {
      return mockDb.instagramAccounts.get(id) || null;
    }
    const supabase = createAdminClient();
    const { data } = await supabase.from('instagram_accounts').select('*').eq('id', id).maybeSingle();
    return data || null;
  },

  async upsertInstagramAccount(
    input: Partial<InstagramAccount> & { user_id: string; username: string }
  ): Promise<InstagramAccount> {
    const cleanUsername = normalizeInstagramHandle(input.username);
    const now = new Date().toISOString();

    if (!isLiveSupabase()) {
      const existing = Array.from(mockDb.instagramAccounts.values()).find(
        (a) => a.user_id === input.user_id && a.username === cleanUsername
      );
      const record: InstagramAccount = {
        id: existing?.id || crypto.randomUUID(),
        user_id: input.user_id,
        username: cleanUsername,
        display_name: input.display_name ?? existing?.display_name ?? cleanUsername,
        ig_user_id: input.ig_user_id ?? existing?.ig_user_id ?? null,
        auth_method: input.auth_method || existing?.auth_method || 'session',
        encrypted_session_id: input.encrypted_session_id ?? existing?.encrypted_session_id ?? null,
        encrypted_cookies_json: input.encrypted_cookies_json ?? existing?.encrypted_cookies_json ?? null,
        encrypted_password: input.encrypted_password ?? existing?.encrypted_password ?? null,
        encrypted_access_token: input.encrypted_access_token ?? existing?.encrypted_access_token ?? null,
        daily_limit: input.daily_limit ?? existing?.daily_limit ?? 25,
        min_interval_minutes: input.min_interval_minutes ?? existing?.min_interval_minutes ?? 10,
        status: input.status || existing?.status || 'active',
        last_error: input.last_error !== undefined ? input.last_error : existing?.last_error ?? null,
        last_sent_at: input.last_sent_at ?? existing?.last_sent_at ?? null,
        last_sync_at: input.last_sync_at ?? now,
        connected_at: existing?.connected_at || now,
        created_at: existing?.created_at || now,
        updated_at: now,
      };
      mockDb.instagramAccounts.set(record.id, record);
      return record;
    }

    const supabase = createAdminClient();
    const payload = {
      user_id: input.user_id,
      username: cleanUsername,
      display_name: input.display_name ?? cleanUsername,
      ig_user_id: input.ig_user_id ?? null,
      auth_method: input.auth_method || 'session',
      encrypted_session_id: input.encrypted_session_id ?? null,
      encrypted_cookies_json: input.encrypted_cookies_json ?? null,
      encrypted_password: input.encrypted_password ?? null,
      encrypted_access_token: input.encrypted_access_token ?? null,
      daily_limit: input.daily_limit ?? 25,
      min_interval_minutes: input.min_interval_minutes ?? 10,
      status: input.status || 'active',
      last_error: input.last_error ?? null,
      last_sync_at: input.last_sync_at ?? now,
      connected_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from('instagram_accounts')
      .upsert(payload, { onConflict: 'user_id,username' })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async updateInstagramAccount(id: string, updates: Partial<InstagramAccount>): Promise<InstagramAccount> {
    const now = new Date().toISOString();
    if (!isLiveSupabase()) {
      const existing = mockDb.instagramAccounts.get(id);
      if (!existing) throw new Error('Instagram account not found');
      const updated = { ...existing, ...updates, updated_at: now };
      mockDb.instagramAccounts.set(id, updated);
      return updated;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('instagram_accounts')
      .update({ ...updates, updated_at: now })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async deleteInstagramAccount(id: string): Promise<void> {
    if (!isLiveSupabase()) {
      mockDb.instagramAccounts.delete(id);
      return;
    }
    const supabase = createAdminClient();
    const { error } = await supabase.from('instagram_accounts').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async getInstagramAccountSentTodayCount(accountId: string, timezone = 'UTC'): Promise<number> {
    const dayStart = getTodayStartUtc(timezone);
    if (!isLiveSupabase()) {
      return Array.from(mockDb.instagramMessages.values()).filter(
        (m) =>
          m.instagram_account_id === accountId &&
          m.status === 'sent' &&
          m.sent_at &&
          new Date(m.sent_at) >= dayStart
      ).length;
    }

    const supabase = createAdminClient();
    const { count } = await supabase
      .from('instagram_messages')
      .select('id', { count: 'exact', head: true })
      .eq('instagram_account_id', accountId)
      .eq('status', 'sent')
      .gte('sent_at', dayStart.toISOString());
    return count || 0;
  },

  async getInstagramAccountDailyStats(userId: string) {
    const accounts = await this.getInstagramAccounts(userId);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const sentCounts = new Map<string, number>();
    if (!isLiveSupabase()) {
      for (const m of mockDb.instagramMessages.values()) {
        if (m.status === 'sent' && m.sent_at && m.instagram_account_id && new Date(m.sent_at) >= todayStart) {
          sentCounts.set(m.instagram_account_id, (sentCounts.get(m.instagram_account_id) || 0) + 1);
        }
      }
    } else if (accounts.length > 0) {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('instagram_messages')
        .select('instagram_account_id')
        .in(
          'instagram_account_id',
          accounts.map((a) => a.id)
        )
        .eq('status', 'sent')
        .gte('sent_at', todayStart.toISOString());
      for (const row of data || []) {
        if (row.instagram_account_id) {
          sentCounts.set(row.instagram_account_id, (sentCounts.get(row.instagram_account_id) || 0) + 1);
        }
      }
    }

    const enriched = accounts.map((acc) => {
      const sentToday = sentCounts.get(acc.id) || 0;
      const remainingToday = Math.max(0, acc.daily_limit - sentToday);
      return {
        ...acc,
        sent_today: sentToday,
        remaining_today: remainingToday,
      };
    });

    const activeAccounts = enriched.filter((a) => a.status === 'active');
    const dailyCapacity = activeAccounts.reduce((sum, a) => sum + a.daily_limit, 0);
    const sentToday = activeAccounts.reduce((sum, a) => sum + (a.sent_today || 0), 0);

    return {
      totalAccounts: enriched.length,
      activeAccounts: activeAccounts.length,
      dailyCapacity,
      sentToday,
      remainingToday: Math.max(0, dailyCapacity - sentToday),
      accounts: enriched,
    };
  },

  // ==========================================
  // Instagram Lead Groups
  // ==========================================
  async getInstagramLeadGroups(userId: string): Promise<InstagramLeadGroup[]> {
    if (!isLiveSupabase()) {
      const groups = Array.from(mockDb.instagramLeadGroups.values()).filter((g) => g.user_id === userId);
      return groups.map((g) => ({
        ...g,
        leads_count: Array.from(mockDb.instagramLeads.values()).filter((l) => l.group_id === g.id).length,
      }));
    }

    const supabase = createAdminClient();
    const [{ data: groups, error }, { data: leads }] = await Promise.all([
      supabase.from('instagram_lead_groups').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('instagram_leads').select('group_id').eq('user_id', userId),
    ]);
    if (error) throw new Error(error.message);

    const counts = new Map<string, number>();
    for (const l of leads || []) {
      if (l.group_id) counts.set(l.group_id, (counts.get(l.group_id) || 0) + 1);
    }

    return (groups || []).map((g) => ({
      ...g,
      leads_count: counts.get(g.id) || 0,
    }));
  },

  async getInstagramLeadGroup(id: string): Promise<InstagramLeadGroup | null> {
    if (!isLiveSupabase()) {
      return mockDb.instagramLeadGroups.get(id) || null;
    }
    const supabase = createAdminClient();
    const { data } = await supabase.from('instagram_lead_groups').select('*').eq('id', id).maybeSingle();
    return data || null;
  },

  async createInstagramLeadGroup(
    userId: string,
    input: { name: string; description?: string }
  ): Promise<InstagramLeadGroup> {
    const now = new Date().toISOString();
    if (!isLiveSupabase()) {
      const existing = Array.from(mockDb.instagramLeadGroups.values()).find(
        (g) => g.user_id === userId && g.name.toLowerCase() === input.name.trim().toLowerCase()
      );
      if (existing) return existing;
      const record: InstagramLeadGroup = {
        id: crypto.randomUUID(),
        user_id: userId,
        name: input.name.trim(),
        description: (input.description || '').trim(),
        created_at: now,
        updated_at: now,
        leads_count: 0,
      };
      mockDb.instagramLeadGroups.set(record.id, record);
      return record;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('instagram_lead_groups')
      .upsert(
        {
          user_id: userId,
          name: input.name.trim(),
          description: (input.description || '').trim(),
          updated_at: now,
        },
        { onConflict: 'user_id,name' }
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async deleteInstagramLeadGroup(id: string): Promise<void> {
    if (!isLiveSupabase()) {
      mockDb.instagramLeadGroups.delete(id);
      for (const lead of mockDb.instagramLeads.values()) {
        if (lead.group_id === id) {
          lead.group_id = null;
        }
      }
      return;
    }
    const supabase = createAdminClient();
    const { error } = await supabase.from('instagram_lead_groups').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ==========================================
  // Instagram Leads
  // ==========================================
  async getExistingNormalizedHandles(userId: string): Promise<Set<string>> {
    if (!isLiveSupabase()) {
      const set = new Set<string>();
      for (const l of mockDb.instagramLeads.values()) {
        if (l.user_id === userId && l.normalized_handle) {
          set.add(l.normalized_handle);
        }
      }
      return set;
    }

    const supabase = createAdminClient();
    const { data } = await supabase
      .from('instagram_leads')
      .select('normalized_handle')
      .eq('user_id', userId)
      .neq('normalized_handle', '');
    return new Set((data || []).map((r) => r.normalized_handle).filter(Boolean));
  },

  async getInstagramLeads(
    userId: string,
    filters?: {
      status?: string;
      search?: string;
      groupId?: string;
      handleState?: 'all' | 'has_handle' | 'missing_handle';
      limit?: number;
      offset?: number;
    }
  ): Promise<{ leads: InstagramLead[]; total: number }> {
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    if (!isLiveSupabase()) {
      let list = Array.from(mockDb.instagramLeads.values()).filter((l) => l.user_id === userId);
      if (filters?.status) list = list.filter((l) => l.status === filters.status);
      if (filters?.groupId) {
        if (filters.groupId === 'ungrouped') list = list.filter((l) => !l.group_id);
        else list = list.filter((l) => l.group_id === filters.groupId);
      }
      if (filters?.handleState === 'has_handle') {
        list = list.filter((l) => Boolean(l.normalized_handle));
      } else if (filters?.handleState === 'missing_handle') {
        list = list.filter((l) => !l.normalized_handle);
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        list = list.filter(
          (l) =>
            l.instagram_handle.toLowerCase().includes(q) ||
            l.normalized_handle.toLowerCase().includes(q) ||
            l.full_name.toLowerCase().includes(q) ||
            l.company.toLowerCase().includes(q) ||
            l.niche.toLowerCase().includes(q) ||
            l.email.toLowerCase().includes(q)
        );
      }
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const groups = new Map(
        Array.from(mockDb.instagramLeadGroups.values()).map((g) => [g.id, g])
      );
      const enriched = list.slice(offset, offset + limit).map((l) => ({
        ...l,
        lead_group: l.group_id ? groups.get(l.group_id) || null : null,
      }));
      return { leads: enriched, total: list.length };
    }

    const supabase = createAdminClient();
    let query = supabase
      .from('instagram_leads')
      .select('*, lead_group:instagram_lead_groups(*)', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.groupId) {
      if (filters.groupId === 'ungrouped') query = query.is('group_id', null);
      else query = query.eq('group_id', filters.groupId);
    }
    if (filters?.handleState === 'has_handle') {
      query = query.neq('normalized_handle', '');
    } else if (filters?.handleState === 'missing_handle') {
      query = query.or('normalized_handle.is.null,normalized_handle.eq.');
    }
    if (filters?.search) {
      const q = filters.search.replace(/[%_]/g, '\\$&');
      query = query.or(
        `instagram_handle.ilike.%${q}%,full_name.ilike.%${q}%,company.ilike.%${q}%,niche.ilike.%${q}%,email.ilike.%${q}%`
      );
    }

    query = query.range(offset, offset + limit - 1);
    const { data, count, error } = await query;
    if (error) throw new Error(error.message);
    return { leads: data || [], total: count || 0 };
  },

  async getInstagramLead(id: string): Promise<InstagramLead | null> {
    if (!isLiveSupabase()) {
      return mockDb.instagramLeads.get(id) || null;
    }
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('instagram_leads')
      .select('*, lead_group:instagram_lead_groups(*)')
      .eq('id', id)
      .maybeSingle();
    return data || null;
  },

  async insertInstagramLeads(
    userId: string,
    leads: Array<Partial<InstagramLead>>
  ): Promise<{ inserted: number; insertedLeads: InstagramLead[]; errors: string[] }> {
    const now = new Date().toISOString();
    const insertedLeads: InstagramLead[] = [];
    const errors: string[] = [];

    if (!isLiveSupabase()) {
      const existingHandles = await this.getExistingNormalizedHandles(userId);
      for (const item of leads) {
        const normalized = normalizeInstagramHandle(item.normalized_handle || item.instagram_handle || item.instagram_url);
        if (normalized && existingHandles.has(normalized)) {
          errors.push(`Instagram handle @${normalized} already exists`);
          continue;
        }
        if (normalized) existingHandles.add(normalized);

        const record: InstagramLead = {
          id: crypto.randomUUID(),
          user_id: userId,
          normalized_handle: normalized,
          instagram_handle: normalized ? formatInstagramHandle(normalized) : '',
          instagram_url: item.instagram_url || (normalized ? buildInstagramUrl(normalized) : ''),
          ig_user_id: item.ig_user_id || null,
          full_name: item.full_name || [item.first_name, item.last_name].filter(Boolean).join(' '),
          first_name: item.first_name || '',
          last_name: item.last_name || '',
          company: item.company || '',
          niche: item.niche || '',
          bio: item.bio || '',
          followers_count: item.followers_count ?? null,
          website: item.website || '',
          city: item.city || '',
          country: item.country || '',
          email: item.email || '',
          phone: item.phone || '',
          personalization_hook: item.personalization_hook || '',
          notes: item.notes || '',
          custom_fields: item.custom_fields || {},
          group_id: item.group_id || null,
          source_email_lead_id: item.source_email_lead_id || null,
          source_import: item.source_import || 'manual',
          status: item.status || 'active',
          created_at: now,
          updated_at: now,
        };
        mockDb.instagramLeads.set(record.id, record);
        insertedLeads.push(record);
      }
      return { inserted: insertedLeads.length, insertedLeads, errors };
    }

    const supabase = createAdminClient();
    const rowsToInsert = leads.map((item) => {
      const normalized = normalizeInstagramHandle(item.normalized_handle || item.instagram_handle || item.instagram_url);
      return {
        user_id: userId,
        normalized_handle: normalized,
        instagram_handle: normalized ? formatInstagramHandle(normalized) : '',
        instagram_url: item.instagram_url || (normalized ? buildInstagramUrl(normalized) : ''),
        ig_user_id: item.ig_user_id || null,
        full_name: item.full_name || [item.first_name, item.last_name].filter(Boolean).join(' '),
        first_name: item.first_name || '',
        last_name: item.last_name || '',
        company: item.company || '',
        niche: item.niche || '',
        bio: item.bio || '',
        followers_count: item.followers_count ?? null,
        website: item.website || '',
        city: item.city || '',
        country: item.country || '',
        email: item.email || '',
        phone: item.phone || '',
        personalization_hook: item.personalization_hook || '',
        notes: item.notes || '',
        custom_fields: item.custom_fields || {},
        group_id: item.group_id || null,
        source_email_lead_id: item.source_email_lead_id || null,
        source_import: item.source_import || 'manual',
        status: item.status || 'active',
        created_at: now,
        updated_at: now,
      };
    });

    // Insert in batches of 100
    for (let i = 0; i < rowsToInsert.length; i += 100) {
      const batch = rowsToInsert.slice(i, i + 100);
      const { data, error } = await supabase.from('instagram_leads').insert(batch).select();
      if (error) {
        // Fallback to single inserts if duplicate conflict occurred in batch
        for (const row of batch) {
          const { data: singleData, error: singleErr } = await supabase
            .from('instagram_leads')
            .insert(row)
            .select()
            .single();
          if (singleErr) {
            errors.push(singleErr.message);
          } else if (singleData) {
            insertedLeads.push(singleData);
          }
        }
      } else if (data) {
        insertedLeads.push(...data);
      }
    }

    return { inserted: insertedLeads.length, insertedLeads, errors };
  },

  async updateInstagramLead(id: string, updates: Partial<InstagramLead>): Promise<InstagramLead> {
    const now = new Date().toISOString();
    const patch: Partial<InstagramLead> = { ...updates, updated_at: now };

    if (updates.instagram_handle !== undefined || updates.normalized_handle !== undefined) {
      const normalized = normalizeInstagramHandle(updates.instagram_handle ?? updates.normalized_handle ?? '');
      patch.normalized_handle = normalized;
      patch.instagram_handle = normalized ? formatInstagramHandle(normalized) : '';
      if (!updates.instagram_url) {
        patch.instagram_url = normalized ? buildInstagramUrl(normalized) : '';
      }
    }

    if (!isLiveSupabase()) {
      const existing = mockDb.instagramLeads.get(id);
      if (!existing) throw new Error('Instagram lead not found');
      if (patch.normalized_handle) {
        const dup = Array.from(mockDb.instagramLeads.values()).find(
          (l) => l.user_id === existing.user_id && l.id !== id && l.normalized_handle === patch.normalized_handle
        );
        if (dup) throw new Error(`Handle @${patch.normalized_handle} already exists on another lead`);
      }
      const updated = { ...existing, ...patch };
      mockDb.instagramLeads.set(id, updated);
      return updated;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('instagram_leads')
      .update(patch)
      .eq('id', id)
      .select('*, lead_group:instagram_lead_groups(*)')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async deleteInstagramLead(id: string): Promise<void> {
    if (!isLiveSupabase()) {
      mockDb.instagramLeads.delete(id);
      return;
    }
    const supabase = createAdminClient();
    const { error } = await supabase.from('instagram_leads').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  /**
   * Bridges existing Email Leads (from an Email Campaign or Email Lead Group) into
   * the segregated Instagram Leads table without mutating the email leads.
   * Reuses any existing InstagramLead with the same source_email_lead_id or handle.
   */
  async importLeadsFromEmailSource(
    userId: string,
    source: { emailCampaignId?: string; emailLeadGroupId?: string; targetGroupId?: string | null }
  ): Promise<{ leads: InstagramLead[]; created: number; reused: number }> {
    let sourceLeads: any[] = [];

    if (source.emailCampaignId) {
      const campaignLeads = await dbService.getCampaignLeads(source.emailCampaignId);
      sourceLeads = campaignLeads.map((cl) => cl.lead).filter(Boolean);
    } else if (source.emailLeadGroupId) {
      const res = await dbService.getLeads(userId, { groupId: source.emailLeadGroupId, limit: 1000 });
      sourceLeads = res.leads;
    }

    if (sourceLeads.length === 0) {
      return { leads: [], created: 0, reused: 0 };
    }

    // Load existing Instagram leads to avoid creating duplicates for same source_email_lead_id
    const existingRes = await this.getInstagramLeads(userId, { limit: 5000 });
    const bySourceId = new Map<string, InstagramLead>();
    const byHandle = new Map<string, InstagramLead>();
    for (const igLead of existingRes.leads) {
      if (igLead.source_email_lead_id) bySourceId.set(igLead.source_email_lead_id, igLead);
      if (igLead.normalized_handle) byHandle.set(igLead.normalized_handle, igLead);
    }

    const resultLeads: InstagramLead[] = [];
    const toInsert: Array<Partial<InstagramLead>> = [];

    for (const emailLead of sourceLeads) {
      const existingById = bySourceId.get(emailLead.id);
      if (existingById) {
        resultLeads.push(existingById);
        continue;
      }

      // Check if email lead already had an instagram_handle in custom_fields
      const cf = emailLead.custom_fields || {};
      const candidateHandle =
        cf.instagram_handle ||
        cf.Instagram_Handle ||
        cf.ig_handle ||
        cf.instagram ||
        cf.instagram_url ||
        '';
      const normalized = normalizeInstagramHandle(String(candidateHandle || ''));
      if (normalized && byHandle.has(normalized)) {
        resultLeads.push(byHandle.get(normalized)!);
        continue;
      }

      const fullName = [emailLead.first_name, emailLead.last_name].filter(Boolean).join(' ').trim();
      toInsert.push({
        normalized_handle: normalized,
        instagram_handle: normalized ? formatInstagramHandle(normalized) : '',
        instagram_url: normalized ? buildInstagramUrl(normalized) : '',
        full_name: fullName,
        first_name: emailLead.first_name || '',
        last_name: emailLead.last_name || '',
        company: emailLead.company || '',
        niche: emailLead.category || '',
        website: emailLead.website || '',
        city: emailLead.city || '',
        country: emailLead.country || '',
        email: emailLead.email || '',
        phone: emailLead.phone || '',
        personalization_hook: emailLead.suggested_opening || emailLead.sales_angle || '',
        notes: emailLead.notes || '',
        custom_fields: emailLead.custom_fields || {},
        group_id: source.targetGroupId || null,
        source_email_lead_id: emailLead.id,
        source_import: source.emailCampaignId ? `email_campaign:${source.emailCampaignId}` : `email_group:${source.emailLeadGroupId}`,
        status: 'active',
      });
    }

    let createdCount = 0;
    if (toInsert.length > 0) {
      const insertRes = await this.insertInstagramLeads(userId, toInsert);
      createdCount = insertRes.inserted;
      resultLeads.push(...insertRes.insertedLeads);
    }

    return {
      leads: resultLeads,
      created: createdCount,
      reused: resultLeads.length - createdCount,
    };
  },

  // ==========================================
  // Instagram Campaigns
  // ==========================================
  async getInstagramCampaigns(userId: string): Promise<InstagramCampaign[]> {
    if (!isLiveSupabase()) {
      const accounts = mockDb.instagramAccounts;
      return Array.from(mockDb.instagramCampaigns.values())
        .filter((c) => c.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((c) => ({
          ...c,
          instagram_account: c.instagram_account_id ? accounts.get(c.instagram_account_id) || null : null,
        }));
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('instagram_campaigns')
      .select('*, instagram_account:instagram_accounts(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getInstagramCampaign(id: string): Promise<InstagramCampaign | null> {
    if (!isLiveSupabase()) {
      const camp = mockDb.instagramCampaigns.get(id);
      if (!camp) return null;
      return {
        ...camp,
        instagram_account: camp.instagram_account_id ? mockDb.instagramAccounts.get(camp.instagram_account_id) || null : null,
      };
    }

    const supabase = createAdminClient();
    const { data } = await supabase
      .from('instagram_campaigns')
      .select('*, instagram_account:instagram_accounts(*)')
      .eq('id', id)
      .maybeSingle();
    return data || null;
  },

  async createInstagramCampaign(
    userId: string,
    input: Partial<InstagramCampaign> & { name: string }
  ): Promise<InstagramCampaign> {
    const now = new Date().toISOString();
    const record: InstagramCampaign = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: input.name.trim(),
      status: 'draft',
      instagram_account_id: input.instagram_account_id || null,
      business_context: input.business_context || '',
      ideal_customer_profile: input.ideal_customer_profile || '',
      offer: input.offer || '',
      tone: input.tone || 'Casual, warm, conversational, zero fluff',
      call_to_action: input.call_to_action || 'Quick chat or 10-minute intro call',
      initial_dm_instructions:
        input.initial_dm_instructions || 'Keep under 60 words. Sound like a real human DM, not an email.',
      sending_config: input.sending_config || {
        days: [1, 2, 3, 4, 5],
        start_hour: 9,
        end_hour: 20,
        timezone: 'Asia/Kolkata',
        daily_limit: 25,
        hourly_limit: 6,
      },
      followup_config: input.followup_config || {
        max_followups: 2,
        steps: [
          { step: 1, delay_days: 3, instructions: 'Friendly short bump with a quick value insight' },
          { step: 2, delay_days: 7, instructions: 'Light final check-in with low-friction question' },
        ],
      },
      created_at: now,
      updated_at: now,
      activated_at: null,
    };

    if (!isLiveSupabase()) {
      mockDb.instagramCampaigns.set(record.id, record);
      return record;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from('instagram_campaigns').insert(record).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  async updateInstagramCampaign(id: string, updates: Partial<InstagramCampaign>): Promise<InstagramCampaign> {
    const now = new Date().toISOString();
    if (!isLiveSupabase()) {
      const existing = mockDb.instagramCampaigns.get(id);
      if (!existing) throw new Error('Instagram campaign not found');
      const updated = { ...existing, ...updates, updated_at: now };
      mockDb.instagramCampaigns.set(id, updated);
      return updated;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('instagram_campaigns')
      .update({ ...updates, updated_at: now })
      .eq('id', id)
      .select('*, instagram_account:instagram_accounts(*)')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async deleteInstagramCampaign(id: string): Promise<void> {
    if (!isLiveSupabase()) {
      mockDb.instagramCampaigns.delete(id);
      return;
    }
    const supabase = createAdminClient();
    const { error } = await supabase.from('instagram_campaigns').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ==========================================
  // Instagram Campaign Leads & Enrollment
  // ==========================================
  async getInstagramCampaignLeads(campaignId: string): Promise<InstagramCampaignLead[]> {
    if (!isLiveSupabase()) {
      return Array.from(mockDb.instagramCampaignLeads.values())
        .filter((cl) => cl.campaign_id === campaignId)
        .map((cl) => ({
          ...cl,
          lead: mockDb.instagramLeads.get(cl.instagram_lead_id),
        }))
        .sort((a, b) => new Date(b.enrolled_at).getTime() - new Date(a.enrolled_at).getTime());
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('instagram_campaign_leads')
      .select('*, lead:instagram_leads(*)')
      .eq('campaign_id', campaignId)
      .order('enrolled_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getInstagramCampaignLead(id: string): Promise<InstagramCampaignLead | null> {
    if (!isLiveSupabase()) {
      const cl = mockDb.instagramCampaignLeads.get(id);
      if (!cl) return null;
      return {
        ...cl,
        lead: mockDb.instagramLeads.get(cl.instagram_lead_id),
        campaign: mockDb.instagramCampaigns.get(cl.campaign_id),
      };
    }

    const supabase = createAdminClient();
    const { data } = await supabase
      .from('instagram_campaign_leads')
      .select('*, lead:instagram_leads(*), campaign:instagram_campaigns(*)')
      .eq('id', id)
      .maybeSingle();
    return data || null;
  },

  async enrollInstagramLeads(
    campaignId: string,
    leadIds: string[]
  ): Promise<{ enrolled: number; skipped: number }> {
    const uniqueIds = Array.from(new Set(leadIds.filter(Boolean)));
    if (uniqueIds.length === 0) return { enrolled: 0, skipped: 0 };

    const now = new Date().toISOString();

    if (!isLiveSupabase()) {
      const existingSet = new Set(
        Array.from(mockDb.instagramCampaignLeads.values())
          .filter((cl) => cl.campaign_id === campaignId)
          .map((cl) => cl.instagram_lead_id)
      );

      let enrolled = 0;
      let skipped = 0;
      for (const lid of uniqueIds) {
        if (existingSet.has(lid)) {
          skipped++;
          continue;
        }
        const lead = mockDb.instagramLeads.get(lid);
        if (!lead || lead.status === 'do_not_contact') {
          skipped++;
          continue;
        }
        const cl: InstagramCampaignLead = {
          id: crypto.randomUUID(),
          campaign_id: campaignId,
          instagram_lead_id: lid,
          status: 'enrolled',
          current_step: 0,
          next_action_at: null,
          enrolled_at: now,
          completed_at: null,
          last_error: null,
          created_at: now,
          updated_at: now,
        };
        mockDb.instagramCampaignLeads.set(cl.id, cl);
        enrolled++;
      }
      return { enrolled, skipped };
    }

    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from('instagram_campaign_leads')
      .select('instagram_lead_id')
      .eq('campaign_id', campaignId);
    const existingSet = new Set((existing || []).map((r) => r.instagram_lead_id));

    const toInsert = uniqueIds
      .filter((id) => !existingSet.has(id))
      .map((lid) => ({
        campaign_id: campaignId,
        instagram_lead_id: lid,
        status: 'enrolled',
        current_step: 0,
        enrolled_at: now,
        created_at: now,
        updated_at: now,
      }));

    if (toInsert.length === 0) {
      return { enrolled: 0, skipped: uniqueIds.length };
    }

    const { data, error } = await supabase.from('instagram_campaign_leads').insert(toInsert).select('id');
    if (error) throw new Error(error.message);

    return {
      enrolled: data?.length || toInsert.length,
      skipped: uniqueIds.length - (data?.length || toInsert.length),
    };
  },

  async updateInstagramCampaignLead(
    id: string,
    updates: Partial<InstagramCampaignLead>
  ): Promise<InstagramCampaignLead> {
    const now = new Date().toISOString();
    if (!isLiveSupabase()) {
      const existing = mockDb.instagramCampaignLeads.get(id);
      if (!existing) throw new Error('Instagram campaign lead not found');
      const updated = { ...existing, ...updates, updated_at: now };
      mockDb.instagramCampaignLeads.set(id, updated);
      return updated;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('instagram_campaign_leads')
      .update({ ...updates, updated_at: now })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  // ==========================================
  // Instagram Messages
  // ==========================================
  async getInstagramMessages(filters?: {
    campaignId?: string;
    status?: string;
    userId?: string;
  }): Promise<InstagramMessage[]> {
    if (!isLiveSupabase()) {
      let msgs = Array.from(mockDb.instagramMessages.values());
      const cls = mockDb.instagramCampaignLeads;
      const camps = mockDb.instagramCampaigns;
      const leads = mockDb.instagramLeads;
      const accounts = mockDb.instagramAccounts;

      msgs = msgs
        .map((m) => {
          const cl = cls.get(m.campaign_lead_id);
          const camp = cl ? camps.get(cl.campaign_id) : undefined;
          const lead = cl ? leads.get(cl.instagram_lead_id) : undefined;
          const acc = m.instagram_account_id ? accounts.get(m.instagram_account_id) || null : null;
          return {
            ...m,
            lead,
            campaign_id: camp?.id,
            campaign_name: camp?.name,
            instagram_account: acc,
          };
        })
        .filter((m) => {
          if (filters?.userId) {
            const camp = m.campaign_id ? camps.get(m.campaign_id) : undefined;
            if (camp && camp.user_id !== filters.userId) return false;
          }
          if (filters?.campaignId && m.campaign_id !== filters.campaignId) return false;
          if (filters?.status && m.status !== filters.status) return false;
          return true;
        });

      return msgs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    const supabase = createAdminClient();
    let query = supabase
      .from('instagram_messages')
      .select(
        `
        *,
        instagram_account:instagram_accounts(*),
        campaign_lead:instagram_campaign_leads!inner(
          id,
          campaign_id,
          lead:instagram_leads(*),
          campaign:instagram_campaigns!inner(id, name, user_id)
        )
      `
      )
      .order('created_at', { ascending: false });

    if (filters?.campaignId) {
      query = query.eq('campaign_lead.campaign_id', filters.campaignId);
    }
    if (filters?.userId) {
      query = query.eq('campaign_lead.campaign.user_id', filters.userId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map((row: any) => ({
      ...row,
      lead: row.campaign_lead?.lead,
      campaign_id: row.campaign_lead?.campaign_id,
      campaign_name: row.campaign_lead?.campaign?.name,
    }));
  },

  async getInstagramMessage(id: string): Promise<InstagramMessage | null> {
    if (!isLiveSupabase()) {
      const m = mockDb.instagramMessages.get(id);
      if (!m) return null;
      const cl = mockDb.instagramCampaignLeads.get(m.campaign_lead_id);
      const lead = cl ? mockDb.instagramLeads.get(cl.instagram_lead_id) : undefined;
      return {
        ...m,
        lead,
        campaign_id: cl?.campaign_id,
        ...(cl ? { campaign_lead: { ...cl, lead } } : {}),
      } as any;
    }

    const supabase = createAdminClient();
    const { data } = await supabase
      .from('instagram_messages')
      .select(
        `
        *,
        campaign_lead:instagram_campaign_leads(
          *,
          lead:instagram_leads(*),
          campaign:instagram_campaigns(*)
        )
      `
      )
      .eq('id', id)
      .maybeSingle();

    if (!data) return null;
    return {
      ...data,
      lead: (data as any).campaign_lead?.lead,
      campaign_id: (data as any).campaign_lead?.campaign_id,
    };
  },

  async getInstagramMessageByLeadAndStep(
    campaignLeadId: string,
    stepNumber: number
  ): Promise<InstagramMessage | null> {
    if (!isLiveSupabase()) {
      return (
        Array.from(mockDb.instagramMessages.values()).find(
          (m) => m.campaign_lead_id === campaignLeadId && m.step_number === stepNumber
        ) || null
      );
    }
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('instagram_messages')
      .select('*')
      .eq('campaign_lead_id', campaignLeadId)
      .eq('step_number', stepNumber)
      .maybeSingle();
    return data || null;
  },

  async createOrUpdateInstagramMessage(
    msg: Partial<InstagramMessage> & { campaign_lead_id: string; step_number: number }
  ): Promise<InstagramMessage> {
    const now = new Date().toISOString();
    if (!isLiveSupabase()) {
      const existing = msg.id
        ? mockDb.instagramMessages.get(msg.id)
        : Array.from(mockDb.instagramMessages.values()).find(
            (m) => m.campaign_lead_id === msg.campaign_lead_id && m.step_number === msg.step_number
          );

      const record: InstagramMessage = {
        id: existing?.id || msg.id || crypto.randomUUID(),
        campaign_lead_id: msg.campaign_lead_id,
        step_number: msg.step_number,
        body_text: msg.body_text ?? existing?.body_text ?? '',
        personalization_basis: msg.personalization_basis ?? existing?.personalization_basis ?? [],
        unsupported_claims: msg.unsupported_claims ?? existing?.unsupported_claims ?? [],
        status: msg.status ?? existing?.status ?? 'draft',
        instagram_account_id: msg.instagram_account_id !== undefined ? msg.instagram_account_id : existing?.instagram_account_id ?? null,
        ig_thread_id: msg.ig_thread_id !== undefined ? msg.ig_thread_id : existing?.ig_thread_id ?? null,
        ig_message_id: msg.ig_message_id !== undefined ? msg.ig_message_id : existing?.ig_message_id ?? null,
        scheduled_at: msg.scheduled_at !== undefined ? msg.scheduled_at : existing?.scheduled_at ?? null,
        sent_at: msg.sent_at !== undefined ? msg.sent_at : existing?.sent_at ?? null,
        error_code: msg.error_code !== undefined ? msg.error_code : existing?.error_code ?? null,
        error_message: msg.error_message !== undefined ? msg.error_message : existing?.error_message ?? null,
        created_at: existing?.created_at || now,
        updated_at: now,
      };
      mockDb.instagramMessages.set(record.id, record);
      return record;
    }

    const supabase = createAdminClient();
    const payload = {
      campaign_lead_id: msg.campaign_lead_id,
      step_number: msg.step_number,
      body_text: msg.body_text ?? '',
      personalization_basis: msg.personalization_basis ?? [],
      unsupported_claims: msg.unsupported_claims ?? [],
      status: msg.status ?? 'draft',
      instagram_account_id: msg.instagram_account_id ?? null,
      ig_thread_id: msg.ig_thread_id ?? null,
      ig_message_id: msg.ig_message_id ?? null,
      scheduled_at: msg.scheduled_at ?? null,
      sent_at: msg.sent_at ?? null,
      error_code: msg.error_code ?? null,
      error_message: msg.error_message ?? null,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from('instagram_messages')
      .upsert(payload, { onConflict: 'campaign_lead_id,step_number' })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async deleteInstagramMessage(id: string): Promise<void> {
    if (!isLiveSupabase()) {
      mockDb.instagramMessages.delete(id);
      return;
    }
    const supabase = createAdminClient();
    const { error } = await supabase.from('instagram_messages').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async getInstagramCampaignSendStats(campaignId: string, sendingConfig: SendingConfig) {
    const tz = sendingConfig.timezone || 'Asia/Kolkata';
    const dayStart = getTodayStartUtc(tz);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const messages = await this.getInstagramMessages({ campaignId, status: 'sent' });
    let sentToday = 0;
    let sentPastHour = 0;
    let earliestHourSendMs = Date.now();

    for (const m of messages) {
      if (!m.sent_at) continue;
      const sentDate = new Date(m.sent_at);
      if (sentDate >= dayStart) sentToday++;
      if (sentDate >= hourAgo) {
        sentPastHour++;
        if (sentDate.getTime() < earliestHourSendMs) {
          earliestHourSendMs = sentDate.getTime();
        }
      }
    }

    return { sentToday, sentPastHour, earliestHourSendMs };
  },

  async rescheduleInstagramCampaignMessages(campaignId: string) {
    const campaign = await this.getInstagramCampaign(campaignId);
    if (!campaign || campaign.status !== 'active') return 0;

    const allAccounts = await this.getInstagramAccounts(campaign.user_id, { status: 'active' });
    let targetAccounts = allAccounts;
    if (campaign.instagram_account_id) {
      const matched = allAccounts.filter((a) => a.id === campaign.instagram_account_id);
      if (matched.length > 0) targetAccounts = matched;
    }
    if (targetAccounts.length === 0) return 0;

    const messages = await this.getInstagramMessages({ campaignId });
    const eligible = messages.filter(
      (m) => m.step_number === 0 && (m.status === 'draft' || m.status === 'scheduled' || m.status === 'paused') && m.lead?.normalized_handle
    );
    if (eligible.length === 0) return 0;

    const schedulerCompatibleAccounts = targetAccounts.map((a) => ({
      ...a,
      email_address: a.username,
      provider: 'instagram',
    })) as any[];

    const slots = calculateStaggeredScheduleWithAccounts(
      campaign as any,
      schedulerCompatibleAccounts,
      eligible.length,
      new Date()
    );

    let updatedCount = 0;
    for (let i = 0; i < eligible.length; i++) {
      const msg = eligible[i];
      const slot = slots[i];
      const scheduledAt = slot?.date || new Date();
      await this.createOrUpdateInstagramMessage({
        campaign_lead_id: msg.campaign_lead_id,
        step_number: msg.step_number,
        body_text: msg.body_text,
        status: 'scheduled',
        scheduled_at: scheduledAt.toISOString(),
        instagram_account_id: slot?.accountId || msg.instagram_account_id || targetAccounts[0].id,
      });
      await dbService.enqueueJob(
        'send_ig_dm',
        { instagramMessageId: msg.id },
        `send_ig_${msg.id}_${scheduledAt.getTime()}`,
        scheduledAt
      );
      updatedCount++;
    }

    return updatedCount;
  },

  async reconcileInstagramJobs(): Promise<{ checked: number; reconciled: number }> {
    const scheduled = await this.getInstagramMessages({ status: 'scheduled' });
    let reconciled = 0;
    if (!isLiveSupabase()) {
      const activeJobs = new Set(
        Array.from(mockDb.jobQueue.values())
          .filter((j) => j.job_type === 'send_ig_dm' && (j.status === 'queued' || j.status === 'running'))
          .map((j) => String(j.payload?.instagramMessageId || ''))
      );
      for (const msg of scheduled) {
        if (!activeJobs.has(msg.id)) {
          const runAt = msg.scheduled_at ? new Date(msg.scheduled_at) : new Date();
          await dbService.enqueueJob('send_ig_dm', { instagramMessageId: msg.id }, `reconcile_ig_${msg.id}_${Date.now()}`, runAt);
          reconciled++;
        }
      }
      return { checked: scheduled.length, reconciled };
    }

    const supabase = createAdminClient();
    const { data: activeJobs } = await supabase
      .from('job_queue')
      .select('payload')
      .eq('job_type', 'send_ig_dm')
      .in('status', ['queued', 'running']);
    const activeIds = new Set((activeJobs || []).map((j: any) => String(j.payload?.instagramMessageId || '')));

    for (const msg of scheduled) {
      if (!activeIds.has(msg.id)) {
        const runAt = msg.scheduled_at ? new Date(msg.scheduled_at) : new Date();
        await dbService.enqueueJob('send_ig_dm', { instagramMessageId: msg.id }, `reconcile_ig_${msg.id}_${Date.now()}`, runAt);
        reconciled++;
      }
    }
    return { checked: scheduled.length, reconciled };
  },

  // ==========================================
  // Instagram Replies
  // ==========================================
  async getInstagramReplies(userId: string): Promise<InstagramReplyEvent[]> {
    if (!isLiveSupabase()) {
      return Array.from(mockDb.instagramReplyEvents.values())
        .filter((r) => r.user_id === userId)
        .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('instagram_reply_events')
      .select(
        `
        *,
        instagram_account:instagram_accounts(username),
        instagram_message:instagram_messages(
          body_text,
          sent_at,
          campaign_lead:instagram_campaign_leads(
            campaign:instagram_campaigns(id, name),
            lead:instagram_leads(full_name, company, instagram_handle)
          )
        )
      `
      )
      .eq('user_id', userId)
      .order('received_at', { ascending: false });
    if (error) throw new Error(error.message);

    return (data || []).map((r: any) => ({
      ...r,
      receiving_account: r.instagram_account?.username ? `@${r.instagram_account.username}` : undefined,
      sent_message_body: r.instagram_message?.body_text,
      sent_at: r.instagram_message?.sent_at,
      campaign_id: r.instagram_message?.campaign_lead?.campaign?.id,
      campaign_name: r.instagram_message?.campaign_lead?.campaign?.name,
      lead_name: r.instagram_message?.campaign_lead?.lead?.full_name,
      lead_company: r.instagram_message?.campaign_lead?.lead?.company,
    }));
  },

  async recordInstagramReply(
    event: Omit<InstagramReplyEvent, 'id' | 'created_at'>
  ): Promise<InstagramReplyEvent> {
    const now = new Date().toISOString();
    if (!isLiveSupabase()) {
      const existing = Array.from(mockDb.instagramReplyEvents.values()).find(
        (r) => r.user_id === event.user_id && r.ig_message_id === event.ig_message_id
      );
      if (existing) return existing;
      const record: InstagramReplyEvent = {
        ...event,
        id: crypto.randomUUID(),
        created_at: now,
      };
      mockDb.instagramReplyEvents.set(record.id, record);
      return record;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('instagram_reply_events')
      .upsert(
        {
          user_id: event.user_id,
          instagram_message_id: event.instagram_message_id,
          instagram_account_id: event.instagram_account_id,
          ig_thread_id: event.ig_thread_id,
          ig_message_id: event.ig_message_id,
          sender_handle: event.sender_handle,
          received_at: event.received_at,
          classification: event.classification,
          classification_summary: event.classification_summary,
          reply_text: event.reply_text || '',
        },
        { onConflict: 'user_id,ig_message_id' }
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
};
