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
      s.includes('noreply') ||
      s.includes('no-reply') ||
      sum.includes('delivery failure') ||
      sum.includes('domain could not be found') ||
      sum.includes('address not found') ||
      sum.includes('undeliverable') ||
      sum.includes('undelivered mail') ||
      sum.includes('mailer daemon')
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
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
              <span>All incoming prospect replies automatically pause follow-up sequences. Mailer-daemon & delivery bounces are automatically filtered out.</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Daemon Filter Active</span>
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
                Once prospects reply to your cold emails, they will be captured, categorized, and displayed here. Delivery bounces and mailer daemons are kept out of your inbox.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {replies.map((reply) => (
                <div
                  key={reply.id}
                  onClick={() => setSelectedReply(reply)}
                  className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 glass-card-hover cursor-pointer space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">{reply.sender_email}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Received: {new Date(reply.received_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getClassificationBadge(reply.classification)}
                      <button
                        onClick={(e) => handleDeleteReply(reply.id, e)}
                        disabled={deletingId === reply.id}
                        title="Delete reply"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                    <span className="font-semibold text-slate-400">AI Summary: </span>
                    {reply.classification_summary || 'No summary available.'}
                  </div>
                </div>
              ))}
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

        {/* Selected Reply Dialog */}
        {selectedReply && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">{selectedReply.sender_email}</h3>
                  <div className="text-xs text-slate-400">{new Date(selectedReply.received_at).toLocaleString()}</div>
                </div>
                <button onClick={() => setSelectedReply(null)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="pt-2">
                {getClassificationBadge(selectedReply.classification)}
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                {selectedReply.classification_summary}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => handleDeleteReply(selectedReply.id)}
                  disabled={deletingId === selectedReply.id}
                  className="px-3 py-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Reply</span>
                </button>
                <button
                  onClick={() => setSelectedReply(null)}
                  className="px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg"
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
