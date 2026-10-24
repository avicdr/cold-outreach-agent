'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { Pagination } from '@/components/Pagination';
import { Lead, LeadGroup } from '@/types/database';
import {
  Search,
  Upload,
  Folder,
  FolderPlus,
  Layers,
  Edit2,
  Trash2,
  X,
  Plus,
  Users,
  CheckCircle,
  Clock,
  MessageSquare,
  Ban,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Loading leads...</div>}>
      <LeadsPageInner />
    </Suspense>
  );
}

function LeadsPageInner() {
  const searchParams = useSearchParams();
  const initialGroupId = searchParams.get('groupId') || searchParams.get('group_id') || '';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [groups, setGroups] = useState<LeadGroup[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState(initialGroupId);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Group Management Modal State
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [editingGroup, setEditingGroup] = useState<LeadGroup | null>(null);
  const [groupActionLoading, setGroupActionLoading] = useState(false);
  const [groupActionError, setGroupActionError] = useState<string | null>(null);

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/lead-groups');
      const data = await res.json();
      if (Array.isArray(data)) {
        setGroups(data);
      }
    } catch (err) {
      console.error('Failed to fetch lead groups:', err);
    }
  };

  const fetchLeads = (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (groupFilter) params.set('group_id', groupFilter);
    params.set('page', String(targetPage));
    params.set('limit', String(targetPageSize));

    fetch(`/api/leads?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setLeads(Array.isArray(data?.leads) ? data.leads : []);
        setTotal(typeof data?.total === 'number' ? data.total : 0);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch leads:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    setPage(1);
    fetchLeads(1, pageSize);
  }, [statusFilter, groupFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLeads(1, pageSize);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setGroupActionLoading(true);
    setGroupActionError(null);

    try {
      const res = await fetch('/api/lead-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create group');

      setNewGroupName('');
      setNewGroupDesc('');
      await fetchGroups();
    } catch (err: any) {
      setGroupActionError(err.message || 'Failed to create group');
    } finally {
      setGroupActionLoading(false);
    }
  };

  const handleUpdateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup || !editingGroup.name.trim()) return;

    setGroupActionLoading(true);
    setGroupActionError(null);

    try {
      const res = await fetch(`/api/lead-groups/${editingGroup.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingGroup.name.trim(),
          description: editingGroup.description.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update group');

      setEditingGroup(null);
      await fetchGroups();
      fetchLeads(page, pageSize);
    } catch (err: any) {
      setGroupActionError(err.message || 'Failed to update group');
    } finally {
      setGroupActionLoading(false);
    }
  };

  const handleDeleteGroup = async (group: LeadGroup) => {
    if (!confirm(`Are you sure you want to delete "${group.name}"? The leads will remain active as ungrouped.`)) return;

    setGroupActionLoading(true);
    setGroupActionError(null);

    try {
      const res = await fetch(`/api/lead-groups/${group.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete group');
      }

      if (groupFilter === group.id) {
        setGroupFilter('');
      }

      await fetchGroups();
      fetchLeads(page, pageSize);
    } catch (err: any) {
      setGroupActionError(err.message || 'Failed to delete group');
    } finally {
      setGroupActionLoading(false);
    }
  };

  const getStatusBadge = (status: Lead['status']) => {
    switch (status) {
      case 'active':
        return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle className="w-3 h-3" /> Active</span>;
      case 'contacted':
        return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20"><Clock className="w-3 h-3" /> Contacted</span>;
      case 'replied':
        return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20"><MessageSquare className="w-3 h-3" /> Replied</span>;
      case 'unsubscribed':
        return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20"><Ban className="w-3 h-3" /> Opted Out</span>;
      case 'bounced':
        return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"><AlertCircle className="w-3 h-3" /> Bounced</span>;
      default:
        return <span className="text-xs text-slate-400">{status}</span>;
    }
  };

  const selectedGroupObj = groups.find((g) => g.id === groupFilter);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Leads & Prospects"
          subtitle={
            selectedGroupObj
              ? `Filtered by Group: ${selectedGroupObj.name} (${total} leads)`
              : groupFilter === 'ungrouped'
              ? `Filtered: Ungrouped Leads (${total} leads)`
              : `Total prospects loaded: ${total} across ${groups.length} groups`
          }
        >
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowGroupsModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-colors shrink-0"
            >
              <Folder className="w-3.5 h-3.5 text-indigo-400" />
              <span>Lead Groups ({groups.length})</span>
            </button>
            <Link
              href="/leads/import"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-colors shrink-0 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Import Leads Wizard</span>
              <span className="sm:hidden">Import Leads</span>
            </Link>
          </div>
        </Header>

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto min-w-0">
          {/* Active Filter Banner if filtered by group */}
          {groupFilter && (
            <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-slate-300">
                  Showing leads in group:{' '}
                  <strong className="text-white font-semibold">
                    {selectedGroupObj ? selectedGroupObj.name : 'Ungrouped Leads'}
                  </strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setGroupFilter('')}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
              >
                <span>Clear group filter</span>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-900/40 p-4 rounded-xl border border-slate-800">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2 w-full max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search name, email, company..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                Search
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
              {/* Group Filter Dropdown */}
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="">All Lead Groups</option>
                <option value="ungrouped">Ungrouped Leads</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.leads_count ?? 0})
                  </option>
                ))}
              </select>

              {/* Status Filter Dropdown */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="">All Statuses</option>
                <option value="active">Active (Eligible)</option>
                <option value="contacted">Contacted</option>
                <option value="replied">Replied</option>
                <option value="unsubscribed">Opted Out</option>
                <option value="bounced">Bounced</option>
              </select>
            </div>
          </div>

          {/* Leads Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3 font-medium">Business / Prospect</th>
                    <th className="px-5 py-3 font-medium">Lead Group</th>
                    <th className="px-5 py-3 font-medium">Contact & Location</th>
                    <th className="px-5 py-3 font-medium">Rating & Reviews</th>
                    <th className="px-5 py-3 font-medium">Personalization Hook</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                          <span>Loading leads...</span>
                        </div>
                      </td>
                    </tr>
                  ) : leads.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                        <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="text-sm font-medium text-slate-300">No leads found</p>
                        <p className="text-xs text-slate-500 mt-1">Upload a CSV or Excel spreadsheet into a group using the Import Wizard.</p>
                        <Link
                          href="/leads/import"
                          className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white"
                        >
                          <Upload className="w-3.5 h-3.5" /> Import Leads
                        </Link>
                      </td>
                    </tr>
                  ) : (
                    leads.map((lead) => {
                      const businessName = lead.company || lead.custom_fields?.['Business_Name'] || '—';
                      const category = lead.category || lead.custom_fields?.['Category_Niche'] || '';
                      const city = lead.city || lead.custom_fields?.['City_Area'] || '';
                      const country = lead.country || lead.custom_fields?.['Country'] || '';
                      const rating = lead.rating || lead.custom_fields?.['Google_Rating'];
                      const reviews = lead.review_count || lead.custom_fields?.['Google_Review_Count'];
                      const score = lead.qualification_score || lead.custom_fields?.['Lead_Qualification_Score'];
                      const hook = lead.suggested_opening || lead.sales_angle || lead.custom_fields?.['Cold_Email_Personalization_Hook'] || '';

                      return (
                        <tr key={lead.id} className="hover:bg-slate-900/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-slate-100 flex items-center gap-2">
                              <span>{String(businessName)}</span>
                              {category && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                                  {String(category)}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {lead.first_name || lead.last_name
                                ? `${lead.first_name} ${lead.last_name}`.trim()
                                : lead.job_title || 'Direct Profile'}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            {lead.lead_group ? (
                              <button
                                type="button"
                                onClick={() => setGroupFilter(lead.group_id || '')}
                                className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20 hover:bg-violet-500/20 transition-colors max-w-[140px] truncate"
                                title={`Filter by group: ${lead.lead_group.name}`}
                              >
                                <Folder className="w-2.5 h-2.5 text-violet-400 shrink-0" />
                                <span className="truncate">{lead.lead_group.name}</span>
                              </button>
                            ) : (
                              <span className="text-slate-600 text-[11px]">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="text-[11px] text-slate-300 font-mono">{lead.email}</div>
                            {(city || country) && (
                              <div className="text-[11px] text-slate-500">
                                {[city, country].filter(Boolean).join(', ')}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            {rating || reviews ? (
                              <div className="space-y-0.5">
                                <div className="text-amber-400 font-medium text-[11px] flex items-center gap-1">
                                  <span>★</span>
                                  <span>{rating || '5.0'}</span>
                                  <span className="text-slate-400 font-normal">({reviews || 0} reviews)</span>
                                </div>
                                {score && (
                                  <div className="text-[10px] text-emerald-400 font-mono">
                                    Fit: {score}/100
                                  </div>
                                )}
                              </div>
                            ) : score ? (
                              <span className="text-[11px] text-emerald-400 font-mono">Fit: {score}/100</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 max-w-xs">
                            {hook ? (
                              <div className="text-[11px] text-slate-300 line-clamp-2" title={String(hook)}>
                                {String(hook)}
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">{getStatusBadge(lead.status)}</td>
                          <td className="px-5 py-3.5 text-slate-500 text-[11px]">
                            {new Date(lead.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {total > 0 && (
            <Pagination
              currentPage={page}
              totalItems={total}
              pageSize={pageSize}
              itemName="leads"
              onPageChange={(newPage) => {
                setPage(newPage);
                fetchLeads(newPage, pageSize);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
                fetchLeads(1, newSize);
              }}
            />
          )}
        </main>

        {/* Lead Groups Management Modal */}
        {showGroupsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                    <Folder className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-white">Manage Lead Groups</h2>
                    <p className="text-xs text-slate-400">Organize, rename, or inspect your prospect groups</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowGroupsModal(false);
                    setEditingGroup(null);
                    setGroupActionError(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {groupActionError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{groupActionError}</span>
                </div>
              )}

              {/* Create or Edit Group Form */}
              <form
                onSubmit={editingGroup ? handleUpdateGroup : handleCreateGroup}
                className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-950/10 space-y-3"
              >
                <div className="text-xs font-semibold text-white flex items-center gap-2">
                  <FolderPlus className="w-4 h-4 text-indigo-400" />
                  <span>{editingGroup ? `Edit Group: ${editingGroup.name}` : 'Create New Lead Group'}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Group Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Q4 SaaS Founders"
                      value={editingGroup ? editingGroup.name : newGroupName}
                      onChange={(e) =>
                        editingGroup
                          ? setEditingGroup({ ...editingGroup, name: e.target.value })
                          : setNewGroupName(e.target.value)
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Description (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. High-ticket enterprise decision makers"
                      value={editingGroup ? editingGroup.description : newGroupDesc}
                      onChange={(e) =>
                        editingGroup
                          ? setEditingGroup({ ...editingGroup, description: e.target.value })
                          : setNewGroupDesc(e.target.value)
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  {editingGroup && (
                    <button
                      type="button"
                      onClick={() => setEditingGroup(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={groupActionLoading}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 disabled:opacity-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{editingGroup ? 'Save Changes' : 'Create Group'}</span>
                  </button>
                </div>
              </form>

              {/* Existing Groups List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold uppercase tracking-wider text-[11px]">Existing Groups ({groups.length})</span>
                  <span>Click a group to view its leads</span>
                </div>

                {groups.length === 0 ? (
                  <div className="p-8 text-center rounded-xl border border-slate-800 bg-slate-950/40 text-slate-500 text-xs">
                    <Folder className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-300 font-medium">No lead groups created yet</p>
                    <p className="mt-1">Create one using the form above or during the Lead Import Wizard.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-950/30 overflow-hidden">
                    {groups.map((group) => (
                      <div
                        key={group.id}
                        className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-900/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20">
                            <Folder className="w-4 h-4 text-indigo-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-white truncate">{group.name}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium shrink-0">
                                {group.leads_count ?? 0} leads
                              </span>
                            </div>
                            {group.description && (
                              <p className="text-[11px] text-slate-400 truncate mt-0.5">{group.description}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setGroupFilter(group.id);
                              setShowGroupsModal(false);
                            }}
                            className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                          >
                            View Leads
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingGroup(group)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Edit group"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(group)}
                            className="p-1.5 rounded-md text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                            title="Delete group"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
