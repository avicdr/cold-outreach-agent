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
} from 'lucide-react';

export default function RepliesPage() {
  const [replies, setReplies] = useState<ReplyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReply, setSelectedReply] = useState<ReplyEvent | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchReplies = (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(targetPage));
    params.set('limit', String(targetPageSize));

    fetch(`/api/replies?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setReplies(Array.isArray(data) ? data : data.replies || []);
        setTotal(typeof data?.total === 'number' ? data.total : (Array.isArray(data) ? data.length : 0));
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
      <div className="flex-1 flex flex-col">
        <Header title="Inbound Replies & Sentiment" subtitle="Synchronized replies automatically classified with Gemini AI" />

        <main className="p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {/* Safeguard Notice */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 text-xs text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>All incoming replies instantly halt automated follow-up sequences for the prospect.</span>
            </div>
            <span className="text-slate-500">Auto-polled via Gmail API</span>
          </div>

          {/* Replies Grid / List */}
          {loading ? (
            <div className="py-12 text-center text-slate-500">Loading replies...</div>
          ) : replies.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/20">
              <MessageSquareQuote className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-300">No replies received yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Once prospects reply to your cold emails, they will be captured, categorized, and displayed here.
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
                    <div>{getClassificationBadge(reply.classification)}</div>
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

              <div className="flex justify-end pt-2">
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
