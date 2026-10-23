'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { Pagination } from '@/components/Pagination';
import { Campaign } from '@/types/database';
import {
  Send,
  Plus,
  Play,
  Pause,
  AlertCircle,
  Calendar,
  Clock,
  Sparkles,
  ArrowRight,
  Sliders,
} from 'lucide-react';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [isPausingAll, setIsPausingAll] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchCampaigns = () => {
    setLoading(true);
    fetch('/api/campaigns')
      .then((res) => res.json())
      .then((data) => {
        setCampaigns(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load campaigns:', err);
        setCampaigns([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const campaignList = Array.isArray(campaigns) ? campaigns : [];
  const filteredCampaigns = statusFilter
    ? campaignList.filter((c) => c.status === statusFilter)
    : campaignList;

  const paginatedCampaigns = filteredCampaigns.slice((page - 1) * pageSize, page * pageSize);

  const handleGlobalPauseToggle = async () => {
    setIsPausingAll(true);
    const hasActive = campaignList.some((c) => c.status === 'active');
    const targetAction = hasActive ? 'pause' : 'resume';

    try {
      for (const c of campaigns) {
        if (hasActive && c.status === 'active') {
          await fetch(`/api/campaigns/${c.id}/pause`, { method: 'POST' });
        } else if (!hasActive && c.status === 'paused') {
          await fetch(`/api/campaigns/${c.id}/resume`, { method: 'POST' });
        }
      }
      fetchCampaigns();
    } catch (err) {
      console.error('Failed to toggle pause all:', err);
    } finally {
      setIsPausingAll(false);
    }
  };

  const getStatusBadge = (status: Campaign['status']) => {
    switch (status) {
      case 'active':
        return <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Active</span>;
      case 'paused':
        return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">Paused</span>;
      case 'completed':
        return <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">Completed</span>;
      case 'cancelled':
        return <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">Cancelled</span>;
      default:
        return <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-medium">Draft</span>;
    }
  };

  const hasAnyActive = campaigns.some((c) => c.status === 'active');

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title="Campaigns" subtitle="Manage your automated outreach campaigns & schedules">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {campaigns.length > 0 && (
              <button
                onClick={handleGlobalPauseToggle}
                disabled={isPausingAll}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 transition-colors shrink-0 whitespace-nowrap"
              >
                {hasAnyActive ? <Pause className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <Play className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                <span className="hidden sm:inline">{hasAnyActive ? 'Pause All Sending' : 'Resume Sending'}</span>
                <span className="sm:hidden">{hasAnyActive ? 'Pause All' : 'Resume'}</span>
              </button>
            )}
            <Link
              href="/campaigns/new"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-colors shrink-0 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>New Campaign</span>
            </Link>
          </div>
        </Header>

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto min-w-0">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40 p-3.5 rounded-xl border border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Filter by Status:</span>
              <div className="flex flex-wrap items-center gap-1">
                {['', 'active', 'paused', 'draft', 'completed'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      statusFilter === st
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {st === '' ? 'All' : st.charAt(0).toUpperCase() + st.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-xs text-slate-400">{filteredCampaigns.length} campaigns</span>
          </div>

          {/* Campaigns Grid */}
          {loading ? (
            <div className="py-12 text-center text-slate-500">Loading campaigns...</div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/20">
              <Send className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-300">No campaigns found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Create a targeted outreach campaign to define your value proposition, tone, and automated follow-up sequences.
              </p>
              <Link
                href="/campaigns/new"
                className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white"
              >
                <Plus className="w-3.5 h-3.5" /> Create Campaign
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paginatedCampaigns.map((camp) => (
                <div
                  key={camp.id}
                  className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 glass-card-hover flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/campaigns/${camp.id}`}
                        className="text-base font-semibold text-white hover:text-indigo-400 transition-colors"
                      >
                        {camp.name}
                      </Link>
                      {getStatusBadge(camp.status)}
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2">
                      {camp.offer || camp.business_context || 'No offer specified'}
                    </p>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>Sending Limits:</span>
                      </span>
                      <span className="text-slate-300 font-medium">
                        {camp.sending_config?.daily_limit || 10} / day
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Follow-up Steps:</span>
                      </span>
                      <span className="text-slate-300 font-medium">
                        {camp.followup_config?.steps?.length || 2} steps configured
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-800/60">
                    <Link
                      href={`/campaigns/${camp.id}/edit`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 hover:border-slate-600 text-xs font-medium text-slate-200 hover:text-white transition-all shadow-sm"
                    >
                      <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Edit Config</span>
                    </Link>
                    <Link
                      href={`/campaigns/${camp.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      <span>Leads & Sequence</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {filteredCampaigns.length > 0 && (
            <Pagination
              currentPage={page}
              totalItems={filteredCampaigns.length}
              pageSize={pageSize}
              pageSizeOptions={[5, 10, 20, 50]}
              itemName="campaigns"
              onPageChange={(newPage) => {
                setPage(newPage);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
