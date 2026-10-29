'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
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

  // Filters state
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [campaignFilter, setCampaignFilter] = useState(initialCampaignId);
  const [leadGroupFilter, setLeadGroupFilter] = useState(initialLeadGroupId);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOption, setSortOption] = useState<'scheduled_at_asc' | 'scheduled_at_desc' | 'created_at_desc' | 'created_at_asc' | 'sent_at_desc'>('scheduled_at_asc');

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

    // Parse sortOption
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
        setTotal(typeof data?.total === 'number' ? data.total : (Array.isArray(data) ? data.length : 0));
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

  const getStatusBadge = (status: EmailMessage['status']) => {
    switch (status) {
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Sent
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3" /> Scheduled
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Pause className="w-3 h-3" /> Paused
          </span>
        );
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
            <FileEdit className="w-3 h-3" /> Draft
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        );
      default:
        return <span className="text-xs text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Messages"
          subtitle="History of sent, scheduled, and generated outreach messages"
          category="Personalization Engine"
        />

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto min-w-0">
          {/* Top Filter Bar: Status Tabs + Search & Filters */}
          <div className="space-y-4">
            {/* Status Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-slate-900/40 p-2 rounded-xl border border-slate-800 w-full sm:w-fit">
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter === st ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {st === '' ? 'All Messages' : st.charAt(0).toUpperCase() + st.slice(1)}
                </button>
              ))}
            </div>

            {/* Filter & Search Toolbar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/30 p-3 rounded-xl border border-slate-800/80">
              {/* Search Box */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by lead name, email, company, or subject..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-8 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filters Dropdowns */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Campaign Filter */}
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
                  <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <select
                    value={campaignFilter}
                    onChange={(e) => setCampaignFilter(e.target.value)}
                    className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer max-w-[200px] truncate"
                  >
                    <option value="" className="bg-slate-900 text-slate-200">All Campaigns</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id} className="bg-slate-900 text-slate-200">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Lead Group Filter */}
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
                  <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <select
                    value={leadGroupFilter}
                    onChange={(e) => setLeadGroupFilter(e.target.value)}
                    className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer max-w-[200px] truncate"
                  >
                    <option value="" className="bg-slate-900 text-slate-200">All Lead Groups</option>
                    {leadGroups.map((lg) => (
                      <option key={lg.id} value={lg.id} className="bg-slate-900 text-slate-200">
                        {lg.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort Filter */}
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
                  <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as any)}
                    className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
                  >
                    {statusFilter !== 'sent' && (
                      <>
                        <option value="scheduled_at_asc" className="bg-slate-900 text-slate-200">
                          Scheduled: Earliest First
                        </option>
                        <option value="scheduled_at_desc" className="bg-slate-900 text-slate-200">
                          Scheduled: Latest First
                        </option>
                      </>
                    )}
                    <option value="created_at_desc" className="bg-slate-900 text-slate-200">
                      Created: Newest First
                    </option>
                    <option value="created_at_asc" className="bg-slate-900 text-slate-200">
                      Created: Oldest First
                    </option>
                    {statusFilter !== 'scheduled' && statusFilter !== 'paused' && (
                      <option value="sent_at_desc" className="bg-slate-900 text-slate-200">
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
                    className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1.5 hover:bg-slate-800/60 rounded-md transition-colors"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Messages Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3 font-medium">Recipient / Lead</th>
                    <th className="px-5 py-3 font-medium">Campaign</th>
                    <th className="px-5 py-3 font-medium">Subject</th>
                    <th className="px-5 py-3 font-medium">Sending Inbox</th>
                    <th className="px-5 py-3 font-medium">Step</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Date / Time</th>
                    <th className="px-5 py-3 font-medium text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                        Loading messages...
                      </td>
                    </tr>
                  ) : messages.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                        <Mail className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="text-sm font-medium text-slate-300">No messages found</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {searchQuery || campaignFilter || leadGroupFilter
                            ? 'No messages match your search or filter criteria.'
                            : 'Generated and sent emails will appear here.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    messages.map((msg) => (
                      <tr key={msg.id} className="hover:bg-slate-900/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-slate-200">
                            {msg.lead?.first_name ? `${msg.lead.first_name} ${msg.lead.last_name}` : 'Lead'}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">{msg.lead?.email || '—'}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          {msg.campaign_id ? (
                            <Link
                              href={`/campaigns/${msg.campaign_id}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 hover:text-indigo-200 border border-indigo-500/20 transition-colors max-w-[170px] group"
                              title={msg.campaign_name || 'View Campaign'}
                            >
                              <Layers className="w-3 h-3 text-indigo-400 shrink-0 group-hover:text-indigo-300" />
                              <span className="truncate text-xs font-medium">{msg.campaign_name || 'Campaign'}</span>
                            </Link>
                          ) : (
                            <span className="text-slate-500 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 max-w-xs truncate text-slate-300 font-medium">
                          {msg.subject}
                        </td>
                        <td className="px-5 py-3.5 text-slate-400 text-[11px]">
                          {msg.email_account?.email_address ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/60 font-mono text-[10px]">
                              <Send className="w-2.5 h-2.5 text-indigo-400" />
                              <span className="truncate max-w-[150px]">{msg.email_account.email_address}</span>
                            </span>
                          ) : msg.step_number > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono text-[10px]">
                              <Send className="w-2.5 h-2.5 text-amber-400" />
                              <span>Step 0 Inbox</span>
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">Auto-rotating pool</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-slate-400">Step {msg.step_number}</td>
                        <td className="px-5 py-3.5">{getStatusBadge(msg.status)}</td>
                        <td className="px-5 py-3.5 text-slate-400 text-[11px]">
                          {msg.sent_at ? (
                            <span className="text-emerald-400 font-medium">
                              {new Date(msg.sent_at).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          ) : msg.status === 'paused' ? (
                            <span className="inline-flex flex-col text-amber-400 font-medium">
                              <span>Campaign Paused</span>
                              <span className="text-[10px] text-slate-500">Auto-reschedules on resume</span>
                            </span>
                          ) : msg.status === 'scheduled' ? (
                            <span className="text-blue-400 font-medium">
                              {msg.scheduled_at ? (
                                <span className="inline-flex flex-col">
                                  <span className="text-slate-300">
                                    {new Date(msg.scheduled_at).toLocaleDateString([], {
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </span>
                                  <span className="text-[10px] text-blue-400 font-mono">
                                    {new Date(msg.scheduled_at).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </span>
                              ) : (
                                <span>Queued for Window</span>
                              )}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Link
                            href={
                              msg.campaign_id
                                ? `/campaigns/${msg.campaign_id}/editor?messageId=${msg.id}`
                                : `/campaigns`
                            }
                            className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                          >
                            <span>Inspect</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))
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
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
        </div>
      }
    >
      <MessagesContent />
    </Suspense>
  );
}
