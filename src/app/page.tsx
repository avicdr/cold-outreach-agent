'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import {
  Users,
  UserCheck,
  FileEdit,
  Send,
  MessageSquare,
  ThumbsUp,
  AlertTriangle,
  XCircle,
  ArrowUpRight,
  Plus,
  Upload,
  Sparkles,
  RefreshCw,
  Inbox,
  Gauge,
  Clock,
  Flame,
  ShieldCheck,
} from 'lucide-react';

interface DashboardStats {
  totalLeads: number;
  eligibleLeads: number;
  draftsGenerated: number;
  emailsSent: number;
  repliesReceived: number;
  positiveReplies: number;
  bounceCount: number;
  failedJobs: number;
  campaignsCount: number;
  activeCampaignsCount: number;
  suppressionCount: number;
  totalAccounts?: number;
  activeAccounts?: number;
  dailyCapacity?: number;
  sentToday?: number;
  remainingToday?: number;
  accountGroupsCount?: number;
  accounts?: any[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [runNotice, setRunNotice] = useState<string | null>(null);

  const loadData = () => {
    Promise.all([
      fetch('/api/analytics').then((res) => res.json()),
      fetch('/api/campaigns').then((res) => res.json()),
    ])
      .then(([statsData, campaignsData]) => {
        setStats(statsData && !statsData.error ? statsData : null);
        setCampaigns(Array.isArray(campaignsData) ? campaignsData : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load dashboard data:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRunWorker = async () => {
    setDispatching(true);
    setRunNotice(null);
    try {
      const res = await fetch('/api/jobs/process', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const completed = (data.results || []).filter((r: any) => r.status === 'completed').length;
        const failed = (data.results || []).filter((r: any) => r.status === 'failed').length;
        setRunNotice(`Worker finished: ${data.processed || 0} jobs processed (${completed} completed, ${failed} failed).`);
        loadData();
      } else {
        setRunNotice(`Worker error: ${data.error}`);
      }
    } catch {
      setRunNotice('Failed to trigger worker.');
    } finally {
      setDispatching(false);
      setTimeout(() => setRunNotice(null), 6000);
    }
  };

  const statCards = [
    { label: 'Total Leads', value: stats?.totalLeads ?? 0, icon: Users, color: 'text-[#E87A38]', bg: 'bg-[#E87A38]/10', href: '/leads' },
    { label: 'Eligible Leads', value: stats?.eligibleLeads ?? 0, icon: UserCheck, color: 'text-[#63C7A2]', bg: 'bg-[#63C7A2]/10', href: '/leads' },
    { label: 'Drafts Generated', value: stats?.draftsGenerated ?? 0, icon: FileEdit, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', href: '/messages' },
    { label: 'Emails Sent', value: stats?.emailsSent ?? 0, icon: Send, color: 'text-[#E84B2C]', bg: 'bg-[#E84B2C]/10', href: '/messages' },
    { label: 'Replies Received', value: stats?.repliesReceived ?? 0, icon: MessageSquare, color: 'text-[#C86938]', bg: 'bg-[#C86938]/10', href: '/replies' },
    { label: 'Positive Replies', value: stats?.positiveReplies ?? 0, icon: ThumbsUp, color: 'text-[#63C7A2]', bg: 'bg-[#63C7A2]/10', href: '/replies' },
    { label: 'Bounce Count', value: stats?.bounceCount ?? 0, icon: AlertTriangle, color: 'text-[#E87A38]', bg: 'bg-[#E87A38]/10', href: '/leads' },
    { label: 'Failed Jobs', value: stats?.failedJobs ?? 0, icon: XCircle, color: 'text-[#E84B2C]', bg: 'bg-[#E84B2C]/10', href: '/jobs?status=failed', isAlert: (stats?.failedJobs ?? 0) > 0 },
  ];

  return (
    <div className="flex min-h-screen bg-[#111110] text-[#F3F0E8] font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Dashboard"
          subtitle="Real-time multi-inbox deliverability & autonomous pipeline command"
          category="Enterprise Control"
        >
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRunWorker}
              disabled={dispatching}
              className="btn-secondary px-2.5 sm:px-3 py-1.5 text-xs gap-1.5 shrink-0 whitespace-nowrap"
              title="Process queued tasks, schedule next sends, and sync replies"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${dispatching ? 'animate-spin text-[#E84B2C]' : 'text-[#9E9B93]'}`} />
              <span className="hidden sm:inline">{dispatching ? 'Dispatching...' : 'Run Worker Now'}</span>
              <span className="sm:hidden">{dispatching ? '...' : 'Worker'}</span>
            </button>
            <Link
              href="/leads/import"
              className="btn-secondary px-2.5 sm:px-3 py-1.5 text-xs gap-1.5 shrink-0 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-[#9E9B93] shrink-0" />
              <span>Import</span>
            </Link>
            <Link
              href="/campaigns/new"
              className="btn-primary px-3 sm:px-3.5 py-1.5 text-xs gap-1.5 shrink-0 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Create Campaign</span>
              <span className="sm:hidden">Campaign</span>
            </Link>
          </div>
        </Header>

        <main className="p-4 sm:p-6 lg:p-8 space-y-8 flex-1 max-w-7xl w-full mx-auto min-w-0">
          {runNotice && (
            <div className="p-3.5 rounded-[12px] bg-[#E84B2C]/10 border border-[#E84B2C]/30 text-[#E87A38] text-xs flex items-center justify-between font-mono">
              <span>{runNotice}</span>
              <button onClick={() => setRunNotice(null)} className="text-[#9E9B93] hover:text-[#F3F0E8]">✕</button>
            </div>
          )}

          {/* Multi-Account Daily Outreach Capacity Card */}
          <section className="rounded-[16px] border border-[rgba(232,75,44,0.3)] bg-gradient-to-br from-[#1C1916] via-[#171614] to-[#111110] p-6 sm:p-7 shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative overflow-hidden">
            {/* Atmospheric radiance overlay */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-[radial-gradient(ellipse_at_center,rgba(232,75,44,0.12),transparent_70%)] pointer-events-none" />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-[rgba(243,240,232,0.08)] relative z-10">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E84B2C]/10 border border-[#E84B2C]/30 text-[#E87A38] text-[10px] font-mono uppercase tracking-widest font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E84B2C] shadow-[0_0_8px_#E84B2C]"></span>
                    Capacity Guard
                  </div>
                  <span className="text-[11px] text-[#9E9B93] flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 text-[#9E9B93]" /> ~15-min safety interval between sends
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold font-syne tracking-tight text-[#F3F0E8] flex items-center gap-2">
                  <span>Daily Outreach Capacity</span>
                </h2>
                <p className="text-xs text-[#D0CBC1] max-w-2xl leading-relaxed">
                  Daily sending volume scales safely across connected inboxes (strictly 15–18 emails/day per account to protect domain reputation and maximize primary inbox delivery).
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Link
                  href="/accounts"
                  className="btn-primary px-4 py-2 text-xs font-semibold gap-2 shrink-0"
                >
                  <Inbox className="w-3.5 h-3.5" />
                  <span>Manage Inboxes & Groups</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Capacity Numbers & Progress Bar */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center relative z-10">
              <div className="lg:col-span-5 space-y-2">
                <div className="flex items-baseline gap-2.5">
                  {loading ? (
                    <div className="h-10 w-28 bg-[#211B17] animate-pulse rounded-[8px]" />
                  ) : (
                    <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#F3F0E8] font-mono text-gradient-ember">
                      {stats?.remainingToday ?? 0}
                    </span>
                  )}
                  <span className="text-sm font-medium text-[#D0CBC1]">emails remaining today</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="px-2.5 py-1 rounded-[6px] bg-[#111110] border border-[rgba(243,240,232,0.12)] text-[#E87A38] font-mono font-medium">
                    {stats?.activeAccounts ?? 0} inboxes × 18 limit = {stats?.dailyCapacity ?? 0} max/day
                  </span>
                  <span className="text-[#9E9B93] font-mono">
                    • {stats?.sentToday ?? 0} sent today
                  </span>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#9E9B93]">Daily Quota Utilization</span>
                  <span className="text-[#F3F0E8] font-semibold">
                    {stats?.sentToday ?? 0} / {stats?.dailyCapacity ?? 0} emails (
                    {stats && stats.dailyCapacity && stats.dailyCapacity > 0
                      ? Math.min(100, Math.round(((stats.sentToday || 0) / stats.dailyCapacity) * 100))
                      : 0}
                    %)
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-[#111110] border border-[rgba(243,240,232,0.08)] overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(232,75,44,0.4)]"
                    style={{
                      background: 'linear-gradient(90deg, #E84B2C 0%, #E87A38 50%, #63C7A2 100%)',
                      width: `${
                        stats && stats.dailyCapacity && stats.dailyCapacity > 0
                          ? Math.min(100, Math.round(((stats.sentToday || 0) / stats.dailyCapacity) * 100))
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#9E9B93] font-mono pt-0.5">
                  <span>0 sent</span>
                  <span className="text-[#E87A38]">
                    {(stats?.activeAccounts ?? 0) === 0
                      ? 'No accounts connected'
                      : `${stats?.activeAccounts} active inboxes rotating`}
                  </span>
                  <span>{stats?.dailyCapacity ?? 0} limit</span>
                </div>
              </div>
            </div>

            {/* Individual Accounts Mini-Bar */}
            {Array.isArray(stats?.accounts) && stats.accounts.length > 0 && (
              <div className="mt-6 pt-5 border-t border-[rgba(243,240,232,0.08)] relative z-10">
                <div className="flex items-center justify-between mb-3 text-xs">
                  <span className="font-semibold uppercase font-mono tracking-wider text-[10px] text-[#9E9B93]">
                    Connected Inboxes & Daily Allotment
                  </span>
                  <Link href="/accounts" className="text-[#E87A38] hover:text-[#E84B2C] text-xs font-mono transition-colors">
                    View all {stats.accounts.length} inboxes →
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {stats.accounts.slice(0, 3).map((acc: any) => {
                    const limit = acc.daily_limit || 18;
                    const sent = acc.sent_today || 0;
                    const remaining = Math.max(0, limit - sent);
                    return (
                      <div
                        key={acc.id}
                        className="p-3.5 rounded-[12px] bg-[#111110] border border-[rgba(243,240,232,0.08)] hover:border-[rgba(243,240,232,0.18)] transition-colors space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#F3F0E8] truncate max-w-[170px]" title={acc.email_address}>
                            {acc.email_address}
                          </span>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-semibold uppercase ${
                              acc.status === 'active'
                                ? 'bg-[#63C7A2]/10 text-[#63C7A2] border border-[#63C7A2]/30'
                                : 'bg-[#26201B] text-[#9E9B93]'
                            }`}
                          >
                            {acc.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-[#9E9B93] font-mono">
                          <span>
                            {sent} / {limit} sent
                          </span>
                          <span className="text-[#E87A38] font-bold">{remaining} left</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[#171614] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#E84B2C]"
                            style={{ width: `${Math.min(100, Math.round((sent / limit) * 100))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Quick Metrics Grid */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#9E9B93] font-mono">
                Core Performance Metrics
              </h2>
              <span className="text-xs text-[#9E9B93] font-mono">Live verified database counts</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((card, i) => {
                const Icon = card.icon;
                const isAlert = card.isAlert;
                return (
                  <Link
                    key={i}
                    href={card.href}
                    className={`p-5 rounded-[14px] border transition-all duration-200 relative overflow-hidden group block ${
                      isAlert
                        ? 'border-[#E84B2C]/50 bg-[#E84B2C]/5 hover:border-[#E84B2C] shadow-[0_4px_20px_rgba(232,75,44,0.15)]'
                        : 'border-[rgba(243,240,232,0.08)] bg-[#171614] hover:border-[rgba(243,240,232,0.20)] hover:-translate-y-0.5 shadow-[0_4px_20px_rgba(0,0,0,0.3)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-[#D0CBC1] group-hover:text-[#F3F0E8] transition-colors">
                          {card.label}
                        </span>
                        {isAlert && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E84B2C] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E84B2C]"></span>
                          </span>
                        )}
                      </div>
                      <div className={`p-2 rounded-[8px] transition-transform group-hover:scale-110 ${card.bg}`}>
                        <Icon className={`w-4 h-4 ${card.color}`} />
                      </div>
                    </div>
                    <div className="mt-3.5 flex items-baseline justify-between">
                      {loading ? (
                        <div className="h-8 w-16 bg-[#211B17] animate-pulse rounded" />
                      ) : (
                        <div className={`text-2xl sm:text-3xl font-extrabold tracking-tight font-mono ${isAlert ? 'text-[#E84B2C]' : 'text-[#F3F0E8]'}`}>
                          {card.value}
                        </div>
                      )}
                      <span className="text-[11px] font-mono text-[#E87A38] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                        Inspect <ArrowUpRight className="w-3 h-3" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Active Campaigns & Workflow Status */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Campaigns Table / Cards */}
            <div className="lg:col-span-2 rounded-[14px] border border-[rgba(243,240,232,0.08)] bg-[#171614] p-6 space-y-4 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold font-syne text-[#F3F0E8]">Active Campaigns</h3>
                  <p className="text-xs text-[#9E9B93]">Pipelines currently dispatching or preparing personalized drafts</p>
                </div>
                <Link
                  href="/campaigns"
                  className="text-xs text-[#E87A38] hover:text-[#E84B2C] flex items-center gap-1 font-mono transition-colors"
                >
                  View All <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {(!Array.isArray(campaigns) || campaigns.length === 0) ? (
                <div className="py-12 text-center rounded-[12px] border border-dashed border-[rgba(243,240,232,0.12)] bg-[#111110]">
                  <Sparkles className="w-8 h-8 text-[#9E9B93] mx-auto mb-2" />
                  <p className="text-sm font-semibold text-[#F3F0E8]">No campaigns active yet</p>
                  <p className="text-xs text-[#9E9B93] mt-1">Upload leads and launch your first AI personalization campaign.</p>
                  <Link
                    href="/campaigns/new"
                    className="btn-primary mt-4 px-3.5 py-1.5 text-xs gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Create Campaign
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {(Array.isArray(campaigns) ? campaigns : []).slice(0, 5).map((camp) => (
                    <div
                      key={camp.id}
                      className="p-4 rounded-[12px] border border-[rgba(243,240,232,0.08)] bg-[#111110] flex items-center justify-between hover:border-[rgba(243,240,232,0.18)] transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Link href={`/campaigns/${camp.id}`} className="text-sm font-semibold font-syne text-[#F3F0E8] hover:text-[#E87A38] transition-colors">
                            {camp.name}
                          </Link>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-semibold uppercase ${
                              camp.status === 'active'
                                ? 'bg-[#63C7A2]/10 text-[#63C7A2] border border-[#63C7A2]/30'
                                : camp.status === 'paused'
                                ? 'bg-[#E87A38]/10 text-[#E87A38] border border-[#E87A38]/30'
                                : 'bg-[#26201B] text-[#D0CBC1]'
                            }`}
                          >
                            {camp.status}
                          </span>
                        </div>
                        <div className="text-xs text-[#9E9B93] line-clamp-1">{camp.offer || 'No offer specified'}</div>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono">
                        <div className="hidden sm:block text-right">
                          <div className="text-[#F3F0E8] font-medium">Daily Limit: {camp.sending_config?.daily_limit || 10}</div>
                          <div className="text-[10px] text-[#9E9B93]">TZ: {camp.sending_config?.timezone || 'Default'}</div>
                        </div>
                        <Link
                          href={`/campaigns/${camp.id}`}
                          className="btn-secondary px-3 py-1.5 text-xs"
                        >
                          Manage
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outreach Guidelines & AI Engine Box */}
            <div className="rounded-[14px] border border-[rgba(243,240,232,0.08)] bg-[#171614] p-6 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[#E87A38]">
                  <Flame className="w-5 h-5 text-[#E84B2C]" />
                  <h3 className="text-sm font-bold font-syne text-[#F3F0E8]">Gemini AI Safety Guardrails</h3>
                </div>
                <p className="text-xs text-[#D0CBC1] leading-relaxed">
                  Every personalized outreach message is verified against known facts. If unverified claims or fake familiarity are detected, the email is flagged for your review before dispatch.
                </p>
                <div className="space-y-2.5 pt-2 border-t border-[rgba(243,240,232,0.08)] text-xs text-[#9E9B93]">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#63C7A2] shadow-[0_0_6px_#63C7A2]"></span>
                    <span>Zero hallucinated case studies or news</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#63C7A2] shadow-[0_0_6px_#63C7A2]"></span>
                    <span>Automatic RFC 8058 one-click opt-out</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#63C7A2] shadow-[0_0_6px_#63C7A2]"></span>
                    <span>Instant follow-up cancellation on reply</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[rgba(243,240,232,0.08)] flex items-center justify-between text-xs font-mono">
                <span className="text-[#9E9B93]">Model Engine:</span>
                <span className="text-[#E87A38] font-bold">Gemini 3.8 Flash</span>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
