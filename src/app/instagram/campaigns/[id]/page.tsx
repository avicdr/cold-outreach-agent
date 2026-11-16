'use client';

import { useState, useEffect, use, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { InstagramIcon } from '@/components/InstagramIcon';
import {
  InstagramCampaign,
  InstagramCampaignLead,
  InstagramMessage,
  InstagramLead,
} from '@/types/database';
import {
  Sparkles,
  Play,
  Pause,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Zap,
  Check,
  Search,
  X,
  Edit2,
  ExternalLink,
  ArrowDownToLine,
  AtSign,
  Send,
} from 'lucide-react';

export default function InstagramCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Loading IG campaign...</div>}>
      <InstagramCampaignDetailInner params={params} />
    </Suspense>
  );
}

function InstagramCampaignDetailInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<InstagramCampaign | null>(null);
  const [leads, setLeads] = useState<InstagramCampaignLead[]>([]);
  const [messages, setMessages] = useState<InstagramMessage[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; username: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [handleFilter, setHandleFilter] = useState<'all' | 'ready' | 'missing'>('all');

  // Inline @handle editing
  const [editingHandleLeadId, setEditingHandleLeadId] = useState<string | null>(null);
  const [editingHandleVal, setEditingHandleVal] = useState('');
  const [savingHandle, setSavingHandle] = useState(false);

  // Inline DM preview/edit modal
  const [editingMessage, setEditingMessage] = useState<InstagramMessage | null>(null);
  const [editingMessageBody, setEditingMessageBody] = useState('');
  const [savingMessage, setSavingMessage] = useState(false);

  // Enroll Modal
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollTab, setEnrollTab] = useState<'ig_leads' | 'ig_group' | 'email_source' | 'paste_handles'>('ig_leads');
  const [availableIgLeads, setAvailableIgLeads] = useState<InstagramLead[]>([]);
  const [igGroups, setIgGroups] = useState<{ id: string; name: string; leads_count?: number }[]>([]);
  const [emailCampaigns, setEmailCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [emailGroups, setEmailGroups] = useState<{ id: string; name: string }[]>([]);
  const [selectedIgLeadIds, setSelectedIgLeadIds] = useState<string[]>([]);
  const [selectedIgGroupId, setSelectedIgGroupId] = useState('');
  const [emailSourceType, setEmailSourceType] = useState<'campaign' | 'group'>('campaign');
  const [selectedEmailCampaignId, setSelectedEmailCampaignId] = useState('');
  const [selectedEmailGroupId, setSelectedEmailGroupId] = useState('');
  const [pasteHandlesText, setPasteHandlesText] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  const loadCampaign = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instagram/campaigns/${id}`);
      const data = await res.json();
      if (data?.campaign) {
        setCampaign(data.campaign);
        setLeads(Array.isArray(data.leads) ? data.leads : []);
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaign();
  }, [id]);

  const openEnrollModal = async () => {
    setShowEnrollModal(true);
    try {
      const [igLeadsRes, igGroupsRes, emailCampRes, emailGrpRes] = await Promise.all([
        fetch('/api/instagram/leads?limit=500').then((r) => r.json()),
        fetch('/api/instagram/lead-groups').then((r) => r.json()),
        fetch('/api/campaigns').then((r) => r.json()),
        fetch('/api/lead-groups').then((r) => r.json()),
      ]);

      const enrolledIds = new Set(leads.map((l) => l.instagram_lead_id));
      const allIg: InstagramLead[] = Array.isArray(igLeadsRes?.leads) ? igLeadsRes.leads : [];
      setAvailableIgLeads(allIg.filter((l) => !enrolledIds.has(l.id)));

      if (Array.isArray(igGroupsRes)) {
        setIgGroups(igGroupsRes);
        if (igGroupsRes.length > 0) setSelectedIgGroupId(igGroupsRes[0].id);
      }
      if (Array.isArray(emailCampRes)) {
        setEmailCampaigns(emailCampRes);
        if (emailCampRes.length > 0) setSelectedEmailCampaignId(emailCampRes[0].id);
      }
      if (Array.isArray(emailGrpRes)) {
        setEmailGroups(emailGrpRes);
        if (emailGrpRes.length > 0) setSelectedEmailGroupId(emailGrpRes[0].id);
      }
    } catch {
      // ignore
    }
  };

  const handleEnrollSubmit = async () => {
    setEnrolling(true);
    setNotice(null);
    try {
      const payload: Record<string, any> = {};
      if (enrollTab === 'ig_leads') {
        payload.lead_ids = selectedIgLeadIds;
      } else if (enrollTab === 'ig_group') {
        payload.group_id = selectedIgGroupId;
      } else if (enrollTab === 'email_source') {
        if (emailSourceType === 'campaign') payload.email_campaign_id = selectedEmailCampaignId;
        else payload.email_group_id = selectedEmailGroupId;
      } else if (enrollTab === 'paste_handles') {
        payload.handles = pasteHandlesText
          .split(/[\n,;]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }

      const res = await fetch(`/api/instagram/campaigns/${id}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Enrollment failed.');

      setShowEnrollModal(false);
      setSelectedIgLeadIds([]);
      setPasteHandlesText('');
      setNotice({
        type: 'success',
        text: `Enrolled ${data.enrolled_count} lead(s) into this Instagram DM campaign.`,
      });
      await loadCampaign();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Enrollment error' });
    } finally {
      setEnrolling(false);
    }
  };

  const handleSaveInlineHandle = async (leadId: string) => {
    setSavingHandle(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/instagram/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instagram_handle: editingHandleVal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ type: 'error', text: data?.error || 'Invalid handle.' });
      } else {
        setEditingHandleLeadId(null);
        setLeads((prev) =>
          prev.map((cl) => (cl.instagram_lead_id === leadId ? { ...cl, lead: data.lead } : cl))
        );
      }
    } finally {
      setSavingHandle(false);
    }
  };

  const handleGenerateDms = async () => {
    setActionLoading(true);
    setNotice(null);
    try {
      let isDone = false;
      let totalNewlyGenerated = 0;
      let totalSkippedHandles = 0;
      let loopCount = 0;
      const MAX_LOOPS = 50;

      while (!isDone && loopCount < MAX_LOOPS) {
        loopCount++;
        const res = await fetch(`/api/instagram/campaigns/${id}/generate?limit=12`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Generation failed.');

        totalNewlyGenerated += (data.newly_generated || 0);
        totalSkippedHandles = data.skipped_missing_handles || 0;
        isDone = data.done !== false || !data.remaining_count;

        if (!isDone) {
          setNotice({
            type: 'info',
            text: `Writing personalized DMs with AI... (${data.remaining_count} remaining)`,
          });
          // Refresh background list progressively
          loadCampaign();
        }
      }

      const skippedMsg =
        totalSkippedHandles > 0
          ? ` (${totalSkippedHandles} lead(s) skipped because they need an @handle first)`
          : '';
      setNotice({
        type: 'success',
        text: `Generated ${totalNewlyGenerated} new DM draft(s)${skippedMsg}.`,
      });
      await loadCampaign();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCampaignState = async (action: 'activate' | 'pause' | 'resume') => {
    setActionLoading(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/instagram/campaigns/${id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Failed to ${action} campaign.`);
      setNotice({
        type: 'success',
        text:
          action === 'activate'
            ? `Campaign activated — ${data.enqueued_sends || 0} DM(s) scheduled.`
            : action === 'pause'
              ? 'Campaign paused.'
              : `Campaign resumed — ${data.rescheduled || 0} DM(s) rescheduled.`,
      });
      await loadCampaign();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispatchNow = async () => {
    setDispatching(true);
    setNotice(null);
    try {
      const res = await fetch('/api/jobs/process?force=true', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Dispatch failed.');
      setNotice({
        type: 'success',
        text: `Worker cycle finished: ${data.processed || 0} job(s) processed.`,
      });
      await loadCampaign();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setDispatching(false);
    }
  };

  const handleSenderAccountChange = async (accountId: string) => {
    const res = await fetch(`/api/instagram/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instagram_account_id: accountId || null }),
    });
    if (res.ok) {
      await loadCampaign();
    }
  };

  const handleSaveMessageEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMessage) return;
    setSavingMessage(true);
    try {
      const res = await fetch(`/api/instagram/messages/${editingMessage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body_text: editingMessageBody }),
      });
      if (res.ok) {
        setEditingMessage(null);
        await loadCampaign();
      }
    } finally {
      setSavingMessage(false);
    }
  };

  const filteredLeads = useMemo(() => {
    return leads.filter((cl) => {
      const hasHandle = Boolean(cl.lead?.normalized_handle);
      if (handleFilter === 'ready' && !hasHandle) return false;
      if (handleFilter === 'missing' && hasHandle) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${cl.lead?.instagram_handle || ''} ${cl.lead?.full_name || ''} ${cl.lead?.company || ''} ${cl.lead?.email || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, handleFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = leads.length;
    const withHandle = leads.filter((l) => Boolean(l.lead?.normalized_handle)).length;
    const drafted = messages.filter((m) => m.step_number === 0).length;
    const sent = messages.filter((m) => m.status === 'sent').length;
    const replied = leads.filter((l) => l.status === 'replied').length;
    return { total, withHandle, missingHandle: total - withHandle, drafted, sent, replied };
  }, [leads, messages]);

  if (loading && !campaign) {
    return (
      <div className="flex min-h-screen bg-slate-950 text-slate-100">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
          Loading Instagram campaign...
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex min-h-screen bg-slate-950 text-slate-100">
        <Sidebar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="text-sm text-slate-400">Instagram campaign not found.</div>
          <Link href="/instagram/campaigns" className="text-xs text-fuchsia-400 underline">
            Back to IG Campaigns
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={campaign.name}
          subtitle={campaign.offer || 'Independent Instagram DM Outreach Campaign'}
          category={`Instagram DM • ${campaign.status.toUpperCase()}`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={openEnrollModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200"
            >
              <Plus className="w-3.5 h-3.5 text-fuchsia-400" />
              <span>Add Leads / Handles</span>
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleGenerateDms}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-fuchsia-500/40 hover:bg-fuchsia-500/10 text-fuchsia-300 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Generate AI DMs</span>
            </button>
            {campaign.status === 'draft' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleCampaignState('activate')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Activate Campaign</span>
              </button>
            )}
            {campaign.status === 'active' && (
              <>
                <button
                  type="button"
                  disabled={dispatching}
                  onClick={handleDispatchNow}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{dispatching ? 'Dispatching...' : 'Dispatch DMs Now'}</span>
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleCampaignState('pause')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </button>
              </>
            )}
            {campaign.status === 'paused' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleCampaignState('resume')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Resume</span>
              </button>
            )}
          </div>
        </Header>

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto min-w-0">
          {notice && (
            <div
              role="status"
              aria-live="polite"
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                notice.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : notice.type === 'info'
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {notice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : notice.type === 'info' ? (
                  <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{notice.text}</span>
              </div>
              <button type="button" onClick={() => setNotice(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Stats & Sender Row */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 uppercase font-mono">Enrolled Leads</div>
              <div className="text-2xl font-bold text-slate-100 mt-1">{stats.total}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 uppercase font-mono">Handles Ready</div>
              <div className="text-2xl font-bold text-fuchsia-400 mt-1">{stats.withHandle}</div>
              {stats.missingHandle > 0 && (
                <div className="text-[11px] text-amber-400 mt-0.5">{stats.missingHandle} missing @handle</div>
              )}
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 uppercase font-mono">DM Drafts</div>
              <div className="text-2xl font-bold text-slate-100 mt-1">{stats.drafted}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 uppercase font-mono">DMs Sent / Replies</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">
                {stats.sent} <span className="text-sm text-slate-400">/ {stats.replied}</span>
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 col-span-2 lg:col-span-1">
              <label htmlFor="camp-sender-select" className="block text-[11px] text-slate-400 uppercase font-mono mb-1.5">
                Sending IG Account
              </label>
              <select
                id="camp-sender-select"
                value={campaign.instagram_account_id || ''}
                onChange={(e) => handleSenderAccountChange(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
              >
                <option value="">Auto-rotate active IG</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.username} ({a.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/50 border border-slate-800 p-3.5 rounded-xl">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter enrolled leads..."
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 w-64"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              {(['all', 'ready', 'missing'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setHandleFilter(f)}
                  className={`px-2.5 py-1 rounded-lg font-medium ${
                    handleFilter === f ? 'bg-fuchsia-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f === 'all' ? `All (${leads.length})` : f === 'ready' ? `Has @handle (${stats.withHandle})` : `Needs @handle (${stats.missingHandle})`}
                </button>
              ))}
            </div>
          </div>

          {/* Enrolled Leads & Handles Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            {leads.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <Users className="w-10 h-10 text-slate-600 mx-auto" />
                <div className="text-sm font-medium text-slate-200">No leads enrolled in this IG campaign yet</div>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Enroll leads from your IG Leads list, paste @handles directly, or pull leads from an existing Email Campaign and attach their Instagram handles right here.
                </p>
                <button
                  type="button"
                  onClick={openEnrollModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Leads or @Handles
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-mono uppercase text-slate-400">
                      <th className="py-3 px-4">Instagram Handle</th>
                      <th className="py-3 px-4">Lead Details</th>
                      <th className="py-3 px-4">DM Draft Preview</th>
                      <th className="py-3 px-4">Status / Scheduled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-xs">
                    {filteredLeads.map((cl) => {
                      const lead = cl.lead;
                      const msg = messages.find((m) => m.campaign_lead_id === cl.id && m.step_number === cl.current_step) ||
                        messages.find((m) => m.campaign_lead_id === cl.id && m.step_number === 0);
                      const isEditing = lead && editingHandleLeadId === lead.id;

                      return (
                        <tr key={cl.id} className="hover:bg-slate-800/30">
                          <td className="py-3 px-4">
                            {lead && isEditing ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  autoFocus
                                  autoCorrect="off"
                                  autoCapitalize="none"
                                  spellCheck={false}
                                  value={editingHandleVal}
                                  onChange={(e) => setEditingHandleVal(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveInlineHandle(lead.id);
                                    if (e.key === 'Escape') setEditingHandleLeadId(null);
                                  }}
                                  placeholder="@handle"
                                  className="px-2 py-1 rounded bg-slate-950 border border-fuchsia-500 text-xs text-slate-100 w-36"
                                />
                                <button
                                  type="button"
                                  disabled={savingHandle}
                                  onClick={() => handleSaveInlineHandle(lead.id)}
                                  className="p-1 rounded bg-emerald-600 text-white"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingHandleLeadId(null)}
                                  className="p-1 rounded bg-slate-800 text-slate-400"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : lead?.normalized_handle ? (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-fuchsia-300">@{lead.normalized_handle}</span>
                                <a
                                  href={lead.instagram_url || `https://www.instagram.com/${lead.normalized_handle}/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-500 hover:text-fuchsia-400"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingHandleLeadId(lead.id);
                                    setEditingHandleVal(lead.instagram_handle || `@${lead.normalized_handle}`);
                                  }}
                                  className="text-slate-500 hover:text-slate-200"
                                  title="Edit Instagram handle"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            ) : lead ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingHandleLeadId(lead.id);
                                  setEditingHandleVal('');
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-medium"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add @handle</span>
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-200">{lead?.full_name || lead?.company || '—'}</div>
                            <div className="text-[11px] text-slate-400">
                              {[lead?.company, lead?.niche, lead?.city].filter(Boolean).join(' • ') || lead?.email || ''}
                            </div>
                          </td>
                          <td className="py-3 px-4 max-w-md">
                            {msg ? (
                              <div className="space-y-1">
                                <p className="text-slate-300 line-clamp-2">{msg.body_text}</p>
                                {msg.status !== 'sent' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingMessage(msg);
                                      setEditingMessageBody(msg.body_text);
                                    }}
                                    className="text-[11px] text-fuchsia-400 hover:underline"
                                  >
                                    Edit DM copy
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500 italic">
                                {lead?.normalized_handle ? 'Not generated yet' : 'Add @handle to generate DM'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-medium capitalize">
                              {msg?.status || cl.status}
                            </span>
                            {msg?.scheduled_at && msg.status === 'scheduled' && (
                              <div className="text-[10px] text-slate-500 mt-1">
                                {new Date(msg.scheduled_at).toLocaleString()}
                              </div>
                            )}
                            {msg?.error_message && (
                              <div className="text-[10px] text-rose-400 mt-1 max-w-[180px] truncate" title={msg.error_message}>
                                {msg.error_message}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Enroll Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="enroll-ig-title">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h2 id="enroll-ig-title" className="text-sm font-semibold text-slate-100">
                Load Leads & Instagram Handles into Campaign
              </h2>
              <button type="button" onClick={() => setShowEnrollModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setEnrollTab('ig_leads')}
                  className={`py-2 px-2 rounded-lg font-medium ${enrollTab === 'ig_leads' ? 'bg-fuchsia-600 text-white' : 'text-slate-400'}`}
                >
                  IG Leads ({availableIgLeads.length})
                </button>
                <button
                  type="button"
                  onClick={() => setEnrollTab('ig_group')}
                  className={`py-2 px-2 rounded-lg font-medium ${enrollTab === 'ig_group' ? 'bg-fuchsia-600 text-white' : 'text-slate-400'}`}
                >
                  IG Lead Group
                </button>
                <button
                  type="button"
                  onClick={() => setEnrollTab('email_source')}
                  className={`py-2 px-2 rounded-lg font-medium flex items-center justify-center gap-1 ${enrollTab === 'email_source' ? 'bg-fuchsia-600 text-white' : 'text-slate-400'}`}
                >
                  <ArrowDownToLine className="w-3 h-3" />
                  <span>From Email</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEnrollTab('paste_handles')}
                  className={`py-2 px-2 rounded-lg font-medium flex items-center justify-center gap-1 ${enrollTab === 'paste_handles' ? 'bg-fuchsia-600 text-white' : 'text-slate-400'}`}
                >
                  <AtSign className="w-3 h-3" />
                  <span>Paste Handles</span>
                </button>
              </div>

              {enrollTab === 'ig_leads' && (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {availableIgLeads.length === 0 ? (
                    <div className="text-xs text-slate-400 py-6 text-center">
                      No additional IG Leads available. Paste handles, import a CSV, or pull leads from an email campaign.
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-xs pb-1">
                        <span className="text-slate-400">{selectedIgLeadIds.length} selected</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedIgLeadIds(
                              selectedIgLeadIds.length === availableIgLeads.length
                                ? []
                                : availableIgLeads.map((l) => l.id)
                            )
                          }
                          className="text-fuchsia-400 hover:underline"
                        >
                          {selectedIgLeadIds.length === availableIgLeads.length ? 'Clear All' : 'Select All'}
                        </button>
                      </div>
                      {availableIgLeads.map((l) => (
                        <label
                          key={l.id}
                          className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIgLeadIds.includes(l.id)}
                            onChange={(e) => {
                              setSelectedIgLeadIds((prev) =>
                                e.target.checked ? [...prev, l.id] : prev.filter((x) => x !== l.id)
                              );
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-fuchsia-300">
                              {l.normalized_handle ? `@${l.normalized_handle}` : '(No @handle yet)'}
                            </span>
                            <span className="text-slate-400 ml-2">
                              {[l.full_name, l.company, l.niche].filter(Boolean).join(' • ')}
                            </span>
                          </div>
                        </label>
                      ))}
                    </>
                  )}
                </div>
              )}

              {enrollTab === 'ig_group' && (
                <div className="space-y-2">
                  <label htmlFor="enroll-ig-grp" className="block text-xs text-slate-300">
                    Select Instagram Lead Group
                  </label>
                  <select
                    id="enroll-ig-grp"
                    value={selectedIgGroupId}
                    onChange={(e) => setSelectedIgGroupId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  >
                    {igGroups.length === 0 && <option value="">No IG groups created yet</option>}
                    {igGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.leads_count ?? 0} leads)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {enrollTab === 'email_source' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    Pulls the existing set of leads from an Email Campaign or Email Lead Group into this Instagram campaign. Any leads missing an Instagram handle can have their @handle added inline right in the campaign table.
                  </p>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setEmailSourceType('campaign')}
                      className={`px-3 py-1.5 rounded-lg border ${emailSourceType === 'campaign' ? 'bg-fuchsia-600 border-fuchsia-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                    >
                      From Email Campaign
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmailSourceType('group')}
                      className={`px-3 py-1.5 rounded-lg border ${emailSourceType === 'group' ? 'bg-fuchsia-600 border-fuchsia-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                    >
                      From Email Lead Group
                    </button>
                  </div>

                  {emailSourceType === 'campaign' ? (
                    <select
                      value={selectedEmailCampaignId}
                      onChange={(e) => setSelectedEmailCampaignId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                    >
                      {emailCampaigns.length === 0 && <option value="">No email campaigns found</option>}
                      {emailCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : (
                    <select
                      value={selectedEmailGroupId}
                      onChange={(e) => setSelectedEmailGroupId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                    >
                      {emailGroups.length === 0 && <option value="">No email lead groups found</option>}
                      {emailGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  )}
                </div>
              )}

              {enrollTab === 'paste_handles' && (
                <div className="space-y-2">
                  <label htmlFor="camp-paste-handles" className="block text-xs text-slate-300">
                    Paste Instagram handles or profile URLs (one per line or comma-separated)
                  </label>
                  <textarea
                    id="camp-paste-handles"
                    rows={6}
                    value={pasteHandlesText}
                    onChange={(e) => setPasteHandlesText(e.target.value)}
                    placeholder={'@brand_one\nhttps://www.instagram.com/creator_two/'}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100"
                  />
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
              <button type="button" onClick={() => setShowEnrollModal(false)} className="px-4 py-2 rounded-lg text-xs bg-slate-800 text-slate-300">
                Cancel
              </button>
              <button
                type="button"
                disabled={enrolling}
                onClick={handleEnrollSubmit}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white disabled:opacity-50"
              >
                {enrolling ? 'Enrolling...' : 'Enroll into Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit DM Copy Modal */}
      {editingMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="edit-dm-title">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="edit-dm-title" className="text-sm font-semibold text-slate-100">Edit Instagram DM</h2>
              <button type="button" onClick={() => setEditingMessage(null)} className="text-slate-400 hover:text-slate-200"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSaveMessageEdit} className="space-y-4">
              <textarea
                rows={5}
                required
                value={editingMessageBody}
                onChange={(e) => setEditingMessageBody(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingMessage(null)} className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-300">Cancel</button>
                <button type="submit" disabled={savingMessage} className="px-4 py-1.5 rounded-lg text-xs bg-fuchsia-600 text-white font-medium">
                  {savingMessage ? 'Saving...' : 'Save DM'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
