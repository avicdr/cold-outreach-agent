'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { Pagination } from '@/components/Pagination';
import { Campaign, CampaignLead, EmailMessage, Lead } from '@/types/database';
import {
  Sparkles,
  Send,
  Play,
  Pause,
  XCircle,
  Clock,
  Users,
  CheckCircle2,
  FileEdit,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  Plus,
  Zap,
  Sliders,
} from 'lucide-react';
import { Suspense } from 'react';

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Loading campaign...</div>}>
      <CampaignDetailInner params={params} />
    </Suspense>
  );
}

function CampaignDetailInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<CampaignLead[]>([]);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [allAvailableLeads, setAllAvailableLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [messageNotice, setMessageNotice] = useState<string | null>(null);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsPageSize, setLeadsPageSize] = useState(10);
  const [modalPage, setModalPage] = useState(1);
  const [modalPageSize, setModalPageSize] = useState(10);
  const [modalSearch, setModalSearch] = useState('');
  const [leadGroups, setLeadGroups] = useState<any[]>([]);
  const [modalGroupFilter, setModalGroupFilter] = useState('');

  const isWindowActive = (() => {
    if (!campaign?.sending_config) return false;
    try {
      const tz = campaign.sending_config.timezone || 'Europe/London';
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        hour: 'numeric',
        hour12: false,
      }).formatToParts(new Date());
      const weekdayStr = parts.find((p) => p.type === 'weekday')?.value;
      const hourStr = parts.find((p) => p.type === 'hour')?.value;
      const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const currentDay = weekdayStr ? dayMap[weekdayStr] : new Date().getUTCDay();
      const currentHour = hourStr ? parseInt(hourStr, 10) : new Date().getUTCHours();
      const allowedDays = campaign.sending_config.days || [1, 2, 3, 4, 5];
      const startHour = campaign.sending_config.start_hour ?? 9;
      const endHour = campaign.sending_config.end_hour ?? 17;
      return allowedDays.includes(currentDay) && currentHour >= startHour && currentHour < endHour;
    } catch {
      return false;
    }
  })();

  const fetchCampaignData = async () => {
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      const data = await res.json();
      if (res.ok) {
        setCampaign(data.campaign);
        setLeads(data.leads || []);
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to fetch campaign:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableLeads = async () => {
    try {
      const [leadsRes, groupsRes] = await Promise.all([
        fetch('/api/leads?limit=1000'),
        fetch('/api/lead-groups'),
      ]);
      const leadsData = await leadsRes.json();
      const groupsData = await groupsRes.json();
      if (leadsRes.ok) {
        setAllAvailableLeads(leadsData.leads || []);
      }
      if (groupsRes.ok && Array.isArray(groupsData)) {
        setLeadGroups(groupsData);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCampaignData();
    loadAvailableLeads();
  }, [id]);

  const handleGenerateDrafts = async () => {
    setActionLoading(true);
    setMessageNotice(null);
    try {
      const res = await fetch(`/api/campaigns/${id}/generate`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessageNotice(`Generated ${data.generated_count} personalized email draft(s)!`);
        fetchCampaignData();
      } else {
        setMessageNotice(`Error: ${data.error}`);
      }
    } catch {
      setMessageNotice('Draft generation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivateCampaign = async () => {
    setActionLoading(true);
    setShowActivateConfirm(false);
    setMessageNotice(null);
    try {
      const res = await fetch(`/api/campaigns/${id}/activate`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessageNotice(`Campaign activated! Enqueued ${data.enqueued_sends} messages for sending.`);
        fetchCampaignData();
      } else {
        setMessageNotice(`Failed to activate: ${data.error}`);
      }
    } catch {
      setMessageNotice('Activation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePauseResume = async () => {
    if (!campaign) return;
    setActionLoading(true);
    const action = campaign.status === 'active' ? 'pause' : 'resume';
    try {
      const res = await fetch(`/api/campaigns/${id}/${action}`, { method: 'POST' });
      if (res.ok) {
        fetchCampaignData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleProcessQueueNow = async (force = false) => {
    setDispatching(true);
    setMessageNotice(null);
    try {
      const res = await fetch(`/api/jobs/process${force ? '?force=true' : ''}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const completed = (data.results || []).filter((r: any) => r.status === 'completed').length;
        const failed = (data.results || []).filter((r: any) => r.status === 'failed').length;
        if (data.processed > 0) {
          setMessageNotice(`Queue dispatch complete: ${data.processed} email(s) processed (${completed} sent, ${failed} failed).`);
        } else if (data.queue_status?.total_queued > 0) {
          const nextDate = new Date(data.queue_status.next_run_at);
          setMessageNotice(
            `0 emails sent right now: All ${data.queue_status.total_queued} emails are scheduled for your sending window starting ${nextDate.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} (${campaign?.sending_config?.timezone || 'Europe/London'}). To send immediately outside business hours, click "Force Send".`
          );
        } else {
          setMessageNotice('Queue dispatch complete: 0 jobs currently waiting in queue.');
        }
        fetchCampaignData();
      } else {
        setMessageNotice(`Queue dispatch failed: ${data.error}`);
      }
    } catch {
      setMessageNotice('Error triggering queue processor.');
    } finally {
      setDispatching(false);
    }
  };

  const handleEnrollSelectedLeads = async () => {
    if (selectedLeadIds.length === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: selectedLeadIds }),
      });
      if (res.ok) {
        setShowEnrollModal(false);
        setSelectedLeadIds([]);
        fetchCampaignData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-slate-950 text-slate-100">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center text-slate-500">Loading campaign...</div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex min-h-screen bg-slate-950 text-slate-100">
        <Sidebar />
        <div className="flex-1 p-8 text-center text-slate-400">Campaign not found.</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={campaign.name}
          subtitle={`Status: ${campaign.status.toUpperCase()}`}
          category="Campaign Details"
        >
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Link
              href={`/campaigns/${campaign.id}/edit`}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/90 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-100 transition-colors shadow-sm shrink-0 whitespace-nowrap"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="hidden sm:inline">Edit Configuration</span>
              <span className="sm:hidden">Edit</span>
            </Link>
            {campaign.status === 'draft' && (
              <button
                onClick={() => setShowActivateConfirm(true)}
                disabled={actionLoading || leads.length === 0}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/30 transition-colors disabled:opacity-50 shrink-0 whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Activate Campaign</span>
                <span className="sm:hidden">Activate</span>
              </button>
            )}

            {(campaign.status === 'active' || campaign.status === 'paused') && (
              <button
                onClick={handlePauseResume}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors shrink-0 whitespace-nowrap"
              >
                {campaign.status === 'active' ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="hidden sm:inline">Pause Campaign</span>
                    <span className="sm:hidden">Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="hidden sm:inline">Resume Campaign</span>
                    <span className="sm:hidden">Resume</span>
                  </>
                )}
              </button>
            )}

            {campaign.status === 'active' && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => handleProcessQueueNow(false)}
                  disabled={actionLoading || dispatching}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-600/30 transition-colors disabled:opacity-50 shrink-0 whitespace-nowrap"
                  title="Process next batch of queued email sends due now"
                >
                  <Send className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden md:inline">{dispatching ? 'Dispatching...' : 'Dispatch Queue Now'}</span>
                  <span className="md:hidden">{dispatching ? '...' : 'Dispatch'}</span>
                </button>

                <button
                  onClick={() => {
                    if (confirm('Force dispatch the next queued email immediately, bypassing scheduled sending hours?')) {
                      handleProcessQueueNow(true);
                    }
                  }}
                  disabled={actionLoading || dispatching}
                  className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors disabled:opacity-50 shrink-0 whitespace-nowrap"
                  title="Force send next queued email immediately outside business hours"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Force Send Now</span>
                </button>
              </div>
            )}

            <button
              onClick={handleGenerateDrafts}
              disabled={actionLoading || leads.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-colors disabled:opacity-50 shrink-0 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{actionLoading ? 'Generating...' : 'Generate AI Drafts'}</span>
              <span className="sm:hidden">{actionLoading ? '...' : 'Drafts'}</span>
            </button>
          </div>
        </Header>

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto min-w-0">
          {messageNotice && (
            <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-center justify-between">
              <span>{messageNotice}</span>
              <button onClick={() => setMessageNotice(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
          )}

          {/* Campaign Parameters & Schedule Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 p-5 rounded-xl border border-slate-800 bg-slate-900/30 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Value Proposition & Offer</h3>
                <Link
                  href={`/campaigns/${campaign.id}/edit`}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                >
                  <Sliders className="w-3 h-3" />
                  <span>Edit Config</span>
                </Link>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{campaign.offer || 'No offer specified'}</p>
              <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs text-slate-400">
                <div><span className="text-slate-500">Target ICP:</span> {campaign.ideal_customer_profile || 'Any'}</div>
                <div><span className="text-slate-500">CTA:</span> {campaign.call_to_action || 'Call'}</div>
              </div>
            </div>

            <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/30 space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <span>Sending Schedule</span>
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  isWindowActive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  {isWindowActive ? '● Window Open' : '🌙 Outside Window'}
                </span>
              </h3>
              <div className="text-xs space-y-1.5 text-slate-400">
                <div className="flex justify-between">
                  <span>Outreach Group:</span>
                  <span className="text-indigo-300 font-medium truncate max-w-[150px]">
                    {campaign.account_group ? campaign.account_group.name : 'All Active Inboxes'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Daily Cap:</span>
                  <span className="text-slate-200 font-medium">{campaign.sending_config?.daily_limit || 18} emails / day</span>
                </div>
                <div className="flex justify-between">
                  <span>Inbox Guard:</span>
                  <span className="text-emerald-400 font-medium">≤18 / day • ~15m cooldown</span>
                </div>
                <div className="flex justify-between">
                  <span>Sending Window:</span>
                  <span className="text-slate-200 font-medium">
                    {campaign.sending_config?.start_hour || 9}:00 - {campaign.sending_config?.end_hour || 17}:00
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Timezone:</span>
                  <span className="text-slate-200 font-mono text-[11px]">{campaign.sending_config?.timezone || 'Europe/London'}</span>
                </div>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span>Dispatch Schedule:</span>
                  <span className="text-slate-300 font-medium">
                    {isWindowActive ? 'Active (Throttled 4/hr)' : `Tomorrow at 09:00 ${campaign.sending_config?.timezone?.split('/')[1] || 'UK'}`}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-end">
                  <Link
                    href={`/campaigns/${campaign.id}/edit`}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>Edit Schedule & Limits</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Enrolled Leads & Generated Drafts List */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden space-y-0">
            <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Enrolled Prospects ({leads.length})</h3>
                <p className="text-xs text-slate-400">Personalized drafts and sequence progress for each prospect</p>
              </div>
              <button
                onClick={() => setShowEnrollModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Enroll Leads
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3 font-medium">Prospect</th>
                    <th className="px-5 py-3 font-medium">Company</th>
                    <th className="px-5 py-3 font-medium">Enrollment Status</th>
                    <th className="px-5 py-3 font-medium">Step</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                        No leads enrolled yet. Click "Enroll Leads" to add prospects to this campaign.
                      </td>
                    </tr>
                  ) : (
                    leads.slice((leadsPage - 1) * leadsPageSize, leadsPage * leadsPageSize).map((cl) => {
                      const msg = messages.find((m) => m.campaign_lead_id === cl.id && m.step_number === cl.current_step);
                      return (
                        <tr key={cl.id} className="hover:bg-slate-900/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="font-medium text-slate-200">
                              {cl.lead?.first_name || cl.lead?.last_name ? `${cl.lead?.first_name} ${cl.lead?.last_name}`.trim() : 'Prospect'}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">{cl.lead?.email}</div>
                          </td>
                          <td className="px-5 py-3.5 text-slate-300">{cl.lead?.company || '—'}</td>
                          <td className="px-5 py-3.5">
                            {msg?.status === 'sent' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                                <CheckCircle2 className="w-3 h-3" /> Sent
                              </span>
                            ) : msg?.status === 'scheduled' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                                <Clock className="w-3 h-3" /> Scheduled
                              </span>
                            ) : msg?.status === 'draft' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60">
                                <FileEdit className="w-3 h-3" /> Drafted
                              </span>
                            ) : msg?.status === 'failed' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                <XCircle className="w-3 h-3" /> Failed
                              </span>
                            ) : (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 capitalize">
                                {cl.status}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-slate-400">Step {cl.current_step}</td>
                          <td className="px-5 py-3.5 text-right">
                            {msg ? (
                              <Link
                                href={`/campaigns/${campaign.id}/editor?messageId=${msg.id}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 text-xs font-medium"
                              >
                                <FileEdit className="w-3 h-3" />
                                <span>{msg.status === 'sent' ? 'View Sent' : 'Edit Draft'}</span>
                              </Link>
                            ) : (
                              <span className="text-[11px] text-slate-500 italic">No draft generated</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Enrolled Prospects Pagination */}
            {leads.length > 0 && (
              <div className="p-3 border-t border-slate-800">
                <Pagination
                  currentPage={leadsPage}
                  totalItems={leads.length}
                  pageSize={leadsPageSize}
                  pageSizeOptions={[5, 10, 25, 50]}
                  itemName="enrolled prospects"
                  onPageChange={(newPage) => setLeadsPage(newPage)}
                  onPageSizeChange={(newSize) => {
                    setLeadsPageSize(newSize);
                    setLeadsPage(1);
                  }}
                />
              </div>
            )}
          </div>
        </main>

        {/* Enroll Leads Modal */}
        {showEnrollModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Enroll Leads into Campaign</h3>
                <button onClick={() => setShowEnrollModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  placeholder="Search available leads..."
                  value={modalSearch}
                  onChange={(e) => {
                    setModalSearch(e.target.value);
                    setModalPage(1);
                  }}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <select
                  value={modalGroupFilter}
                  onChange={(e) => {
                    setModalGroupFilter(e.target.value);
                    setModalPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">All Lead Groups</option>
                  <option value="ungrouped">Ungrouped</option>
                  {leadGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.leads_count ?? 0})
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const unenrolled = allAvailableLeads.filter((l) => !leads.some((cl) => cl.lead_id === l.id));
                let filtered = modalSearch.trim()
                  ? unenrolled.filter(
                      (l) =>
                        l.email.toLowerCase().includes(modalSearch.toLowerCase()) ||
                        `${l.first_name} ${l.last_name}`.toLowerCase().includes(modalSearch.toLowerCase()) ||
                        l.company.toLowerCase().includes(modalSearch.toLowerCase())
                    )
                  : unenrolled;

                if (modalGroupFilter) {
                  if (modalGroupFilter === 'ungrouped') {
                    filtered = filtered.filter((l) => !l.group_id);
                  } else {
                    filtered = filtered.filter((l) => l.group_id === modalGroupFilter);
                  }
                }

                const paged = filtered.slice((modalPage - 1) * modalPageSize, modalPage * modalPageSize);

                return (
                  <>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                      <span>Available: {filtered.length} leads</span>
                      {filtered.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const ids = filtered.map((l) => l.id);
                            const allSelected = ids.every((id) => selectedLeadIds.includes(id));
                            if (allSelected) {
                              setSelectedLeadIds(selectedLeadIds.filter((id) => !ids.includes(id)));
                            } else {
                              setSelectedLeadIds(Array.from(new Set([...selectedLeadIds, ...ids])));
                            }
                          }}
                          className="text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          {filtered.every((l) => selectedLeadIds.includes(l.id))
                            ? 'Deselect visible'
                            : `Select all visible (${filtered.length})`}
                        </button>
                      )}
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2 text-xs divide-y divide-slate-800">
                      {paged.length === 0 ? (
                        <div className="py-6 text-center text-slate-500">
                          {filtered.length === 0 ? 'No available leads found.' : 'No leads on this page.'}
                        </div>
                      ) : (
                        paged.map((lead) => {
                          const isChecked = selectedLeadIds.includes(lead.id);
                          return (
                            <label key={lead.id} className="pt-2 flex items-center justify-between cursor-pointer hover:bg-slate-800/40 p-2 rounded">
                              <div>
                                <div className="font-medium text-slate-200">{lead.first_name} {lead.last_name} ({lead.company || 'No Company'})</div>
                                <div className="text-[11px] text-slate-400">{lead.email}</div>
                              </div>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedLeadIds([...selectedLeadIds, lead.id]);
                                  else setSelectedLeadIds(selectedLeadIds.filter((id) => id !== lead.id));
                                }}
                                className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                              />
                            </label>
                          );
                        })
                      )}
                    </div>

                    {filtered.length > 0 && (
                      <Pagination
                        currentPage={modalPage}
                        totalItems={filtered.length}
                        pageSize={modalPageSize}
                        pageSizeOptions={[5, 10, 20]}
                        itemName="leads"
                        onPageChange={(newPage) => setModalPage(newPage)}
                        onPageSizeChange={(newSize) => {
                          setModalPageSize(newSize);
                          setModalPage(1);
                        }}
                      />
                    )}
                  </>
                );
              })()}

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <span className="text-xs text-slate-400">{selectedLeadIds.length} lead(s) selected</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowEnrollModal(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEnrollSelectedLeads}
                    disabled={selectedLeadIds.length === 0}
                    className="px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50"
                  >
                    Enroll Leads
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Activation Confirmation Dialog */}
        {showActivateConfirm && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center gap-3 text-emerald-400">
                <Play className="w-6 h-6" />
                <h3 className="text-base font-bold text-white">Activate Cold Outreach Campaign</h3>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 text-xs space-y-2 text-slate-300">
                <div className="font-semibold text-slate-200">Pre-Flight Outreach Safeguards:</div>
                <p>• Sending will only occur during your configured window ({campaign.sending_config?.start_hour}:00 - {campaign.sending_config?.end_hour}:00).</p>
                <p>• Daily volume is capped at {campaign.sending_config?.daily_limit} emails.</p>
                <p>• Every email includes RFC 8058 one-click unsubscribe headers.</p>
                <p>• Follow-ups stop immediately when a reply or opt-out is detected.</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowActivateConfirm(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleActivateCampaign}
                  className="px-4 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-sm shadow-emerald-600/30"
                >
                  Confirm & Activate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
