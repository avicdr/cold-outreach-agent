'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { Pagination } from '@/components/Pagination';
import { InstagramIcon } from '@/components/InstagramIcon';
import { InstagramLead, InstagramLeadGroup } from '@/types/database';
import {
  Search,
  Upload,
  Plus,
  Users,
  Trash2,
  Edit2,
  Check,
  X,
  FolderPlus,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  AtSign,
  ArrowDownToLine,
} from 'lucide-react';

export default function InstagramLeadsPage() {
  const [leads, setLeads] = useState<InstagramLead[]>([]);
  const [groups, setGroups] = useState<InstagramLeadGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [handleFilter, setHandleFilter] = useState<'all' | 'has_handle' | 'missing_handle'>('all');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Inline handle editing
  const [editingHandleId, setEditingHandleId] = useState<string | null>(null);
  const [editingHandleValue, setEditingHandleValue] = useState('');
  const [savingHandleId, setSavingHandleId] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showBridgeModal, setShowBridgeModal] = useState(false);
  const [showGroupsModal, setShowGroupsModal] = useState(false);

  // Add Single Lead Form
  const [leadForm, setLeadForm] = useState({
    instagram_handle: '',
    full_name: '',
    company: '',
    niche: '',
    bio: '',
    followers_count: '',
    website: '',
    city: '',
    personalization_hook: '',
    notes: '',
    group_id: '',
  });
  const [submittingLead, setSubmittingLead] = useState(false);

  // Bulk Handles Form
  const [bulkHandlesText, setBulkHandlesText] = useState('');
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [submittingBulk, setSubmittingBulk] = useState(false);

  // Email Source Bridge Form
  const [emailCampaigns, setEmailCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [emailGroups, setEmailGroups] = useState<{ id: string; name: string }[]>([]);
  const [bridgeMode, setBridgeMode] = useState<'campaign' | 'group'>('campaign');
  const [selectedEmailCampaignId, setSelectedEmailCampaignId] = useState('');
  const [selectedEmailGroupId, setSelectedEmailGroupId] = useState('');
  const [bridgeTargetGroupId, setBridgeTargetGroupId] = useState('');
  const [bridging, setBridging] = useState(false);

  // Group Form
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/instagram/lead-groups');
      const data = await res.json();
      if (Array.isArray(data)) setGroups(data);
    } catch {
      // ignore
    }
  };

  const fetchLeads = async (targetPage = page, targetLimit = pageSize) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter) params.set('status', statusFilter);
    if (groupFilter) params.set('group_id', groupFilter);
    if (handleFilter !== 'all') params.set('handle_state', handleFilter);
    params.set('page', String(targetPage));
    params.set('limit', String(targetLimit));

    try {
      const res = await fetch(`/api/instagram/leads?${params.toString()}`);
      const data = await res.json();
      setLeads(Array.isArray(data?.leads) ? data.leads : []);
      setTotal(typeof data?.total === 'number' ? data.total : 0);
    } catch {
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    setPage(1);
    fetchLeads(1, pageSize);
  }, [statusFilter, groupFilter, handleFilter]);

  const openBridgeModal = async () => {
    setShowBridgeModal(true);
    try {
      const [cRes, gRes] = await Promise.all([fetch('/api/campaigns'), fetch('/api/lead-groups')]);
      const [cData, gData] = await Promise.all([cRes.json(), gRes.json()]);
      if (Array.isArray(cData)) {
        setEmailCampaigns(cData);
        if (cData.length > 0 && !selectedEmailCampaignId) setSelectedEmailCampaignId(cData[0].id);
      }
      if (Array.isArray(gData)) {
        setEmailGroups(gData);
        if (gData.length > 0 && !selectedEmailGroupId) setSelectedEmailGroupId(gData[0].id);
      }
    } catch {
      // ignore
    }
  };

  const handleSaveInlineHandle = async (leadId: string) => {
    setSavingHandleId(leadId);
    setNotice(null);
    try {
      const res = await fetch(`/api/instagram/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instagram_handle: editingHandleValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ type: 'error', text: data?.error || 'Failed to update handle.' });
      } else {
        setEditingHandleId(null);
        setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead : l)));
      }
    } finally {
      setSavingHandleId(null);
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingLead(true);
    setNotice(null);
    try {
      const res = await fetch('/api/instagram/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...leadForm,
          followers_count: leadForm.followers_count ? parseInt(leadForm.followers_count, 10) || null : null,
          group_id: leadForm.group_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ type: 'error', text: data?.error || 'Failed to add Instagram lead.' });
      } else {
        setShowAddModal(false);
        setLeadForm({
          instagram_handle: '',
          full_name: '',
          company: '',
          niche: '',
          bio: '',
          followers_count: '',
          website: '',
          city: '',
          personalization_hook: '',
          notes: '',
          group_id: '',
        });
        setNotice({ type: 'success', text: 'Instagram lead added.' });
        fetchLeads(1, pageSize);
        fetchGroups();
      }
    } finally {
      setSubmittingLead(false);
    }
  };

  const handleBulkHandlesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const handles = bulkHandlesText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (handles.length === 0) return;

    setSubmittingBulk(true);
    setNotice(null);
    try {
      const res = await fetch('/api/instagram/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handles, group_id: bulkGroupId || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ type: 'error', text: data?.error || 'Failed to add handles.' });
      } else {
        setShowBulkModal(false);
        setBulkHandlesText('');
        setNotice({
          type: 'success',
          text: `Added ${data.inserted} Instagram handle(s)${data.invalid?.length ? ` (${data.invalid.length} skipped as invalid)` : ''}.`,
        });
        fetchLeads(1, pageSize);
        fetchGroups();
      }
    } finally {
      setSubmittingBulk(false);
    }
  };

  const handleBridgeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBridging(true);
    setNotice(null);
    try {
      const res = await fetch('/api/instagram/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: bridgeMode === 'campaign' ? 'email_campaign' : 'email_group',
          email_campaign_id: bridgeMode === 'campaign' ? selectedEmailCampaignId : undefined,
          email_group_id: bridgeMode === 'group' ? selectedEmailGroupId : undefined,
          group_id: bridgeTargetGroupId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ type: 'error', text: data?.error || 'Failed to import leads from email source.' });
      } else {
        setShowBridgeModal(false);
        setNotice({
          type: 'success',
          text: `Loaded ${data.inserted} new lead(s) (${data.reused || 0} already in IG Leads). Click any row's @handle cell to add or edit Instagram handles.`,
        });
        fetchLeads(1, pageSize);
        fetchGroups();
      }
    } finally {
      setBridging(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const res = await fetch('/api/instagram/lead-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc.trim() }),
    });
    if (res.ok) {
      setNewGroupName('');
      setNewGroupDesc('');
      fetchGroups();
    }
  };

  const handleDeleteLead = async (id: string) => {
    const res = await fetch(`/api/instagram/leads/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchLeads(page, pageSize);
      fetchGroups();
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Instagram Leads"
          subtitle="Independent Instagram lead database — import CSVs, paste @handles, or pull from an email campaign"
          category="Instagram DM"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={openBridgeModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200"
            >
              <ArrowDownToLine className="w-3.5 h-3.5 text-fuchsia-400" />
              <span>Pull from Email Campaign</span>
            </button>
            <button
              type="button"
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200"
            >
              <AtSign className="w-3.5 h-3.5 text-fuchsia-400" />
              <span>Paste Handles</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Lead</span>
            </button>
            <Link
              href="/instagram/leads/import"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import CSV / Excel</span>
            </Link>
          </div>
        </Header>

        <main className="p-4 sm:p-6 lg:p-8 space-y-5 flex-1 max-w-7xl w-full mx-auto min-w-0">
          {notice && (
            <div
              role="status"
              aria-live="polite"
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                notice.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {notice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{notice.text}</span>
              </div>
              <button type="button" onClick={() => setNotice(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Filter & Search Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900/50 border border-slate-800 p-3.5 rounded-xl">
            <search>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setPage(1);
                  fetchLeads(1, pageSize);
                }}
                className="flex items-center gap-2"
              >
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search @handle, name, brand, niche..."
                    className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 w-64 focus:outline-none focus:border-fuchsia-500"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                >
                  Search
                </button>
              </form>
            </search>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={handleFilter}
                onChange={(e) => setHandleFilter(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200"
              >
                <option value="all">All Leads ({total})</option>
                <option value="has_handle">Ready (Has @handle)</option>
                <option value="missing_handle">Needs @handle</option>
              </select>

              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200"
              >
                <option value="">All IG Groups</option>
                <option value="ungrouped">Ungrouped</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.leads_count ?? 0})
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="contacted">Contacted</option>
                <option value="replied">Replied</option>
                <option value="do_not_contact">Do Not Contact</option>
              </select>

              <button
                type="button"
                onClick={() => setShowGroupsModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Groups</span>
              </button>
            </div>
          </div>

          {/* Leads Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-10 text-center text-sm text-slate-400">Loading Instagram leads...</div>
            ) : leads.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400">
                  <InstagramIcon className="w-6 h-6" />
                </div>
                <div className="text-sm font-medium text-slate-200">No Instagram leads yet</div>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Upload a CSV/Excel of Instagram profiles, paste a list of @handles, or pull leads from an existing email campaign and attach their Instagram handles here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-mono uppercase text-slate-400">
                      <th className="py-3 px-4">Instagram Handle</th>
                      <th className="py-3 px-4">Name / Brand</th>
                      <th className="py-3 px-4">Niche & Bio Context</th>
                      <th className="py-3 px-4">Followers / City</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-xs">
                    {leads.map((lead) => {
                      const isEditing = editingHandleId === lead.id;
                      return (
                        <tr key={lead.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  autoFocus
                                  autoCorrect="off"
                                  autoCapitalize="none"
                                  spellCheck={false}
                                  value={editingHandleValue}
                                  onChange={(e) => setEditingHandleValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveInlineHandle(lead.id);
                                    if (e.key === 'Escape') setEditingHandleId(null);
                                  }}
                                  placeholder="@handle"
                                  className="px-2 py-1 rounded bg-slate-950 border border-fuchsia-500 text-xs text-slate-100 w-36"
                                />
                                <button
                                  type="button"
                                  disabled={savingHandleId === lead.id}
                                  onClick={() => handleSaveInlineHandle(lead.id)}
                                  className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                                  title="Save handle"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingHandleId(null)}
                                  className="p-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : lead.normalized_handle ? (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-fuchsia-300">
                                  @{lead.normalized_handle}
                                </span>
                                <a
                                  href={lead.instagram_url || `https://www.instagram.com/${lead.normalized_handle}/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-500 hover:text-fuchsia-400"
                                  title="Open Instagram profile"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingHandleId(lead.id);
                                    setEditingHandleValue(lead.instagram_handle || `@${lead.normalized_handle}`);
                                  }}
                                  className="text-slate-500 hover:text-slate-200"
                                  title="Edit handle"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingHandleId(lead.id);
                                  setEditingHandleValue('');
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-[11px] font-medium"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add @handle</span>
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-200">
                              {lead.full_name || lead.company || '—'}
                            </div>
                            {lead.company && lead.full_name && (
                              <div className="text-[11px] text-slate-400">{lead.company}</div>
                            )}
                            {lead.email && (
                              <div className="text-[10px] text-slate-500">{lead.email}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            {lead.niche && (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 mb-1">
                                {lead.niche}
                              </span>
                            )}
                            <div className="text-[11px] text-slate-400 truncate" title={lead.personalization_hook || lead.bio || lead.notes}>
                              {lead.personalization_hook || lead.bio || lead.notes || '—'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-[11px] text-slate-400">
                            <div>
                              {typeof lead.followers_count === 'number'
                                ? `${lead.followers_count.toLocaleString()} followers`
                                : '—'}
                            </div>
                            <div className="text-slate-500">{lead.city || lead.country || ''}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-300 capitalize">
                              {lead.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteLead(lead.id)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                              title="Delete lead"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {total > pageSize && (
            <Pagination
              currentPage={page}
              totalItems={total}
              pageSize={pageSize}
              onPageChange={(p) => {
                setPage(p);
                fetchLeads(p, pageSize);
              }}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
                fetchLeads(1, size);
              }}
            />
          )}
        </main>
      </div>

      {/* Add Single Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="add-ig-lead-title">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="add-ig-lead-title" className="text-sm font-semibold text-slate-100">Add Instagram Lead</h2>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateLead} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ig-lead-handle" className="block text-xs text-slate-300 mb-1">Instagram Handle or URL</label>
                  <input
                    id="ig-lead-handle"
                    type="text"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={leadForm.instagram_handle}
                    onChange={(e) => setLeadForm({ ...leadForm, instagram_handle: e.target.value })}
                    placeholder="@brandname or instagram.com/..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="ig-lead-name" className="block text-xs text-slate-300 mb-1">Full Name</label>
                  <input
                    id="ig-lead-name"
                    type="text"
                    value={leadForm.full_name}
                    onChange={(e) => setLeadForm({ ...leadForm, full_name: e.target.value })}
                    placeholder="Alex Rivera"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ig-lead-company" className="block text-xs text-slate-300 mb-1">Company / Brand</label>
                  <input
                    id="ig-lead-company"
                    type="text"
                    value={leadForm.company}
                    onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })}
                    placeholder="Glow Studio"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="ig-lead-niche" className="block text-xs text-slate-300 mb-1">Niche / Category</label>
                  <input
                    id="ig-lead-niche"
                    type="text"
                    value={leadForm.niche}
                    onChange={(e) => setLeadForm({ ...leadForm, niche: e.target.value })}
                    placeholder="Skincare / SaaS / Fitness"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="ig-lead-followers" className="block text-xs text-slate-300 mb-1">Followers</label>
                  <input
                    id="ig-lead-followers"
                    type="number"
                    value={leadForm.followers_count}
                    onChange={(e) => setLeadForm({ ...leadForm, followers_count: e.target.value })}
                    placeholder="12500"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="ig-lead-city" className="block text-xs text-slate-300 mb-1">City</label>
                  <input
                    id="ig-lead-city"
                    type="text"
                    value={leadForm.city}
                    onChange={(e) => setLeadForm({ ...leadForm, city: e.target.value })}
                    placeholder="Austin"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="ig-lead-group" className="block text-xs text-slate-300 mb-1">IG Group</label>
                  <select
                    id="ig-lead-group"
                    value={leadForm.group_id}
                    onChange={(e) => setLeadForm({ ...leadForm, group_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  >
                    <option value="">None</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="ig-lead-bio" className="block text-xs text-slate-300 mb-1">Instagram Bio / Details</label>
                <textarea
                  id="ig-lead-bio"
                  rows={2}
                  value={leadForm.bio}
                  onChange={(e) => setLeadForm({ ...leadForm, bio: e.target.value })}
                  placeholder="Bio snippet, positioning, or what they sell..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="ig-lead-hook" className="block text-xs text-slate-300 mb-1">Personalization Hook / Notes</label>
                <input
                  id="ig-lead-hook"
                  type="text"
                  value={leadForm.personalization_hook}
                  onChange={(e) => setLeadForm({ ...leadForm, personalization_hook: e.target.value })}
                  placeholder="Specific detail for AI DM personalization"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-300">Cancel</button>
                <button type="submit" disabled={submittingLead} className="px-4 py-1.5 rounded-lg text-xs bg-fuchsia-600 text-white font-medium disabled:opacity-50">
                  {submittingLead ? 'Saving...' : 'Save Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Paste Handles Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-ig-title">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="bulk-ig-title" className="text-sm font-semibold text-slate-100">Paste Instagram Handles</h2>
              <button type="button" onClick={() => setShowBulkModal(false)} className="text-slate-400 hover:text-slate-200"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleBulkHandlesSubmit} className="space-y-3">
              <div>
                <label htmlFor="bulk-handles-text" className="block text-xs text-slate-300 mb-1">
                  Handles or Instagram Profile URLs (one per line or comma-separated)
                </label>
                <textarea
                  id="bulk-handles-text"
                  rows={6}
                  required
                  value={bulkHandlesText}
                  onChange={(e) => setBulkHandlesText(e.target.value)}
                  placeholder={'@founder_one\nhttps://www.instagram.com/brand_two/\ncreator.three'}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="bulk-group" className="block text-xs text-slate-300 mb-1">Assign to Group (optional)</label>
                <select
                  id="bulk-group"
                  value={bulkGroupId}
                  onChange={(e) => setBulkGroupId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                >
                  <option value="">No group</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowBulkModal(false)} className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-300">Cancel</button>
                <button type="submit" disabled={submittingBulk} className="px-4 py-1.5 rounded-lg text-xs bg-fuchsia-600 text-white font-medium disabled:opacity-50">
                  {submittingBulk ? 'Adding...' : 'Add Handles'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pull from Email Campaign / Group Modal */}
      {showBridgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="bridge-ig-title">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="bridge-ig-title" className="text-sm font-semibold text-slate-100">Pull Leads from Email Outreach</h2>
              <button type="button" onClick={() => setShowBridgeModal(false)} className="text-slate-400 hover:text-slate-200"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-400">
              Copies existing leads & their business context into your segregated Instagram Leads list so you can add Instagram handles without affecting email campaigns.
            </p>
            <form onSubmit={handleBridgeSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setBridgeMode('campaign')}
                  className={`py-1.5 rounded text-xs font-medium ${bridgeMode === 'campaign' ? 'bg-fuchsia-600 text-white' : 'text-slate-400'}`}
                >
                  Email Campaign
                </button>
                <button
                  type="button"
                  onClick={() => setBridgeMode('group')}
                  className={`py-1.5 rounded text-xs font-medium ${bridgeMode === 'group' ? 'bg-fuchsia-600 text-white' : 'text-slate-400'}`}
                >
                  Email Lead Group
                </button>
              </div>

              {bridgeMode === 'campaign' ? (
                <div>
                  <label htmlFor="bridge-campaign" className="block text-xs text-slate-300 mb-1">Select Email Campaign</label>
                  <select
                    id="bridge-campaign"
                    value={selectedEmailCampaignId}
                    onChange={(e) => setSelectedEmailCampaignId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  >
                    {emailCampaigns.length === 0 && <option value="">No email campaigns found</option>}
                    {emailCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label htmlFor="bridge-email-group" className="block text-xs text-slate-300 mb-1">Select Email Lead Group</label>
                  <select
                    id="bridge-email-group"
                    value={selectedEmailGroupId}
                    onChange={(e) => setSelectedEmailGroupId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  >
                    {emailGroups.length === 0 && <option value="">No email lead groups found</option>}
                    {emailGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="bridge-target-group" className="block text-xs text-slate-300 mb-1">Target IG Group (optional)</label>
                <select
                  id="bridge-target-group"
                  value={bridgeTargetGroupId}
                  onChange={(e) => setBridgeTargetGroupId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                >
                  <option value="">None</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowBridgeModal(false)} className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-300">Cancel</button>
                <button
                  type="submit"
                  disabled={bridging || (bridgeMode === 'campaign' ? !selectedEmailCampaignId : !selectedEmailGroupId)}
                  className="px-4 py-1.5 rounded-lg text-xs bg-fuchsia-600 text-white font-medium disabled:opacity-50"
                >
                  {bridging ? 'Loading...' : 'Load Leads into IG'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Groups Modal */}
      {showGroupsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="ig-groups-title">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="ig-groups-title" className="text-sm font-semibold text-slate-100">Instagram Lead Groups</h2>
              <button type="button" onClick={() => setShowGroupsModal(false)} className="text-slate-400 hover:text-slate-200"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreateGroup} className="flex gap-2">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="New group name..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
              />
              <button type="submit" className="px-3 py-1.5 rounded-lg bg-fuchsia-600 text-white text-xs font-medium">
                Create
              </button>
            </form>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {groups.map((g) => (
                <div key={g.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                  <div>
                    <div className="font-medium text-slate-200">{g.name}</div>
                    <div className="text-[11px] text-slate-500">{g.leads_count ?? 0} leads</div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/instagram/lead-groups/${g.id}`, { method: 'DELETE' });
                      fetchGroups();
                    }}
                    className="p-1 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {groups.length === 0 && <div className="text-xs text-slate-500 text-center py-4">No groups yet.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
