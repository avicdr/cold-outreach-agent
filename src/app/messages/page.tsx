'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { Pagination } from '@/components/Pagination';
import { EmailMessage } from '@/types/database';
import {
  Mail,
  CheckCircle2,
  Clock,
  FileEdit,
  XCircle,
  Search,
  ExternalLink,
} from 'lucide-react';

export default function MessagesPage() {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchMessages = (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
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
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    setPage(1);
    fetchMessages(1, pageSize);
  }, [statusFilter]);

  const getStatusBadge = (status: EmailMessage['status']) => {
    switch (status) {
      case 'sent':
        return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> Sent</span>;
      case 'scheduled':
        return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20"><Clock className="w-3 h-3" /> Scheduled</span>;
      case 'draft':
        return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60"><FileEdit className="w-3 h-3" /> Draft</span>;
      case 'failed':
        return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20"><XCircle className="w-3 h-3" /> Failed</span>;
      default:
        return <span className="text-xs text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title="Messages" subtitle="History of sent, scheduled, and generated outreach messages" />

        <main className="p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {/* Status Tabs */}
          <div className="flex items-center gap-2 bg-slate-900/40 p-2 rounded-xl border border-slate-800 w-fit">
            {['', 'sent', 'scheduled', 'draft', 'failed'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === st ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st === '' ? 'All Messages' : st.charAt(0).toUpperCase() + st.slice(1)}
              </button>
            ))}
          </div>

          {/* Messages Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3 font-medium">Recipient / Lead</th>
                    <th className="px-5 py-3 font-medium">Subject</th>
                    <th className="px-5 py-3 font-medium">Step</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Date / Time</th>
                    <th className="px-5 py-3 font-medium text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-500">Loading messages...</td>
                    </tr>
                  ) : messages.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                        <Mail className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="text-sm font-medium text-slate-300">No messages found</p>
                        <p className="text-xs text-slate-500 mt-1">Generated and sent emails will appear here.</p>
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
                        <td className="px-5 py-3.5 max-w-xs truncate text-slate-300 font-medium">{msg.subject}</td>
                        <td className="px-5 py-3.5 text-slate-400">Step {msg.step_number}</td>
                        <td className="px-5 py-3.5">{getStatusBadge(msg.status)}</td>
                        <td className="px-5 py-3.5 text-slate-400 text-[11px]">
                          {msg.sent_at ? (
                            <span className="text-emerald-400 font-medium">
                              {new Date(msg.sent_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : msg.status === 'scheduled' ? (
                            <span className="text-blue-400 font-medium">
                              {msg.scheduled_at ? (
                                <span className="inline-flex flex-col">
                                  <span className="text-slate-300">
                                    {new Date(msg.scheduled_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                  </span>
                                  <span className="text-[10px] text-blue-400 font-mono">
                                    {new Date(msg.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </span>
                              ) : (
                                <span>Queued for Window</span>
                              )}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Link
                            href={msg.campaign_id ? `/campaigns/${msg.campaign_id}/editor?messageId=${msg.id}` : `/campaigns`}
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
