'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { Pagination } from '@/components/Pagination';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  RotateCcw,
  Trash2,
  XCircle,
  Eye,
  Copy,
  Check,
  Search,
  Filter,
  Play,
  Sparkles,
  Send,
  Calendar,
  MessageSquare,
  Zap,
  Compass,
  ArrowLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { JobQueueItem } from '@/types/database';

function getJobTypeMeta(type: string) {
  switch (type) {
    case 'generate_email':
      return { label: 'Generate Draft', icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' };
    case 'send_email':
      return { label: 'Send Email', icon: Send, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' };
    case 'schedule_followup':
      return { label: 'Schedule Follow-up', icon: Calendar, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' };
    case 'sync_replies':
      return { label: 'Sync Replies', icon: MessageSquare, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' };
    case 'process_warmup':
    case 'send_warmup_email':
      return { label: 'Inbox Warmup', icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
    case 'process_discovery':
      return { label: 'Lead Discovery', icon: Compass, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
    default:
      return { label: type, icon: Activity, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' };
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'failed':
    case 'dead':
      return {
        label: status === 'dead' ? 'Dead (Exceeded Retries)' : 'Failed',
        icon: XCircle,
        badgeClass: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
      };
    case 'queued':
      return {
        label: 'Queued',
        icon: Clock,
        badgeClass: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      };
    case 'running':
      return {
        label: 'Running',
        icon: RefreshCw,
        badgeClass: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 animate-pulse',
      };
    case 'completed':
      return {
        label: 'Completed',
        icon: CheckCircle2,
        badgeClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
      };
    default:
      return {
        label: status,
        icon: Activity,
        badgeClass: 'bg-slate-500/10 border-slate-500/30 text-slate-400',
      };
  }
}

function JobsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialStatus = searchParams.get('status') || 'all';

  const [activeTab, setActiveTab] = useState<string>(initialStatus);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [jobs, setJobs] = useState<JobQueueItem[]>([]);
  const [totalJobs, setTotalJobs] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [counts, setCounts] = useState({
    all: 0,
    failed: 0,
    queued: 0,
    running: 0,
    completed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [runningWorker, setRunningWorker] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobQueueItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  const fetchJobs = async (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab !== 'all') params.set('status', activeTab);
      if (selectedType !== 'all') params.set('type', selectedType);
      params.set('page', String(targetPage));
      params.set('limit', String(targetPageSize));

      const res = await fetch(`/api/jobs?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setJobs(data.jobs || []);
        setTotalJobs(typeof data.total === 'number' ? data.total : (data.jobs || []).length);
        if (data.counts) {
          setCounts(data.counts);
        }
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchJobs(1, pageSize);
  }, [activeTab, selectedType]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams.toString());
    if (tab === 'all') {
      newParams.delete('status');
    } else {
      newParams.set('status', tab);
    }
    router.replace(`/jobs?${newParams.toString()}`);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRunWorker = async () => {
    setRunningWorker(true);
    setActionNotice(null);
    try {
      const res = await fetch('/api/jobs/process?force=true', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const completed = (data.results || []).filter((r: any) => r.status === 'completed').length;
        const failed = (data.results || []).filter((r: any) => r.status === 'failed').length;
        setActionNotice(`Worker executed: ${data.processed || 0} claimed (${completed} completed, ${failed} failed).`);
        fetchJobs();
      } else {
        setActionNotice(`Worker returned error: ${data.error || 'Unknown error'}`);
      }
    } catch {
      setActionNotice('Failed to trigger background worker.');
    } finally {
      setRunningWorker(false);
      setTimeout(() => setActionNotice(null), 6000);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    try {
      const res = await fetch('/api/jobs/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      if (res.ok) {
        setActionNotice(`Job ${jobId.slice(0, 8)} reset to queued.`);
        fetchJobs();
        if (selectedJob?.id === jobId) {
          setSelectedJob(null);
        }
      }
    } catch (err) {
      console.error('Error retrying job:', err);
    } finally {
      setRetryingJobId(null);
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  const handleRetryAllFailed = async () => {
    if (!confirm(`Are you sure you want to retry all ${counts.failed} failed/dead jobs?`)) return;
    setRunningWorker(true);
    try {
      const res = await fetch('/api/jobs/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allFailed: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionNotice(`Successfully reset ${data.retried || 0} failed job(s) back to queued.`);
        fetchJobs();
      }
    } catch (err) {
      console.error('Error retrying all failed jobs:', err);
    } finally {
      setRunningWorker(false);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to permanently delete this job from queue?')) return;
    setDeletingJobId(jobId);
    try {
      const res = await fetch(`/api/jobs?id=${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        setActionNotice('Job removed from queue.');
        fetchJobs();
        if (selectedJob?.id === jobId) {
          setSelectedJob(null);
        }
      }
    } catch (err) {
      console.error('Error deleting job:', err);
    } finally {
      setDeletingJobId(null);
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  const handleClearAllFailed = async () => {
    if (!confirm(`Are you sure you want to clear all ${counts.failed} failed/dead jobs? This cannot be undone.`)) return;
    try {
      const res = await fetch('/api/jobs?clear_failed=true', { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setActionNotice(`Cleared ${data.deleted || 0} failed job(s).`);
        fetchJobs();
      }
    } catch (err) {
      console.error('Error clearing failed jobs:', err);
    } finally {
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  // Filter jobs by search query
  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return jobs;
    const q = searchQuery.toLowerCase();
    return jobs.filter((job) => {
      const idMatch = job.id.toLowerCase().includes(q);
      const typeMatch = job.job_type.toLowerCase().includes(q);
      const errorMatch = (job.last_error || '').toLowerCase().includes(q);
      const payloadMatch = JSON.stringify(job.payload || {}).toLowerCase().includes(q);
      return idMatch || typeMatch || errorMatch || payloadMatch;
    });
  }, [jobs, searchQuery]);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Background Job Queue"
          subtitle="Inspect, debug, retry, and monitor background tasks & execution history"
        >
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunWorker}
              disabled={runningWorker}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/90 hover:bg-blue-600 text-white shadow-sm shadow-blue-600/30 transition-colors disabled:opacity-50"
              title="Process next queued batch immediately with worker"
            >
              <Play className={`w-3.5 h-3.5 ${runningWorker ? 'animate-spin' : ''}`} />
              <span>{runningWorker ? 'Worker Running...' : 'Run Worker Now'}</span>
            </button>
            <button
              onClick={() => fetchJobs()}
              disabled={loading}
              className="p-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors"
              title="Refresh Queue"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </Header>

        <main className="p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {actionNotice && (
            <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-center justify-between animate-fadeIn">
              <span>{actionNotice}</span>
              <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
          )}

          {/* Metric Cards Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <button
              onClick={() => handleTabChange('all')}
              className={`p-4 rounded-xl border text-left transition-all ${
                activeTab === 'all'
                  ? 'border-indigo-500 bg-indigo-950/20 shadow-md shadow-indigo-950/30'
                  : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>All Tasks</span>
                <Activity className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white">{counts.all}</div>
            </button>

            <button
              onClick={() => handleTabChange('failed')}
              className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden ${
                activeTab === 'failed'
                  ? 'border-rose-500 bg-rose-950/30 shadow-md shadow-rose-950/30'
                  : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700'
              } ${counts.failed > 0 ? 'border-rose-500/40' : ''}`}
            >
              <div className="flex items-center justify-between text-xs text-rose-400">
                <span className="flex items-center gap-1.5 font-medium">
                  Failed Jobs
                  {counts.failed > 0 && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                    </span>
                  )}
                </span>
                <XCircle className="w-4 h-4 text-rose-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-rose-400">{counts.failed}</div>
            </button>

            <button
              onClick={() => handleTabChange('queued')}
              className={`p-4 rounded-xl border text-left transition-all ${
                activeTab === 'queued'
                  ? 'border-amber-500 bg-amber-950/20 shadow-md shadow-amber-950/30'
                  : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-amber-400">
                <span>Queued</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-amber-300">{counts.queued}</div>
            </button>

            <button
              onClick={() => handleTabChange('running')}
              className={`p-4 rounded-xl border text-left transition-all ${
                activeTab === 'running'
                  ? 'border-indigo-500 bg-indigo-950/20 shadow-md shadow-indigo-950/30'
                  : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-indigo-400">
                <span>Running</span>
                <RefreshCw className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-indigo-300">{counts.running}</div>
            </button>

            <button
              onClick={() => handleTabChange('completed')}
              className={`p-4 rounded-xl border text-left transition-all ${
                activeTab === 'completed'
                  ? 'border-emerald-500 bg-emerald-950/20 shadow-md shadow-emerald-950/30'
                  : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-emerald-400">
                <span>Completed</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-300">{counts.completed}</div>
            </button>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/50 p-3 rounded-xl border border-slate-800/80">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by ID, error message, or payload..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Type Filter Dropdown */}
            <div className="flex items-center gap-2">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="all">All Job Types</option>
                <option value="generate_email">Generate Email Draft</option>
                <option value="send_email">Send Email</option>
                <option value="schedule_followup">Schedule Follow-up</option>
                <option value="sync_replies">Sync Replies</option>
                <option value="process_warmup">Inbox Warmup</option>
                <option value="process_discovery">Lead Discovery</option>
              </select>

              {/* Action Buttons for Failed Jobs */}
              {counts.failed > 0 && (
                <>
                  <button
                    onClick={handleRetryAllFailed}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/90 hover:bg-rose-600 text-white shadow-sm shadow-rose-600/20 transition-all shrink-0"
                    title="Retry all failed jobs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry All Failed ({counts.failed})</span>
                  </button>
                  <button
                    onClick={handleClearAllFailed}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 hover:bg-rose-950/30 hover:border-rose-800/50 hover:text-rose-300 text-slate-400 transition-colors shrink-0"
                    title="Clear all failed jobs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Failed</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Jobs List / Table */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 overflow-hidden shadow-xl">
            {loading ? (
              <div className="p-12 text-center space-y-3">
                <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-400">Loading queue jobs...</p>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="p-16 text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center mx-auto text-slate-400">
                  <Activity className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">No jobs found</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {activeTab === 'failed'
                    ? 'Great news! There are currently no failed background tasks in the queue.'
                    : activeTab !== 'all'
                    ? `No jobs with status "${activeTab}".`
                    : 'The background queue is currently empty.'}
                </p>
                {activeTab !== 'all' && (
                  <button
                    onClick={() => handleTabChange('all')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                  >
                    View all tasks
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {filteredJobs.map((job) => {
                  const typeMeta = getJobTypeMeta(job.job_type);
                  const statusMeta = getStatusBadge(job.status);
                  const isFailed = job.status === 'failed' || job.status === 'dead';
                  const TypeIcon = typeMeta.icon;
                  const StatusIcon = statusMeta.icon;

                  return (
                    <div
                      key={job.id}
                      className={`p-4 transition-colors hover:bg-slate-900/60 ${
                        isFailed ? 'bg-rose-950/10' : ''
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        {/* Left column: Type, status, ID */}
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Status Badge */}
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusMeta.badgeClass}`}
                            >
                              <StatusIcon className="w-3 h-3" />
                              <span>{statusMeta.label}</span>
                            </span>

                            {/* Job Type */}
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${typeMeta.bg} ${typeMeta.color}`}
                            >
                              <TypeIcon className="w-3 h-3" />
                              <span>{typeMeta.label}</span>
                            </span>

                            {/* Attempts */}
                            <span className="text-[11px] text-slate-400 font-mono">
                              Attempt {job.attempts} / {job.max_attempts}
                            </span>

                            {/* Idempotency Key if present */}
                            {job.idempotency_key && (
                              <span className="text-[10px] text-slate-500 font-mono bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800">
                                key: {job.idempotency_key}
                              </span>
                            )}
                          </div>

                          {/* ID & Timing */}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                            <span className="flex items-center gap-1 font-mono text-[11px]">
                              <span>ID:</span>
                              <span className="text-slate-300">{job.id.slice(0, 13)}...</span>
                              <button
                                onClick={() => handleCopy(job.id, job.id)}
                                className="text-slate-500 hover:text-slate-300 ml-0.5"
                                title="Copy full ID"
                              >
                                {copiedId === job.id ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </span>

                            <span>•</span>
                            <span>Created: {new Date(job.created_at).toLocaleString()}</span>
                            <span>•</span>
                            <span>Scheduled: {new Date(job.run_at).toLocaleString()}</span>
                          </div>

                          {/* Error Message Snippet if failed */}
                          {isFailed && job.last_error && (
                            <div className="mt-2 p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs font-mono break-all flex items-start justify-between gap-2">
                              <div className="flex items-start gap-1.5">
                                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                                <span>{job.last_error}</span>
                              </div>
                              <button
                                onClick={() => handleCopy(job.last_error || '', `err-${job.id}`)}
                                className="text-rose-400 hover:text-white shrink-0 p-1"
                                title="Copy error"
                              >
                                {copiedId === `err-${job.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Right column: Action buttons */}
                        <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                          {isFailed && (
                            <button
                              onClick={() => handleRetryJob(job.id)}
                              disabled={retryingJobId === job.id}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600/20 border border-rose-500/30 hover:bg-rose-600 hover:text-white text-rose-300 transition-all disabled:opacity-50"
                              title="Reset job to queued status"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${retryingJobId === job.id ? 'animate-spin' : ''}`} />
                              <span>{retryingJobId === job.id ? 'Retrying...' : 'Retry'}</span>
                            </button>
                          )}

                          <button
                            onClick={() => setSelectedJob(job)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-400" />
                            <span>Inspect</span>
                          </button>

                          <button
                            onClick={() => handleDeleteJob(job.id)}
                            disabled={deletingJobId === job.id}
                            className="p-1.5 rounded-lg text-xs font-medium bg-slate-900/60 border border-slate-800 hover:bg-rose-950/40 hover:text-rose-400 text-slate-500 transition-colors"
                            title="Delete this job"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {totalJobs > 0 && (
            <Pagination
              currentPage={page}
              totalItems={totalJobs}
              pageSize={pageSize}
              itemName="queue jobs"
              onPageChange={(newPage) => {
                setPage(newPage);
                fetchJobs(newPage, pageSize);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
                fetchJobs(1, newSize);
              }}
            />
          )}
        </main>
      </div>

      {/* Slide-over Inspection Drawer / Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl h-full bg-slate-950 border-l border-slate-800 flex flex-col shadow-2xl overflow-hidden">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                      getStatusBadge(selectedJob.status).badgeClass
                    }`}
                  >
                    {getStatusBadge(selectedJob.status).label}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Type: {selectedJob.job_type}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white mt-1">Task Details</h2>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Error Section (if failed) */}
              {(selectedJob.status === 'failed' || selectedJob.status === 'dead') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" /> Failure Reason & Stack Trace
                    </span>
                    <button
                      onClick={() => handleCopy(selectedJob.last_error || '', 'drawer-err')}
                      className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
                    >
                      {copiedId === 'drawer-err' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>Copy Error</span>
                    </button>
                  </div>
                  <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-300 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
                    {selectedJob.last_error || 'No error details recorded.'}
                  </div>
                </div>
              )}

              {/* Task Metadata Grid */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Metadata & Timestamps
                </span>
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Job ID</span>
                    <span className="font-mono text-slate-200 break-all select-all">{selectedJob.id}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Attempts</span>
                    <span className="font-mono text-slate-200">{selectedJob.attempts} of {selectedJob.max_attempts} max</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Scheduled Run Time</span>
                    <span className="text-slate-200">{new Date(selectedJob.run_at).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Created At</span>
                    <span className="text-slate-200">{new Date(selectedJob.created_at).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Last Updated</span>
                    <span className="text-slate-200">{new Date(selectedJob.updated_at).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Lock Status</span>
                    <span className="text-slate-200">
                      {selectedJob.locked_at ? `Locked until ${new Date(selectedJob.lock_expires_at || '').toLocaleTimeString()}` : 'Unlocked'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payload JSON */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-400 uppercase tracking-wider">
                    Task Payload Parameters
                  </span>
                  <button
                    onClick={() => handleCopy(JSON.stringify(selectedJob.payload, null, 2), 'drawer-payload')}
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
                  >
                    {copiedId === 'drawer-payload' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>Copy JSON</span>
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-indigo-300 text-xs font-mono overflow-x-auto leading-relaxed">
                  {JSON.stringify(selectedJob.payload, null, 2)}
                </pre>
              </div>

              {/* Related Resources Links if found in payload */}
              {selectedJob.payload && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Related Links
                  </span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {(selectedJob.payload as any).campaignId && (
                      <Link
                        href={`/campaigns/${(selectedJob.payload as any).campaignId}`}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-600/20 flex items-center gap-1 transition-colors"
                      >
                        <span>Campaign</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                    {(selectedJob.payload as any).emailMessageId && (
                      <Link
                        href={`/messages`}
                        className="px-3 py-1.5 rounded-lg bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600/20 flex items-center gap-1 transition-colors"
                      >
                        <span>View Messages</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                    {(selectedJob.payload as any).campaignLeadId && (
                      <Link
                        href={`/leads`}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-600/20 flex items-center gap-1 transition-colors"
                      >
                        <span>Lead Record</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
              <button
                onClick={() => handleDeleteJob(selectedJob.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-500/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Task</span>
              </button>

              <div className="flex items-center gap-2">
                {(selectedJob.status === 'failed' || selectedJob.status === 'dead') && (
                  <button
                    onClick={() => handleRetryJob(selectedJob.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-600/30 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry This Task</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedJob(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
        </div>
      }
    >
      <JobsContent />
    </Suspense>
  );
}
