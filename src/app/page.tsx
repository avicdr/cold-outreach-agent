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
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  const statCards = [
    { label: 'Total Leads', value: stats?.totalLeads ?? 0, icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { label: 'Eligible Leads', value: stats?.eligibleLeads ?? 0, icon: UserCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Drafts Generated', value: stats?.draftsGenerated ?? 0, icon: FileEdit, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Emails Sent', value: stats?.emailsSent ?? 0, icon: Send, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Replies Received', value: stats?.repliesReceived ?? 0, icon: MessageSquare, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'Positive Replies', value: stats?.positiveReplies ?? 0, icon: ThumbsUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Bounce Count', value: stats?.bounceCount ?? 0, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Failed Jobs', value: stats?.failedJobs ?? 0, icon: XCircle, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title="Dashboard" subtitle="Overview of your cold outreach performance & active sequences">
          <div className="flex items-center gap-2">
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
          {/* Quick Metrics Grid */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Core Performance Metrics</h2>
              <span className="text-xs text-slate-400">Live verified database counts</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((card, i) => {
                const Icon = card.icon;
                return (
                  <div
                    key={i}
                    className="p-5 rounded-xl border border-slate-800/80 bg-slate-900/40 glass-card-hover relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-400">{card.label}</span>
                      <div className={`p-2 rounded-lg ${card.bg}`}>
                        <Icon className={`w-4 h-4 ${card.color}`} />
                      </div>
                    </div>
                    <div className="mt-3">
                      {loading ? (
                        <div className="h-8 w-16 bg-slate-800 animate-pulse rounded" />
                      ) : (
                        <div className="text-2xl font-bold tracking-tight text-white">{card.value}</div>
                      )}
                    </div>
                  </div>
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
