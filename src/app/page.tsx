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
  Calendar,
  Sparkles,
  RefreshCw,
  Inbox,
  Gauge,
  Clock,
  Layers,
  ShieldCheck,
  CheckCircle2,
  Activity,
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
    { label: 'Total Leads', value: stats?.totalLeads ?? 0, icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-500/10', href: '/leads' },
    { label: 'Eligible Leads', value: stats?.eligibleLeads ?? 0, icon: UserCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', href: '/leads' },
    { label: 'Drafts Generated', value: stats?.draftsGenerated ?? 0, icon: FileEdit, color: 'text-purple-400', bg: 'bg-purple-500/10', href: '/messages' },
    { label: 'Emails Sent', value: stats?.emailsSent ?? 0, icon: Send, color: 'text-blue-400', bg: 'bg-blue-500/10', href: '/messages' },
    { label: 'Replies Received', value: stats?.repliesReceived ?? 0, icon: MessageSquare, color: 'text-cyan-400', bg: 'bg-cyan-500/10', href: '/replies' },
    { label: 'Positive Replies', value: stats?.positiveReplies ?? 0, icon: ThumbsUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10', href: '/replies' },
    { label: 'Bounce Count', value: stats?.bounceCount ?? 0, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', href: '/leads' },
    { label: 'Failed Jobs', value: stats?.failedJobs ?? 0, icon: XCircle, color: 'text-rose-400', bg: 'bg-rose-500/10', href: '/jobs?status=failed', isAlert: (stats?.failedJobs ?? 0) > 0 },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title="Dashboard" subtitle="Overview of your cold outreach performance & active sequences">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunWorker}
              disabled={dispatching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/90 hover:bg-blue-600 text-white shadow-sm shadow-blue-600/30 transition-colors disabled:opacity-50"
              title="Process queued tasks, schedule next sends, and sync replies"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${dispatching ? 'animate-spin' : ''}`} />
              <span>{dispatching ? 'Running...' : 'Run Worker Now'}</span>
            </button>
            <Link
              href="/leads/import"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-slate-400" />
              <span>Import Leads</span>
            </Link>
            <Link
              href="/campaigns/new"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Campaign</span>
            </Link>
          </div>
        </Header>

        <main className="p-8 space-y-8 flex-1 max-w-7xl w-full mx-auto">
          {runNotice && (
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center justify-between">
              <span>{runNotice}</span>
              <button onClick={() => setRunNotice(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
          )}
          {/* Multi-Account Daily Outreach Capacity Card */}
          <section className="rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-950/30 via-slate-900/60 to-slate-950 p-6 shadow-xl shadow-indigo-950/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800/80">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1.5">
                    <Gauge className="w-3 h-3" /> Daily Sending Capacity Guard
                  </span>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" /> ~15-min interval between sends
                  </span>
                </div>
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span>Daily Outreach Capacity</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Daily sending volume scales safely with each inbox (strictly 15–18 emails/day per account to protect domain reputation).
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href="/accounts"
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-all hover:scale-[1.02]"
                >
                  <Inbox className="w-3.5 h-3.5" />
                  <span>Manage Inboxes & Groups</span>
                  <ArrowUpRight className="w-3.5 h-3.5 ml-0.5" />
                </Link>
              </div>
            </div>

            {/* Capacity Numbers & Progress Bar */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-5 space-y-2">
                <div className="flex items-baseline gap-2">
                  {loading ? (
                    <div className="h-10 w-24 bg-slate-800 animate-pulse rounded" />
                  ) : (
                    <span className="text-4xl font-extrabold tracking-tight text-white font-mono">
                      {stats?.remainingToday ?? 0}
                    </span>
                  )}
                  <span className="text-sm font-medium text-slate-400">emails remaining today</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-mono font-medium">
                    {stats?.activeAccounts ?? 0} inboxes × 18 limit = {stats?.dailyCapacity ?? 0} max/day
                  </span>
                  <span className="text-slate-400">
                    • {stats?.sentToday ?? 0} sent today
                  </span>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Daily Quota Utilization</span>
                  <span className="font-mono text-slate-300 font-medium">
                    {stats?.sentToday ?? 0} / {stats?.dailyCapacity ?? 0} emails (
                    {stats && stats.dailyCapacity && stats.dailyCapacity > 0
                      ? Math.min(100, Math.round(((stats.sentToday || 0) / stats.dailyCapacity) * 100))
                      : 0}
                    %)
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-800/80 overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-400 transition-all duration-500"
                    style={{
                      width: `${
                        stats && stats.dailyCapacity && stats.dailyCapacity > 0
                          ? Math.min(100, Math.round(((stats.sentToday || 0) / stats.dailyCapacity) * 100))
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                  <span>0 sent</span>
                  <span>
                    {(stats?.activeAccounts ?? 0) === 0
                      ? 'No accounts connected yet'
                      : `${stats?.activeAccounts} active inboxes rotating`}
                  </span>
                  <span>{stats?.dailyCapacity ?? 0} limit</span>
                </div>
              </div>
            </div>

            {/* Individual Accounts Mini-Bar */}
            {Array.isArray(stats?.accounts) && stats.accounts.length > 0 && (
              <div className="mt-6 pt-5 border-t border-slate-800/80">
                <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
                  <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-400">
                    Connected Inboxes & Daily Allotment
                  </span>
                  <Link href="/accounts" className="text-indigo-400 hover:text-indigo-300 text-xs">
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
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-white truncate max-w-[170px]" title={acc.email_address}>
                            {acc.email_address}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              acc.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-slate-700/30 text-slate-400'
                            }`}
                          >
                            {acc.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>
                            {sent} / {limit} sent
                          </span>
                          <span className="text-indigo-400 font-mono font-medium">{remaining} left</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500"
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
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Core Performance Metrics</h2>
              <span className="text-xs text-slate-400">Live verified database counts</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((card, i) => {
                const Icon = card.icon;
                const isAlert = card.isAlert;
                return (
                  <Link
                    key={i}
                    href={card.href}
                    className={`p-5 rounded-xl border transition-all duration-200 relative overflow-hidden group block ${
                      isAlert
                        ? 'border-rose-500/50 bg-rose-950/20 hover:border-rose-400 hover:bg-rose-950/30 shadow-lg shadow-rose-950/30'
                        : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-slate-400 group-hover:text-slate-200 transition-colors">
                          {card.label}
                        </span>
                        {isAlert && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                          </span>
                        )}
                      </div>
                      <div className={`p-2 rounded-lg transition-transform group-hover:scale-110 ${card.bg}`}>
                        <Icon className={`w-4 h-4 ${card.color}`} />
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                      {loading ? (
                        <div className="h-8 w-16 bg-slate-800 animate-pulse rounded" />
                      ) : (
                        <div className={`text-2xl font-bold tracking-tight ${isAlert ? 'text-rose-400' : 'text-white'}`}>
                          {card.value}
                        </div>
                      )}
                      <span className="text-[11px] font-medium text-slate-500 group-hover:text-indigo-400 transition-colors flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                        View <ArrowUpRight className="w-3 h-3" />
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
            <div className="lg:col-span-2 rounded-xl border border-slate-800/80 bg-slate-900/30 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">Active Campaigns</h3>
                  <p className="text-xs text-slate-400">Campaigns currently sending or preparing drafts</p>
                </div>
                <Link
                  href="/campaigns"
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                >
                  View All <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {(!Array.isArray(campaigns) || campaigns.length === 0) ? (
                <div className="py-12 text-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40">
                  <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-300">No campaigns created yet</p>
                  <p className="text-xs text-slate-400 mt-1">Start by uploading leads and creating your first campaign.</p>
                  <Link
                    href="/campaigns/new"
                    className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white"
                  >
                    <Plus className="w-3.5 h-3.5" /> Create Campaign
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {(Array.isArray(campaigns) ? campaigns : []).slice(0, 5).map((camp) => (
                    <div
                      key={camp.id}
                      className="p-4 rounded-lg border border-slate-800/80 bg-slate-900/60 flex items-center justify-between hover:border-slate-700 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Link href={`/campaigns/${camp.id}`} className="text-sm font-medium text-white hover:underline">
                            {camp.name}
                          </Link>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                              camp.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : camp.status === 'paused'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-slate-700/30 text-slate-300'
                            }`}
                          >
                            {camp.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 line-clamp-1">{camp.offer || 'No offer specified'}</div>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <div className="hidden sm:block text-right">
                          <div className="text-slate-300 font-medium">Daily Limit: {camp.sending_config?.daily_limit || 10}</div>
                          <div className="text-[11px] text-slate-400">TZ: {camp.sending_config?.timezone || 'Default'}</div>
                        </div>
                        <Link
                          href={`/campaigns/${camp.id}`}
                          className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
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
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-indigo-400">
                  <Sparkles className="w-5 h-5" />
                  <h3 className="text-sm font-semibold text-white">Gemini AI Safety Guardrails</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Every personalized outreach message is verified against known facts. If unverified claims or fake familiarity are detected, the email is flagged for your review before dispatch.
                </p>
                <div className="space-y-2 pt-2 border-t border-slate-800 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>Zero hallucinated case studies or news</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>Automatic RFC 8058 one-click opt-out</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>Instant follow-up cancellation on reply</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span>Model Engine:</span>
                <span className="font-mono text-indigo-400 font-medium">Gemini 2.5 Flash</span>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
