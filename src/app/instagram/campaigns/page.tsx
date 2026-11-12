'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { InstagramIcon } from '@/components/InstagramIcon';
import { InstagramCampaign } from '@/types/database';
import { Plus, Play, Pause, Clock, Calendar, ArrowRight } from 'lucide-react';

export default function InstagramCampaignsPage() {
  const [campaigns, setCampaigns] = useState<InstagramCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [pausingAll, setPausingAll] = useState(false);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/instagram/campaigns');
      const data = await res.json();
      setCampaigns(Array.isArray(data) ? data : []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const filtered = statusFilter ? campaigns.filter((c) => c.status === statusFilter) : campaigns;
  const hasAnyActive = campaigns.some((c) => c.status === 'active');

  const handleGlobalToggle = async () => {
    setPausingAll(true);
    try {
      for (const c of campaigns) {
        if (hasAnyActive && c.status === 'active') {
          await fetch(`/api/instagram/campaigns/${c.id}/pause`, { method: 'POST' });
        } else if (!hasAnyActive && c.status === 'paused') {
          await fetch(`/api/instagram/campaigns/${c.id}/resume`, { method: 'POST' });
        }
      }
      await fetchCampaigns();
    } finally {
      setPausingAll(false);
    }
  };

  const getBadge = (status: InstagramCampaign['status']) => {
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

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Instagram DM Campaigns"
          subtitle="Independent Instagram DM outreach sequences — completely segregated from email campaigns"
          category="Instagram DM"
        >
          <div className="flex items-center gap-2 shrink-0">
            {campaigns.length > 0 && (
              <button
                type="button"
                onClick={handleGlobalToggle}
                disabled={pausingAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200"
              >
                {hasAnyActive ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
                <span>{hasAnyActive ? 'Pause All' : 'Resume All'}</span>
              </button>
            )}
            <Link
              href="/instagram/campaigns/new"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New IG Campaign</span>
            </Link>
          </div>
        </Header>

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40 p-3.5 rounded-xl border border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Filter:</span>
              {['', 'active', 'paused', 'draft', 'completed'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    statusFilter === st ? 'bg-fuchsia-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {st === '' ? 'All' : st.charAt(0).toUpperCase() + st.slice(1)}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400">{filtered.length} IG campaigns</span>
          </div>

          {loading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-sm text-slate-400">
              Loading Instagram campaigns...
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400">
                <InstagramIcon className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h2 className="text-base font-semibold text-slate-100">No Instagram DM Campaigns Yet</h2>
                <p className="text-xs text-slate-400">
                  Create an independent Instagram DM campaign, enroll IG leads (or pull leads from an email campaign and add their @handles), generate AI DMs, and launch.
                </p>
              </div>
              <Link
                href="/instagram/campaigns/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                Create IG DM Campaign
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((c) => (
                <Link
                  key={c.id}
                  href={`/instagram/campaigns/${c.id}`}
                  className="bg-slate-900 border border-slate-800 hover:border-fuchsia-500/40 rounded-xl p-5 flex flex-col justify-between space-y-4 transition-all group"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400 shrink-0">
                          <InstagramIcon className="w-4 h-4" />
                        </div>
                        <h3 className="text-sm font-semibold text-slate-100 truncate group-hover:text-fuchsia-300 transition-colors">
                          {c.name}
                        </h3>
                      </div>
                      {getBadge(c.status)}
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2">
                      {c.offer || c.business_context || 'No offer summary set'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {c.sending_config?.daily_limit ?? 25}/day
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {c.followup_config?.max_followups ?? 0} follow-ups
                      </span>
                      {c.instagram_account && (
                        <span className="text-fuchsia-300 font-medium">@{c.instagram_account.username}</span>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-fuchsia-400 font-medium">
                      Open <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
