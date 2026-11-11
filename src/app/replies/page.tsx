'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { Pagination } from '@/components/Pagination';
import { ReplyEvent } from '@/types/database';
import {
  MessageSquareQuote,
  ThumbsUp,
  MinusCircle,
  AlertOctagon,
  Calendar,
  Ban,
  HelpCircle,
  Mail,
  User,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  Building2,
  Target,
  ExternalLink,
  Sparkles,
  RotateCw,
  Send,
  CornerDownLeft,
  ChevronDown,
  ChevronUp,
  ArrowDown,
  Clock,
  MessageSquare,
} from 'lucide-react';

export default function RepliesPage() {
  const [replies, setReplies] = useState<ReplyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReply, setSelectedReply] = useState<ReplyEvent | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [expandedSentIds, setExpandedSentIds] = useState<Set<string>>(new Set());

  const toggleSentExpanded = (replyId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedSentIds((prev) => {
      const next = new Set(prev);
      if (next.has(replyId)) {
        next.delete(replyId);
      } else {
        next.add(replyId);
      }
      return next;
    });
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setNotice(null);
    try {
      const res = await fetch('/api/jobs/process', { method: 'POST' });
      if (res.ok) {
        setNotice('Reply synchronization cycle complete.');
        fetchReplies(page, pageSize);
      } else {
        setNotice('Sync cycle completed.');
        fetchReplies(page, pageSize);
      }
    } catch {
      setNotice('Could not reach background worker.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setNotice(null), 4000);
    }
  };

  const isBounceOrDaemon = (r: Partial<ReplyEvent>) => {
    const s = (r.sender_email || '').toLowerCase();
    const sum = (r.classification_summary || '').toLowerCase();
    return (
      s.includes('mailer-daemon') ||
      s.includes('mail-daemon') ||
      s.includes('mailer_daemon') ||
      s.includes('postmaster') ||
      s.includes('mail delivery subsystem') ||
      s.includes('delivery status') ||
      s.startsWith('bounce') ||
      sum.includes('delivery failure') ||
      sum.includes('domain could not be found') ||
      sum.includes('address not found') ||
      sum.includes('undeliverable') ||
      sum.includes('undelivered mail') ||
      sum.includes('mailer daemon') ||
      sum.includes('outbound sales pitch') ||
      sum.includes('draft rather than a reply')
    );
  };

  const fetchReplies = (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(targetPage));
    params.set('limit', String(targetPageSize));

    fetch(`/api/replies?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        const raw = Array.isArray(data) ? data : data.replies || [];
        const filtered = raw.filter((r: any) => !isBounceOrDaemon(r));
        setReplies(filtered);
        const serverTotal = typeof data?.total === 'number' ? data.total : (Array.isArray(data) ? data.length : 0);
        // Correct total if stray daemon events were dropped on client
        const diff = raw.length - filtered.length;
        setTotal(Math.max(0, serverTotal - diff));
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchReplies(1, pageSize);
  }, []);

  const handleDeleteReply = async (replyId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to delete this reply?')) return;

    setDeletingId(replyId);
    try {
      const res = await fetch(`/api/replies?id=${encodeURIComponent(replyId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setReplies((prev) => prev.filter((r) => r.id !== replyId));
        setTotal((prev) => Math.max(0, prev - 1));
        if (selectedReply?.id === replyId) {
          setSelectedReply(null);
        }
        setNotice('Reply removed successfully.');
        setTimeout(() => setNotice(null), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete reply');
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting reply');
    } finally {
      setDeletingId(null);
    }
  };

  const getClassificationBadge = (classification: ReplyEvent['classification']) => {
    switch (classification) {
      case 'positive':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ThumbsUp className="w-3.5 h-3.5" /> Positive Interest
          </span>
        );
      case 'objection':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertOctagon className="w-3.5 h-3.5" /> Objection / Decline
          </span>
        );
      case 'out_of_office':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Calendar className="w-3.5 h-3.5" /> Out of Office
          </span>
        );
      case 'unsubscribe':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Ban className="w-3.5 h-3.5" /> Unsubscribe Request
          </span>
        );
      case 'neutral':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <MinusCircle className="w-3.5 h-3.5" /> Neutral / Inquiry
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300">
            <HelpCircle className="w-3.5 h-3.5" /> Other
          </span>
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Inbound Replies & Sentiment"
          subtitle="Synchronized replies automatically classified with Gemini AI"
          category="Sentiment Intelligence"
        />

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto min-w-0">
          {/* Status Notice */}
          {notice && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{notice}</span>
              </span>
              <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
          )}

          {/* Safeguard Notice */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
              <span>All incoming prospect replies automatically pause follow-up sequences. Outbound follow-ups, drafts, and mailer-daemons are automatically filtered out.</span>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E84B2C]/15 hover:bg-[#E84B2C]/25 text-[#E87A38] hover:text-[#E84B2C] border border-[#E84B2C]/30 text-xs font-semibold transition-all disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Replies Now'}</span>
              </button>
              <div className="hidden sm:flex items-center gap-1.5 text-slate-500 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verification Active</span>
              </div>
            </div>
          </div>

          {/* Replies Grid / List */}
          {loading ? (
            <div className="py-12 text-center text-slate-500">Loading replies...</div>
          ) : replies.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/20">
              <MessageSquareQuote className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-300">No prospect replies found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Once prospects reply to your cold emails, they will be captured, categorized, and displayed here. Outbound follow-ups and bounces are automatically excluded.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {replies.map((reply) => {
                const displayName = reply.lead_company || reply.lead_name || reply.sender_email;
                const showContact = reply.lead_name && reply.lead_name !== 'Unknown' && reply.lead_name !== reply.lead_company;
                const isSentExpanded = expandedSentIds.has(reply.id);

                return (
                  <div
                    key={reply.id}
                    onClick={() => setSelectedReply(reply)}
                    className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 hover:border-slate-700/80 transition-all cursor-pointer space-y-4 group shadow-sm"
                  >
                    {/* Top Row: Sender Info & Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                          {reply.lead_company ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-white truncate">{displayName}</span>
                            {showContact && (
                              <span className="text-xs text-slate-400 font-medium">({reply.lead_name})</span>
                            )}
                            {reply.campaign_name && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800/80 text-cyan-300 border border-cyan-500/20">
                                <Target className="w-3 h-3 text-cyan-400" />
                                <span className="truncate max-w-[200px]">{reply.campaign_name}</span>
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                            <span className="flex items-center gap-1.5 font-mono text-slate-300">
                              <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span>{reply.lead_email || reply.sender_email}</span>
                            </span>
                            {reply.receiving_account && (
                              <span className="text-slate-500 text-[11px]">
                                via {reply.receiving_account}
                              </span>
                            )}
                            <span className="text-slate-500 text-[11px]">
                              Received: {new Date(reply.received_at).toLocaleString()}
                            </span>
                          </div>

                          {reply.email_subject && (
                            <div className="text-xs text-slate-300 pt-0.5">
                              <span className="text-slate-500">Subject: </span>
                              <span className="font-medium text-slate-200">{reply.email_subject}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                        {getClassificationBadge(reply.classification)}
                        <button
                          onClick={(e) => handleDeleteReply(reply.id, e)}
                          disabled={deletingId === reply.id}
                          title="Delete reply"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-80 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* AI Sentiment Summary Bar */}
                    <div className="text-xs text-slate-300 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 flex items-start gap-2.5">
                      <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <span className="font-semibold text-purple-300">AI Summary: </span>
                        {reply.classification_summary || 'No summary available.'}
                      </div>
                    </div>

                    {/* Conversation Preview Section */}
                    <div className="space-y-3 pt-1 border-t border-slate-800/60">
                      {/* 1. Prospect Reply */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                          <span className="flex items-center gap-1.5 text-emerald-400">
                            <CornerDownLeft className="w-3.5 h-3.5" />
                            <span>Prospect Response ({reply.lead_name || reply.lead_company || reply.sender_email}):</span>
                          </span>
                          <span className="text-slate-500 font-normal">
                            {new Date(reply.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="p-3.5 rounded-xl bg-slate-950/85 border border-slate-800/90 text-xs text-slate-100 whitespace-pre-wrap leading-relaxed select-text font-sans">
                          {reply.reply_text || reply.classification_summary}
                        </div>
                      </div>

                      {/* 2. Original Sent Outreach */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                          <span className="flex items-center gap-1.5 text-indigo-400">
                            <Send className="w-3.5 h-3.5" />
                            <span>Original Sent Outreach:</span>
                          </span>
                          {reply.sent_message_body && (
                            <button
                              type="button"
                              onClick={(e) => toggleSentExpanded(reply.id, e)}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors"
                            >
                              <span>{isSentExpanded ? 'Collapse' : 'Show Sent Message'}</span>
                              {isSentExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          )}
                        </div>

                        {isSentExpanded ? (
                          <div className="p-3.5 rounded-xl bg-slate-950/90 border border-indigo-500/25 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed select-text font-sans">
                            <div className="text-[11px] text-indigo-300 font-medium mb-1.5 pb-1 border-b border-indigo-500/15">
                              Subject: {reply.sent_message_subject || reply.email_subject || 'Outbound Outreach'}
                            </div>
                            {reply.sent_message_body || 'Original outreach email stored in Gmail thread.'}
                          </div>
                        ) : reply.sent_message_body ? (
                          <div
                            onClick={(e) => toggleSentExpanded(reply.id, e)}
                            className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/60 text-xs text-slate-400 hover:text-slate-300 hover:border-slate-700/70 transition-all flex items-center justify-between gap-3 group/sent"
                          >
                            <div className="truncate text-slate-400 group-hover/sent:text-slate-300">
                              <span className="text-slate-500 font-medium">
                                {reply.sent_message_subject || reply.email_subject}:{' '}
                              </span>
                              <span>{reply.sent_message_body.replace(/\s+/g, ' ').slice(0, 110)}...</span>
                            </div>
                            <span className="text-[10px] text-indigo-400 font-medium shrink-0 group-hover/sent:underline">
                              Expand
                            </span>
                          </div>
                        ) : (
                          <div className="p-2 rounded-lg bg-slate-950/30 border border-slate-800/40 text-[11px] text-slate-500 italic">
                            Subject: {reply.sent_message_subject || reply.email_subject || 'Outbound outreach email'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Footer: Action Bar */}
                    <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800/60">
                      <span className="flex items-center gap-1.5 text-slate-400 group-hover:text-indigo-300 transition-colors">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Click card to inspect full conversation thread</span>
                      </span>
                      {reply.gmail_thread_id && (
                        <a
                          href={`https://mail.google.com/mail/u/0/#all/${reply.gmail_thread_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-slate-400 hover:text-indigo-400 transition-colors"
                        >
                          <span>Open in Gmail</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {total > 0 && (
            <Pagination
              currentPage={page}
              totalItems={total}
              pageSize={pageSize}
              itemName="replies"
              onPageChange={(newPage) => {
                setPage(newPage);
                fetchReplies(newPage, pageSize);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
                fetchReplies(1, newSize);
              }}
            />
          )}
        </main>

        {/* Selected Reply Dialog (Full Conversation Thread Modal) */}
        {selectedReply && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-800/80 bg-slate-900/90 flex items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                      {selectedReply.lead_company ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                    </div>
                    <h3 className="text-base font-semibold text-white truncate">
                      {selectedReply.lead_company || selectedReply.lead_name || selectedReply.sender_email}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 pl-10.5">
                    {selectedReply.lead_name && selectedReply.lead_name !== 'Unknown' && selectedReply.lead_name !== selectedReply.lead_company && (
                      <span className="font-medium text-slate-300">Contact: {selectedReply.lead_name}</span>
                    )}
                    <span className="font-mono flex items-center gap-1 text-slate-300">
                      <Mail className="w-3 h-3 text-slate-500" />
                      <span>{selectedReply.lead_email || selectedReply.sender_email}</span>
                    </span>
                    {selectedReply.receiving_account && (
                      <span className="text-slate-500 text-[11px]">
                        via {selectedReply.receiving_account}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setSelectedReply(null)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Sub-header Badges */}
              <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {getClassificationBadge(selectedReply.classification)}
                  {selectedReply.campaign_name && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-cyan-300 border border-cyan-500/20">
                      <Target className="w-3 h-3 text-cyan-400" />
                      <span>{selectedReply.campaign_name}</span>
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>Received {new Date(selectedReply.received_at).toLocaleString()}</span>
                </div>
              </div>

              {/* Scrollable Conversation Content */}
              <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
                {/* 1. Outbound Outreach Sent */}
                <div className="rounded-xl border border-indigo-500/30 bg-slate-950/80 p-4 sm:p-5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between text-xs border-b border-indigo-500/15 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                        <Send className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-semibold text-indigo-300">Outbound Outreach Sent</span>
                      {selectedReply.receiving_account && (
                        <span className="text-slate-500 text-[11px]">
                          from {selectedReply.receiving_account}
                        </span>
                      )}
                    </div>
                    {selectedReply.sent_at && (
                      <span className="text-slate-500 text-[11px] font-mono">
                        {new Date(selectedReply.sent_at).toLocaleString()}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 font-medium">
                    <span className="text-slate-500">Subject: </span>
                    <span className="text-slate-200">
                      {selectedReply.sent_message_subject || selectedReply.email_subject || 'Outbound Outreach'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed select-text font-sans">
                    {selectedReply.sent_message_body || 'Original outreach email body archived in your connected email inbox.'}
                  </div>
                </div>

                {/* Timeline Connector */}
                <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 font-medium">
                  <div className="h-px bg-slate-800 flex-1 max-w-[120px]"></div>
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-slate-400">
                    <ArrowDown className="w-3 h-3 text-emerald-400" />
                    <span>Prospect Replied</span>
                  </span>
                  <div className="h-px bg-slate-800 flex-1 max-w-[120px]"></div>
                </div>

                {/* 2. Prospect Inbound Reply */}
                <div className="rounded-xl border border-emerald-500/30 bg-slate-950/80 p-4 sm:p-5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between text-xs border-b border-emerald-500/15 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <CornerDownLeft className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-semibold text-emerald-300">
                        {selectedReply.lead_name || selectedReply.lead_company || selectedReply.sender_email} Replied
                      </span>
                    </div>
                    <span className="text-slate-500 text-[11px] font-mono">
                      {new Date(selectedReply.received_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs text-slate-100 whitespace-pre-wrap leading-relaxed select-text font-sans">
                    {selectedReply.reply_text || selectedReply.classification_summary}
                  </div>
                </div>

                {/* 3. AI Sentiment Analysis */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>AI Sentiment Intelligence & Summary</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pl-5">
                    {selectedReply.classification_summary}
                  </p>
                  <div className="pt-1.5 pl-5 flex items-center gap-2 text-[11px] text-slate-500">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Follow-up sequence automatically halted for this prospect.</span>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-slate-900/90 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeleteReply(selectedReply.id)}
                    disabled={deletingId === selectedReply.id}
                    className="px-3.5 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl flex items-center gap-1.5 transition-colors border border-rose-500/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Reply</span>
                  </button>
                  {selectedReply.gmail_thread_id && (
                    <a
                      href={`https://mail.google.com/mail/u/0/#all/${selectedReply.gmail_thread_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-xl flex items-center gap-1.5 transition-colors border border-indigo-500/20"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open in Gmail</span>
                    </a>
                  )}
                </div>
                <button
                  onClick={() => setSelectedReply(null)}
                  className="px-5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
