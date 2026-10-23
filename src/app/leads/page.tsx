'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { Lead } from '@/types/database';
import {
  Search,
  Upload,
  Download,
  Filter,
  Building,
  Mail,
  CheckCircle,
  Clock,
  MessageSquare,
  Ban,
  AlertCircle,
  Plus,
  Users,
} from 'lucide-react';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchLeads = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);

    fetch(`/api/leads?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setLeads(Array.isArray(data?.leads) ? data.leads : []);
        setTotal(typeof data?.total === 'number' ? data.total : 0);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch leads:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLeads();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLeads();
  };

  const getStatusBadge = (status: Lead['status']) => {
    switch (status) {
      case 'active':
        return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle className="w-3 h-3" /> Active</span>;
      case 'contacted':
        return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20"><Clock className="w-3 h-3" /> Contacted</span>;
      case 'replied':
        return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20"><MessageSquare className="w-3 h-3" /> Replied</span>;
      case 'unsubscribed':
        return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20"><Ban className="w-3 h-3" /> Opted Out</span>;
      case 'bounced':
        return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"><AlertCircle className="w-3 h-3" /> Bounced</span>;
      default:
        return <span className="text-xs text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title="Leads & Prospects" subtitle={`Total prospects loaded: ${total}`}>
          <div className="flex items-center gap-2">
            <Link
              href="/leads/import"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Leads Wizard</span>
            </Link>
          </div>
        </Header>

        <main className="p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-900/40 p-4 rounded-xl border border-slate-800">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2 w-full max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search name, email, company..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                Search
              </button>
            </form>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="">All Statuses</option>
                <option value="active">Active (Eligible)</option>
                <option value="contacted">Contacted</option>
                <option value="replied">Replied</option>
                <option value="unsubscribed">Opted Out</option>
                <option value="bounced">Bounced</option>
              </select>
            </div>
          </div>

          {/* Leads Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3 font-medium">Business / Prospect</th>
                    <th className="px-5 py-3 font-medium">Contact & Location</th>
                    <th className="px-5 py-3 font-medium">Rating & Reviews</th>
                    <th className="px-5 py-3 font-medium">Personalization Hook</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                          <span>Loading leads...</span>
                        </div>
                      </td>
                    </tr>
                  ) : leads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                        <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="text-sm font-medium text-slate-300">No leads found</p>
                        <p className="text-xs text-slate-500 mt-1">Upload a CSV or Excel spreadsheet using the Import Wizard.</p>
                        <Link
                          href="/leads/import"
                          className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white"
                        >
                          <Upload className="w-3.5 h-3.5" /> Import Leads
                        </Link>
                      </td>
                    </tr>
                  ) : (
                    leads.map((lead) => {
                      const businessName = lead.company || lead.custom_fields?.['Business_Name'] || '—';
                      const category = lead.category || lead.custom_fields?.['Category_Niche'] || '';
                      const city = lead.city || lead.custom_fields?.['City_Area'] || '';
                      const country = lead.country || lead.custom_fields?.['Country'] || '';
                      const rating = lead.rating || lead.custom_fields?.['Google_Rating'];
                      const reviews = lead.review_count || lead.custom_fields?.['Google_Review_Count'];
                      const score = lead.qualification_score || lead.custom_fields?.['Lead_Qualification_Score'];
                      const hook = lead.suggested_opening || lead.sales_angle || lead.custom_fields?.['Cold_Email_Personalization_Hook'] || '';

                      return (
                        <tr key={lead.id} className="hover:bg-slate-900/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-slate-100 flex items-center gap-2">
                              <span>{String(businessName)}</span>
                              {category && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                                  {String(category)}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {lead.first_name || lead.last_name
                                ? `${lead.first_name} ${lead.last_name}`.trim()
                                : lead.job_title || 'Direct Profile'}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="text-[11px] text-slate-300 font-mono">{lead.email}</div>
                            {(city || country) && (
                              <div className="text-[11px] text-slate-500">
                                {[city, country].filter(Boolean).join(', ')}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            {rating || reviews ? (
                              <div className="space-y-0.5">
                                <div className="text-amber-400 font-medium text-[11px] flex items-center gap-1">
                                  <span>★</span>
                                  <span>{rating || '5.0'}</span>
                                  <span className="text-slate-400 font-normal">({reviews || 0} reviews)</span>
                                </div>
                                {score && (
                                  <div className="text-[10px] text-emerald-400 font-mono">
                                    Fit: {score}/100
                                  </div>
                                )}
                              </div>
                            ) : score ? (
                              <span className="text-[11px] text-emerald-400 font-mono">Fit: {score}/100</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 max-w-xs">
                            {hook ? (
                              <div className="text-[11px] text-slate-300 line-clamp-2" title={String(hook)}>
                                {String(hook)}
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">{getStatusBadge(lead.status)}</td>
                          <td className="px-5 py-3.5 text-slate-500 text-[11px]">
                            {new Date(lead.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
