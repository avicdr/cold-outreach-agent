'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { Pagination } from '@/components/Pagination';
import {
  Compass,
  Plus,
  Play,
  Pause,
  RefreshCw,
  Search,
  Filter,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Building2,
  Phone,
  Mail,
  Globe,
  Star,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Send,
  Trash2,
  X,
  Target,
  FileSpreadsheet,
  Check,
  Layers,
} from 'lucide-react';
import { DiscoveryJob, Lead, Campaign } from '@/types/database';

const NICHE_PRESETS = [
  { name: 'Dentists & Orthodontists', value: 'Dentist' },
  { name: 'Dermatology & Aesthetic Clinics', value: 'Dermatology Clinic' },
  { name: 'Physiotherapy & Rehab', value: 'Physiotherapy Clinic' },
  { name: 'Veterinary Clinics', value: 'Veterinary Clinic' },
  { name: 'Eye Clinics & Optometrists', value: 'Optometry Clinic' },
  { name: 'Salons & Medical Spas', value: 'Medical Spa' },
  { name: 'Law Firms & Attorneys', value: 'Law Firm' },
  { name: 'Home Services', value: 'HVAC and Plumbing Services' },
];

export default function DiscoveryPage() {
  const [activeTab, setActiveTab] = useState<'jobs' | 'leads' | 'monitoring'>('jobs');
  const [jobs, setJobs] = useState<DiscoveryJob[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);

  // Pagination states
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsPageSize, setLeadsPageSize] = useState(25);
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsPageSize, setJobsPageSize] = useState(9);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterNiche, setFilterNiche] = useState<string>('all');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [inspectingLead, setInspectingLead] = useState<Lead | null>(null);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [enrollTargetCampaignId, setEnrollTargetCampaignId] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    niche: 'Dentist',
    location: '',
    country: 'US',
    radius_km: 25,
    target_count: 20,
    min_qualification_score: 70,
    auto_enroll_campaign_id: '',
    auto_enroll_enabled: false,
    schedule_frequency: 'once' as 'once' | 'daily' | 'weekly',
    run_immediately: true,
  });

  // Load Initial Data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [jobsRes, campaignsRes] = await Promise.all([
        fetch('/api/discovery/jobs'),
        fetch('/api/campaigns'),
      ]);

      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(jobsData);
      }
      if (campaignsRes.ok) {
        const campsData = await campaignsRes.json();
        setCampaigns(campsData);
      }
    } catch (err) {
      console.error('Failed to fetch discovery data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLeads = async (targetPage = leadsPage, targetPageSize = leadsPageSize) => {
    try {
      const params = new URLSearchParams();
      if (filterPriority !== 'all') params.set('priority', filterPriority);
      if (filterNiche !== 'all') params.set('category', filterNiche);
      if (searchQuery) params.set('search', searchQuery);
      params.set('limit', String(targetPageSize));
      params.set('offset', String((targetPage - 1) * targetPageSize));

      const res = await fetch(`/api/discovery/leads?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
        setTotalLeads(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'leads') {
      setLeadsPage(1);
      fetchLeads(1, leadsPageSize);
    }
  }, [activeTab, filterPriority, filterNiche, searchQuery]);

  // Handle Form Submission
  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/discovery/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          auto_enroll_campaign_id: formData.auto_enroll_campaign_id || null,
        }),
      });

      if (res.ok) {
        setIsCreateModalOpen(false);
        setFormData({
          name: '',
          niche: 'Dentist',
          location: '',
          country: 'US',
          radius_km: 25,
          target_count: 20,
          min_qualification_score: 70,
          auto_enroll_campaign_id: '',
          auto_enroll_enabled: false,
          schedule_frequency: 'once',
          run_immediately: true,
        });
        await fetchData();
        if (activeTab === 'leads') fetchLeads();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create discovery job');
      }
    } catch (err: any) {
      alert(`Error creating job: ${err.message}`);
    }
  };

  // Run Job Trigger
  const handleRunJob = async (jobId: string) => {
    setRunningJobId(jobId);
    try {
      const res = await fetch(`/api/discovery/jobs/${jobId}/run`, { method: 'POST' });
      if (res.ok) {
        await fetchData();
        if (activeTab === 'leads') fetchLeads();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to run discovery job');
      }
    } catch (err: any) {
      alert(`Error triggering job: ${err.message}`);
    } finally {
      setRunningJobId(null);
    }
  };

  // Toggle Pause/Resume
  const handleTogglePause = async (job: DiscoveryJob) => {
    const newStatus = job.status === 'paused' ? 'queued' : 'paused';
    try {
      const res = await fetch(`/api/discovery/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to update job status:', err);
    }
  };

  // Delete Job
  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this discovery job?')) return;
    try {
      const res = await fetch(`/api/discovery/jobs/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to delete job:', err);
    }
  };

  // Bulk Enroll Selected Leads
  const handleEnrollSelected = async () => {
    if (!enrollTargetCampaignId || selectedLeadIds.length === 0) return;
    try {
      const res = await fetch('/api/discovery/leads/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: enrollTargetCampaignId,
          leadIds: selectedLeadIds,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Successfully enrolled ${data.enrolled} leads into campaign!`);
        setIsEnrollModalOpen(false);
        setSelectedLeadIds([]);
        fetchLeads();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to enroll leads');
      }
    } catch (err: any) {
      alert(`Error enrolling leads: ${err.message}`);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (filterPriority !== 'all') params.set('priority', filterPriority);
    if (filterNiche !== 'all') params.set('category', filterNiche);
    window.location.href = `/api/discovery/export?${params.toString()}`;
  };

  // Compute metrics
  const totalDiscovered = jobs.reduce((acc, j) => acc + (j.discovered_count || 0), 0);
  const totalQualified = jobs.reduce((acc, j) => acc + (j.qualified_count || 0), 0);
  const totalHighPriority = jobs.reduce((acc, j) => acc + (j.high_priority_count || 0), 0);
  const totalEnrolled = jobs.reduce((acc, j) => acc + (j.enrolled_count || 0), 0);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header
          title="Lead Discovery & Qualification"
          subtitle="Discover local appointment-based businesses, qualify with Gemini, and route into outreach campaigns"
        />

        <main className="p-8 max-w-7xl mx-auto w-full space-y-6">
          {/* Header Title & Actions */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner">
                  <Compass className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                    AI Lead Discovery & Qualification
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                      Gemini Powered
                    </span>
                  </h1>
                  <p className="text-sm text-slate-400">
                    Discover local appointment-based businesses, enrich contact channels, score with Gemini, and route into outreach.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all text-sm font-medium shadow-sm"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Export CSV / Sheets
              </button>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white transition-all text-sm font-semibold shadow-lg shadow-indigo-600/25"
              >
                <Plus className="w-4 h-4" />
                New Discovery Job
              </button>
            </div>
          </div>

          {/* Metrics Banner */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm relative overflow-hidden group">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Discovered</div>
              <div className="mt-2 text-2xl font-bold text-white flex items-baseline gap-2">
                {totalDiscovered}
                <span className="text-xs text-slate-500 font-normal">businesses</span>
              </div>
              <div className="absolute right-4 bottom-4 text-slate-800 group-hover:text-indigo-500/20 transition-colors">
                <Building2 className="w-8 h-8" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm relative overflow-hidden group">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Qualified Leads</div>
              <div className="mt-2 text-2xl font-bold text-indigo-400 flex items-baseline gap-2">
                {totalQualified}
                <span className="text-xs text-slate-500 font-normal">fit criteria</span>
              </div>
              <div className="absolute right-4 bottom-4 text-slate-800 group-hover:text-indigo-500/20 transition-colors">
                <Sparkles className="w-8 h-8" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm relative overflow-hidden group">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">High Priority (80-100)</div>
              <div className="mt-2 text-2xl font-bold text-emerald-400 flex items-baseline gap-2">
                {totalHighPriority}
                <span className="text-xs text-slate-500 font-normal">prime targets</span>
              </div>
              <div className="absolute right-4 bottom-4 text-slate-800 group-hover:text-emerald-500/20 transition-colors">
                <Target className="w-8 h-8" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm relative overflow-hidden group">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Campaign Enrolled</div>
              <div className="mt-2 text-2xl font-bold text-violet-400 flex items-baseline gap-2">
                {totalEnrolled}
                <span className="text-xs text-slate-500 font-normal">in outreach</span>
              </div>
              <div className="absolute right-4 bottom-4 text-slate-800 group-hover:text-violet-500/20 transition-colors">
                <Send className="w-8 h-8" />
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-800">
            <button
              onClick={() => setActiveTab('jobs')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'jobs'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Compass className="w-4 h-4" />
              Discovery Jobs & Automation ({jobs.length})
            </button>
            <button
              onClick={() => setActiveTab('leads')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'leads'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Qualified Leads ({totalLeads})
            </button>
            <button
              onClick={() => setActiveTab('monitoring')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'monitoring'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-4 h-4" />
              Monitoring & History
            </button>
          </div>

          {/* TAB 1: Discovery Jobs */}
          {activeTab === 'jobs' && (
            <div className="space-y-4">
              {jobs.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-dashed border-slate-800 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
                    <Compass className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">No discovery jobs yet</h3>
                  <p className="text-sm text-slate-400 max-w-md mx-auto">
                    Create your first automated search job to discover local dental clinics, dermatology centers, spas, or lawyers in your target market.
                  </p>
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-md shadow-indigo-600/20"
                  >
                    Create First Job
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {jobs.slice((jobsPage - 1) * jobsPageSize, jobsPage * jobsPageSize).map((job) => (
                    <div
                      key={job.id}
                      className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-white text-base leading-tight">{job.name}</h3>
                            <div className="text-xs text-indigo-400 mt-0.5">{job.niche}</div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                              job.status === 'running'
                                ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 animate-pulse'
                                : job.status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : job.status === 'paused'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : job.status === 'failed'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {job.status}
                          </span>
                        </div>

                        <div className="space-y-1.5 text-xs text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">Location:</span>
                            <span className="text-slate-200">{job.location} ({job.country})</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">Schedule:</span>
                            <span className="capitalize text-slate-200">{job.schedule_frequency}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">Min Score:</span>
                            <span className="text-slate-200">{job.min_qualification_score} pts</span>
                          </div>
                          {job.auto_enroll_enabled && (
                            <div className="flex items-center gap-1.5 text-violet-400">
                              <Send className="w-3 h-3" />
                              <span>Auto-enrolling into campaign</span>
                            </div>
                          )}
                        </div>

                        {/* Progress Stats */}
                        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 grid grid-cols-4 text-center">
                          <div>
                            <div className="text-xs font-bold text-white">{job.discovered_count}</div>
                            <div className="text-[10px] text-slate-500">Found</div>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-indigo-400">{job.qualified_count}</div>
                            <div className="text-[10px] text-slate-500">Qual.</div>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-emerald-400">{job.high_priority_count}</div>
                            <div className="text-[10px] text-slate-500">High</div>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-violet-400">{job.enrolled_count}</div>
                            <div className="text-[10px] text-slate-500">Sent</div>
                          </div>
                        </div>

                        {job.error_message && (
                          <div className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20 truncate">
                            {job.error_message}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                        <button
                          onClick={() => handleRunJob(job.id)}
                          disabled={runningJobId === job.id || job.status === 'running'}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 hover:text-white transition-all text-xs font-medium disabled:opacity-50"
                        >
                          {runningJobId === job.id || job.status === 'running' ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                          Run Now
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleTogglePause(job)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title={job.status === 'paused' ? 'Resume Job' : 'Pause Job'}
                          >
                            {job.status === 'paused' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleDeleteJob(job.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                            title="Delete Job"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Jobs Pagination */}
              {jobs.length > 0 && (
                <Pagination
                  currentPage={jobsPage}
                  totalItems={jobs.length}
                  pageSize={jobsPageSize}
                  pageSizeOptions={[6, 9, 18, 36]}
                  itemName="discovery jobs"
                  onPageChange={(newPage) => setJobsPage(newPage)}
                  onPageSizeChange={(newSize) => {
                    setJobsPageSize(newSize);
                    setJobsPage(1);
                  }}
                />
              )}
            </div>
          )}

          {/* TAB 2: Qualified Leads */}
          {activeTab === 'leads' && (
            <div className="space-y-4">
              {/* Search & Filters */}
              <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                <div className="flex-1 flex items-center gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search company, city, or summary..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="all">All Priorities</option>
                    <option value="high">High Priority (80+)</option>
                    <option value="review">Review (60-79)</option>
                    <option value="low">Low Priority (&lt;60)</option>
                  </select>
                </div>

                {selectedLeadIds.length > 0 && (
                  <button
                    onClick={() => setIsEnrollModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-md shadow-indigo-600/20"
                  >
                    <Send className="w-4 h-4" />
                    Assign {selectedLeadIds.length} to Campaign
                  </button>
                )}
              </div>

              {/* Leads Table */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 overflow-hidden">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/80 text-xs font-medium text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="p-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.length > 0 && selectedLeadIds.length === leads.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedLeadIds(leads.map((l) => l.id));
                            else setSelectedLeadIds([]);
                          }}
                          className="rounded bg-slate-800 border-slate-700 text-indigo-600"
                        />
                      </th>
                      <th className="p-3">Business</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Contact</th>
                      <th className="p-3">Score & Priority</th>
                      <th className="p-3">Observed Friction</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {leads.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-500">
                          No qualified leads match the current filters.
                        </td>
                      </tr>
                    ) : (
                      leads.map((lead) => {
                        const isSelected = selectedLeadIds.includes(lead.id);
                        return (
                          <tr key={lead.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedLeadIds([...selectedLeadIds, lead.id]);
                                  else setSelectedLeadIds(selectedLeadIds.filter((id) => id !== lead.id));
                                }}
                                className="rounded bg-slate-800 border-slate-700 text-indigo-600"
                              />
                            </td>
                            <td className="p-3">
                              <div className="font-semibold text-white">{lead.company}</div>
                              <div className="text-xs text-slate-400">
                                {[lead.city, lead.state, lead.country].filter(Boolean).join(', ')}
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                                {lead.category || 'Local Clinic'}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="space-y-0.5 text-xs">
                                {lead.phone && (
                                  <div className="flex items-center gap-1 text-slate-300">
                                    <Phone className="w-3 h-3 text-indigo-400" />
                                    {lead.phone}
                                  </div>
                                )}
                                {lead.website && (
                                  <a
                                    href={lead.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-indigo-400 hover:underline"
                                  >
                                    <Globe className="w-3 h-3" />
                                    {lead.canonical_domain || 'Website'}
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                                    (lead.qualification_score || 0) >= 80
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : (lead.qualification_score || 0) >= 60
                                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                                  }`}
                                >
                                  {lead.qualification_score ?? 'N/A'}
                                </div>
                                <div>
                                  <div className="text-xs font-semibold capitalize text-slate-200">
                                    {lead.qualification_priority || 'unscored'}
                                  </div>
                                  <div className="text-[10px] text-slate-500 capitalize">
                                    {lead.qualification_confidence} confidence
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 max-w-xs">
                              {lead.observed_friction && lead.observed_friction.length > 0 ? (
                                <div className="text-xs text-slate-300 line-clamp-2">
                                  {lead.observed_friction[0].finding}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-500">None detected</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => setInspectingLead(lead)}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400 hover:text-indigo-300 text-xs font-medium transition-colors"
                              >
                                View Evidence
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Qualified Leads Pagination */}
              {totalLeads > 0 && (
                <Pagination
                  currentPage={leadsPage}
                  totalItems={totalLeads}
                  pageSize={leadsPageSize}
                  pageSizeOptions={[10, 25, 50, 100]}
                  itemName="discovered leads"
                  onPageChange={(newPage) => {
                    setLeadsPage(newPage);
                    fetchLeads(newPage, leadsPageSize);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onPageSizeChange={(newSize) => {
                    setLeadsPageSize(newSize);
                    setLeadsPage(1);
                    fetchLeads(1, newSize);
                  }}
                />
              )}
            </div>
          )}

          {/* TAB 3: Monitoring & Execution History */}
          {activeTab === 'monitoring' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white text-base">Continuous Discovery Scheduler</h3>
                  <span className="text-xs text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Daemon Active
                  </span>
                </div>
                <p className="text-sm text-slate-400">
                  Discovery jobs run continuously in the background on your configured schedule (once, daily, or weekly).
                  Leads meeting your qualification threshold can automatically be routed into cold email campaigns with friction-backed personalization.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="text-xs text-slate-400">Total Active Jobs</div>
                    <div className="text-xl font-bold text-white mt-1">
                      {jobs.filter((j) => j.status !== 'paused').length}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="text-xs text-slate-400">Deduplication Signals</div>
                    <div className="text-xs text-slate-300 mt-1">
                      Domain, E.164 Phone, Place ID, Name+City
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="text-xs text-slate-400">AI Scoring Engine</div>
                    <div className="text-xs text-indigo-400 mt-1">
                      Gemini 2.5 / 6-Factor Rubric
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* CREATE JOB MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Create Automated Discovery Job</h2>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateJob} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Job Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Austin Dental Clinics Discovery"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Target Niche</label>
                  <select
                    value={formData.niche}
                    onChange={(e) => setFormData({ ...formData, niche: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    {NICHE_PRESETS.map((p) => (
                      <option key={p.name} value={p.value}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Target City / Area</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Austin, TX"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Target Leads Count</label>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={formData.target_count}
                    onChange={(e) => setFormData({ ...formData, target_count: parseInt(e.target.value, 10) })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Min Score for Outreach</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.min_qualification_score}
                    onChange={(e) =>
                      setFormData({ ...formData, min_qualification_score: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Operating Schedule</label>
                <select
                  value={formData.schedule_frequency}
                  onChange={(e) =>
                    setFormData({ ...formData, schedule_frequency: e.target.value as any })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="once">Run Once</option>
                  <option value="daily">Daily Automated Discovery</option>
                  <option value="weekly">Weekly Recurring Discovery</option>
                </select>
              </div>

              {/* Auto Enroll Section */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Auto-Enroll Qualified Leads</div>
                    <div className="text-xs text-slate-400">
                      Directly add leads with score &ge; {formData.min_qualification_score} into an outreach campaign
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.auto_enroll_enabled}
                    onChange={(e) => setFormData({ ...formData, auto_enroll_enabled: e.target.checked })}
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                </div>

                {formData.auto_enroll_enabled && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <label className="text-xs font-semibold text-slate-300">Target Campaign</label>
                    <select
                      value={formData.auto_enroll_campaign_id}
                      onChange={(e) => setFormData({ ...formData, auto_enroll_campaign_id: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Select a Campaign...</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.status})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="run_immediately"
                  checked={formData.run_immediately}
                  onChange={(e) => setFormData({ ...formData, run_immediately: e.target.checked })}
                  className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
                />
                <label htmlFor="run_immediately" className="text-xs text-slate-300">
                  Execute discovery immediately upon saving
                </label>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/20"
                >
                  Create Job
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LEAD EVIDENCE INSPECTION DRAWER */}
      {inspectingLead && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">{inspectingLead.company}</h2>
                <div className="text-xs text-slate-400">
                  {[inspectingLead.city, inspectingLead.state, inspectingLead.country].filter(Boolean).join(', ')}
                </div>
              </div>
              <button
                onClick={() => setInspectingLead(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* Score Header */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-base ${
                      (inspectingLead.qualification_score || 0) >= 80
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {inspectingLead.qualification_score}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white capitalize">
                      {inspectingLead.qualification_priority} Priority Fit
                    </div>
                    <div className="text-xs text-slate-400 capitalize">
                      {inspectingLead.qualification_confidence} Confidence
                    </div>
                  </div>
                </div>

                <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {inspectingLead.category || 'General Service'}
                </span>
              </div>

              {/* Qualification Summary */}
              {inspectingLead.qualification_summary && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Qualification Summary</div>
                  <p className="text-sm text-slate-200 bg-slate-950 p-3 rounded-xl border border-slate-800">
                    {inspectingLead.qualification_summary}
                  </p>
                </div>
              )}

              {/* Observed Booking Friction */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Verified Friction &amp; Evidence
                </div>
                {inspectingLead.observed_friction && inspectingLead.observed_friction.length > 0 ? (
                  <div className="space-y-2">
                    {inspectingLead.observed_friction.map((f: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1"
                      >
                        <div className="font-medium text-slate-200">{f.finding}</div>
                        <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                          <span>Type: {f.evidence_type}</span>
                          {f.source_url && (
                            <a
                              href={f.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 hover:underline flex items-center gap-0.5"
                            >
                              Source <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">No friction points registered.</div>
                )}
              </div>

              {/* Sales Angle & Opening Hook */}
              {inspectingLead.sales_angle && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recommended Sales Angle</div>
                  <div className="text-xs text-indigo-300 bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20">
                    {inspectingLead.sales_angle}
                  </div>
                </div>
              )}

              {inspectingLead.suggested_opening && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Suggested Cold Hook</div>
                  <div className="text-xs text-slate-200 italic bg-slate-950 p-3 rounded-xl border border-slate-800">
                    &ldquo;{inspectingLead.suggested_opening}&rdquo;
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 flex items-center justify-end">
              <button
                onClick={() => setInspectingLead(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-sm font-medium hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ENROLL IN CAMPAIGN MODAL */}
      {isEnrollModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-indigo-400" />
              Assign {selectedLeadIds.length} Leads to Campaign
            </h3>
            <p className="text-xs text-slate-400">
              Selected leads will be enrolled into the campaign. The personalized sales angle and suggested opening will be fed into Gemini for email generation.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Choose Outreach Campaign</label>
              <select
                value={enrollTargetCampaignId}
                onChange={(e) => setEnrollTargetCampaignId(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select a campaign...</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status})
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsEnrollModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleEnrollSelected}
                disabled={!enrollTargetCampaignId}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50"
              >
                Confirm Enrollment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
