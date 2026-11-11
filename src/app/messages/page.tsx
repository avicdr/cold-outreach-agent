'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { Pagination } from '@/components/Pagination';
import { EmailMessage, LeadGroup } from '@/types/database';
import {
  Mail,
  CheckCircle2,
  Clock,
  FileEdit,
  XCircle,
  Pause,
  Search,
  ExternalLink,
  RefreshCw,
  Users,
  ArrowUpDown,
  Send,
  X,
  Layers,
  Calendar,
  Play,
  RotateCw,
} from 'lucide-react';

function MessagesContent() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') || '';
  const initialCampaignId = searchParams.get('campaignId') || '';
  const initialLeadGroupId = searchParams.get('leadGroupId') || '';

  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [leadGroups, setLeadGroups] = useState<LeadGroup[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [workerNotice, setWorkerNotice] = useState<string | null>(null);

  // Filters state
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [campaignFilter, setCampaignFilter] = useState(initialCampaignId);
  const [leadGroupFilter, setLeadGroupFilter] = useState(initialLeadGroupId);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOption, setSortOption] = useState<
    'scheduled_at_asc' | 'scheduled_at_desc' | 'created_at_desc' | 'created_at_asc' | 'sent_at_desc'
  >('scheduled_at_asc');

  // Pagination state
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch campaigns and lead groups on mount
  useEffect(() => {
    fetch('/api/campaigns')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCampaigns(data);
        }
      })
      .catch((err) => console.error('Failed to load campaigns:', err));

    fetch('/api/lead-groups')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setLeadGroups(data);
        }
      })
      .catch((err) => console.error('Failed to load lead groups:', err));
  }, []);

  const fetchMessages = (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (campaignFilter) params.set('campaignId', campaignFilter);
    if (leadGroupFilter) params.set('leadGroupId', leadGroupFilter);
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

    const [sortBy, sortOrder] = sortOption.startsWith('scheduled_at')
      ? ['scheduled_at', sortOption.endsWith('desc') ? 'desc' : 'asc']
      : sortOption.startsWith('sent_at')
      ? ['sent_at', 'desc']
      : ['created_at', sortOption.endsWith('asc') ? 'asc' : 'desc'];

    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    params.set('page', String(targetPage));
    params.set('limit', String(targetPageSize));

    fetch(`/api/messages?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setMessages(Array.isArray(data) ? data : data.messages || []);
        setTotal(typeof data?.total === 'number' ? data.total : Array.isArray(data) ? data.length : 0);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch messages:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    setPage(1);
    fetchMessages(1, pageSize);
  }, [statusFilter, campaignFilter, leadGroupFilter, debouncedSearch, sortOption]);

  const handleRunWorkerAndReconcile = async () => {
    setIsProcessingQueue(true);
    setWorkerNotice(null);
    try {
      const res = await fetch('/api/jobs/process', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const parts = [];
        if (data.reconciled > 0) parts.push(`reconciled ${data.reconciled} message(s)`);
        if (data.processed > 0) parts.push(`processed ${data.processed} job(s)`);
        if (data.warmup_sent > 0) parts.push(`sent ${data.warmup_sent} warmup email(s)`);
        if (parts.length === 0) parts.push('all queues up to date and healthy');
        setWorkerNotice(`Worker executed: ${parts.join(', ')}`);
        fetchMessages(page, pageSize);
      } else {
        setWorkerNotice(`Worker error: ${data.error || 'Failed'}`);
      }
    } catch {
      setWorkerNotice('Failed to connect to queue worker');
    } finally {
      setIsProcessingQueue(false);
      setTimeout(() => setWorkerNotice(null), 5000);
    }
  };

  const getStatusBadge = (status: EmailMessage['status']) => {
    switch (status) {
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#63C7A2]/10 text-[#63C7A2] border border-[#63C7A2]/30">
            <CheckCircle2 className="w-3 h-3" /> Sent
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <Clock className="w-3 h-3" /> Scheduled
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Pause className="w-3 h-3" /> Paused
          </span>
        );
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-surface-elevated text-text-muted border border-border-subtle">
            <FileEdit className="w-3 h-3" /> Draft
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        );
      default:
        return <span className="text-xs text-text-muted">{status}</span>;
    }
  };

  return (
    <div className="flex min-h-screen bg-obsidian text-text-primary">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Messages"
          subtitle="History of sent, scheduled, and generated outreach messages"
          category="Personalization Engine"
        />

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto min-w-0">
          {/* Top Metric Strip / Queue Notice */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-charcoal p-4 rounded-2xl border border-border-subtle">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#E84B2C]/10 border border-[#E84B2C]/25 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-[#E87A38]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text-primary truncate">
                  Outreach Dispatch Engine
                </div>
                <div className="text-xs text-text-muted flex items-center gap-2 mt-0.5">
                  <span>Autonomous 60s background daemon</span>
                  <span>•</span>
                  <span className="font-mono text-[#63C7A2]">{total} total messages</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {workerNotice && (
                <span className="text-xs text-text-secondary bg-surface-elevated px-3 py-1.5 rounded-lg border border-border-subtle animate-fade-in font-mono">
                  {workerNotice}
                </span>
              )}
              <button
                type="button"
                onClick={handleRunWorkerAndReconcile}
                disabled={isProcessingQueue}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#E84B2C] hover:bg-[#d43f22] text-white shadow-[0_2px_12px_rgba(232,75,44,0.3)] transition-all disabled:opacity-50"
                title="Run queue worker and self-healing reconciliation immediately"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isProcessingQueue ? 'animate-spin' : ''}`} />
                <span>{isProcessingQueue ? 'Syncing...' : 'Sync & Reconcile'}</span>
              </button>
            </div>
          </div>

          {/* Filters Bar: Status Tabs + Search & Filters */}
          <div className="space-y-4">
            {/* Status Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-charcoal p-1.5 rounded-xl border border-border-subtle w-full sm:w-fit">
              {['', 'sent', 'scheduled', 'paused', 'draft', 'failed'].map((st) => (
                <button
                  key={st}
                  id={`tab-${st || 'all'}`}
                  onClick={() => {
                    setStatusFilter(st);
                    if (st === 'sent') {
                      setSortOption('sent_at_desc');
                    } else if (st === 'scheduled' || st === 'paused') {
                      setSortOption('scheduled_at_asc');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    statusFilter === st
                      ? 'bg-[#E84B2C] text-white shadow-[0_2px_10px_rgba(232,75,44,0.35)]'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                  }`}
                >
                  {st === '' ? 'All Messages' : st.charAt(0).toUpperCase() + st.slice(1)}
                </button>
              ))}
            </div>

            {/* Filter & Search Toolbar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-charcoal p-3 rounded-2xl border border-border-subtle">
              {/* Search Box */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search by lead name, email, company, or subject..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-elevated border border-border-subtle rounded-xl pl-10 pr-8 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#E84B2C] transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filters Dropdowns */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Campaign Filter */}
                <div className="flex items-center gap-1.5 bg-surface-elevated border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-primary">
                  <Layers className="w-3.5 h-3.5 text-[#E87A38] shrink-0" />
                  <select
                    value={campaignFilter}
                    onChange={(e) => setCampaignFilter(e.target.value)}
                    className="bg-transparent text-xs text-text-primary focus:outline-none cursor-pointer max-w-[180px] truncate"
                  >
                    <option value="" className="bg-charcoal text-text-primary">
                      All Campaigns
                    </option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id} className="bg-charcoal text-text-primary">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Lead Group Filter */}
                <div className="flex items-center gap-1.5 bg-surface-elevated border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-primary">
                  <Users className="w-3.5 h-3.5 text-[#E87A38] shrink-0" />
                  <select
                    value={leadGroupFilter}
                    onChange={(e) => setLeadGroupFilter(e.target.value)}
                    className="bg-transparent text-xs text-text-primary focus:outline-none cursor-pointer max-w-[180px] truncate"
                  >
                    <option value="" className="bg-charcoal text-text-primary">
                      All Lead Groups
                    </option>
                    {leadGroups.map((lg) => (
                      <option key={lg.id} value={lg.id} className="bg-charcoal text-text-primary">
                        {lg.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort Filter */}
                <div className="flex items-center gap-1.5 bg-surface-elevated border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-primary">
                  <ArrowUpDown className="w-3.5 h-3.5 text-[#E87A38] shrink-0" />
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as any)}
                    className="bg-transparent text-xs text-text-primary focus:outline-none cursor-pointer"
                  >
                    {statusFilter !== 'sent' && (
                      <>
                        <option value="scheduled_at_asc" className="bg-charcoal text-text-primary">
                          Scheduled: Earliest First
                        </option>
                        <option value="scheduled_at_desc" className="bg-charcoal text-text-primary">
                          Scheduled: Latest First
                        </option>
                      </>
                    )}
                    <option value="created_at_desc" className="bg-charcoal text-text-primary">
                      Created: Newest First
                    </option>
                    <option value="created_at_asc" className="bg-charcoal text-text-primary">
                      Created: Oldest First
                    </option>
                    {statusFilter !== 'scheduled' && statusFilter !== 'paused' && (
                      <option value="sent_at_desc" className="bg-charcoal text-text-primary">
                        Sent: Most Recent
                      </option>
                    )}
                  </select>
                </div>

                {/* Active Filters Clear Button */}
                {(campaignFilter || leadGroupFilter || searchQuery) && (
                  <button
                    onClick={() => {
                      setCampaignFilter('');
                      setLeadGroupFilter('');
                      setSearchQuery('');
                    }}
                    className="text-xs text-text-muted hover:text-[#E84B2C] px-2.5 py-1.5 hover:bg-surface-hover rounded-xl transition-colors"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Messages Table Card */}
          <div className="rounded-2xl border border-border-subtle bg-charcoal shadow-2xl overflow-hidden">
            <div className="overflow-x-auto min-w-0">
              <table className="w-full text-left text-xs min-w-[1050px] border-collapse">
                <thead className="bg-obsidian text-text-secondary uppercase text-[10px] tracking-wider border-b border-border-subtle font-mono">
                  <tr>
                    {/* Fixed First Column: Recipient / Lead */}
                    <th className="px-5 py-3.5 font-semibold sticky left-0 z-20 bg-obsidian border-r border-border-subtle/60 min-w-[210px] max-w-[240px] shadow-[2px_0_6px_rgba(0,0,0,0.4)]">
                      Recipient / Lead
                    </th>
                    <th className="px-4 py-3.5 font-semibold min-w-[170px] max-w-[200px]">Campaign</th>
                    <th className="px-4 py-3.5 font-semibold min-w-[220px]">Subject</th>
                    <th className="px-4 py-3.5 font-semibold min-w-[170px]">Sending Inbox</th>
                    <th className="px-3 py-3.5 font-semibold min-w-[70px]">Step</th>
                    <th className="px-4 py-3.5 font-semibold min-w-[110px]">Status</th>
                    <th className="px-4 py-3.5 font-semibold min-w-[130px]">Date / Time</th>
                    <th className="px-5 py-3.5 font-semibold text-right min-w-[80px]">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/50 font-sans">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center text-text-muted">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-[#E87A38]" />
                        <span className="text-xs font-medium">Loading outreach messages...</span>
                      </td>
                    </tr>
                  ) : messages.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center text-text-muted">
                        <div className="w-12 h-12 rounded-2xl bg-surface-elevated border border-border-subtle flex items-center justify-center mx-auto mb-3 text-text-muted">
                          <Mail className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-semibold text-text-primary">No messages found</p>
                        <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
                          {searchQuery || campaignFilter || leadGroupFilter
                            ? 'No messages match your search or filter criteria.'
                            : 'Generated and sent emails will appear here as your campaigns launch.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    messages.map((msg) => {
                      const leadName = msg.lead?.first_name
                        ? `${msg.lead.first_name} ${msg.lead.last_name || ''}`.trim()
                        : 'Prospect Lead';
                      const leadEmail = msg.lead?.email || '—';

                      return (
                        <tr
                          key={msg.id}
                          className="hover:bg-surface-hover/60 transition-colors group border-b border-border-subtle/40"
                        >
                          {/* Fixed Column 1: Recipient / Lead */}
                          <td className="px-5 py-3.5 sticky left-0 z-10 bg-charcoal group-hover:bg-[#1a1918] border-r border-border-subtle/60 min-w-[210px] max-w-[240px] shadow-[2px_0_6px_rgba(0,0,0,0.4)]">
                            <div className="font-semibold text-text-primary truncate" title={leadName}>
                              {leadName}
                            </div>
                            <div
                              className="text-[11px] text-text-muted font-mono mt-0.5 truncate"
                              title={leadEmail}
                            >
                              {leadEmail}
                            </div>
                          </td>

                          {/* Column 2: Campaign */}
                          <td className="px-4 py-3.5 min-w-[170px] max-w-[200px]">
                            {msg.campaign_id ? (
                              <Link
                                href={`/campaigns/${msg.campaign_id}`}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#E84B2C]/10 hover:bg-[#E84B2C]/20 text-[#E87A38] hover:text-[#E84B2C] border border-[#E84B2C]/25 transition-colors max-w-[170px] group/camp"
                                title={msg.campaign_name || 'View Campaign'}
                              >
                                <Layers className="w-3 h-3 text-[#E87A38] shrink-0" />
                                <span className="truncate text-xs font-medium">
                                  {msg.campaign_name || 'Campaign'}
                                </span>
                              </Link>
                            ) : (
                              <span className="text-text-muted text-xs">—</span>
                            )}
                          </td>

                          {/* Column 3: Subject */}
                          <td
                            className="px-4 py-3.5 max-w-sm truncate text-text-primary font-medium"
                            title={msg.subject}
                          >
                            {msg.subject}
                          </td>

                          {/* Column 4: Sending Inbox */}
                          <td className="px-4 py-3.5 text-text-secondary text-[11px] min-w-[170px]">
                            {msg.email_account?.email_address ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-elevated text-text-secondary border border-border-subtle font-mono text-[10px]">
                                <Send className="w-2.5 h-2.5 text-[#E87A38]" />
                                <span className="truncate max-w-[140px]">
                                  {msg.email_account.email_address}
                                </span>
                              </span>
                            ) : msg.step_number > 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/25 font-mono text-[10px]">
                                <Send className="w-2.5 h-2.5 text-amber-400" />
                                <span>Step 0 Linked Inbox</span>
                              </span>
                            ) : (
                              <span className="text-text-muted text-[11px] font-mono">
                                Auto-rotating pool
                              </span>
                            )}
                          </td>

                          {/* Column 5: Step Number */}
                          <td className="px-3 py-3.5 text-text-muted font-mono text-[11px]">
                            Step {msg.step_number}
                          </td>

                          {/* Column 6: Status */}
                          <td className="px-4 py-3.5">{getStatusBadge(msg.status)}</td>

                          {/* Column 7: Date / Time */}
                          <td className="px-4 py-3.5 text-text-secondary text-[11px] min-w-[130px]">
                            {msg.sent_at ? (
                              <span className="text-[#63C7A2] font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                <span>
                                  {new Date(msg.sent_at).toLocaleString([], {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </span>
                            ) : msg.status === 'paused' ? (
                              <span className="inline-flex flex-col text-amber-400 font-medium">
                                <span>Campaign Paused</span>
                                <span className="text-[10px] text-text-muted">Reschedules on resume</span>
                              </span>
                            ) : msg.status === 'scheduled' ? (
                              msg.scheduled_at ? (
                                <span className="inline-flex flex-col">
                                  <span className="text-text-primary font-medium flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-blue-400 shrink-0" />
                                    <span>
                                      {new Date(msg.scheduled_at).toLocaleDateString([], {
                                        month: 'short',
                                        day: 'numeric',
                                      })}
                                    </span>
                                  </span>
                                  <span className="text-[10px] text-blue-400 font-mono pl-4">
                                    {new Date(msg.scheduled_at).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-text-muted">Queued for window</span>
                              )
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* Column 8: Details */}
                          <td className="px-5 py-3.5 text-right min-w-[80px]">
                            <Link
                              href={
                                msg.campaign_id
                                  ? `/campaigns/${msg.campaign_id}/editor?messageId=${msg.id}`
                                  : `/campaigns`
                              }
                              className="inline-flex items-center gap-1 text-xs text-[#E87A38] hover:text-[#E84B2C] font-semibold transition-colors"
                            >
                              <span>Inspect</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
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
              itemName="messages"
              onPageChange={(newPage) => {
                setPage(newPage);
                fetchMessages(newPage, pageSize);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
                fetchMessages(1, newSize);
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-obsidian flex items-center justify-center text-text-muted">
          <RefreshCw className="w-6 h-6 animate-spin text-[#E87A38]" />
        </div>
      }
    >
      <MessagesContent />
    </Suspense>
  );
}
