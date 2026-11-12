'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { InstagramIcon } from '@/components/InstagramIcon';
import { InstagramReplyEvent } from '@/types/database';
import { RefreshCw, MessageCircle } from 'lucide-react';

export default function InstagramRepliesPage() {
  const [replies, setReplies] = useState<InstagramReplyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchReplies = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/instagram/replies');
      const data = await res.json();
      setReplies(Array.isArray(data) ? data : []);
    } catch {
      setReplies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReplies();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/instagram/replies', { method: 'POST' });
      const data = await res.json();
      if (Array.isArray(data?.replies)) {
        setReplies(data.replies);
      } else {
        await fetchReplies();
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Instagram Replies"
          subtitle="Synced DM replies with AI intent classification — automatically pauses follow-up DMs"
          category="Instagram DM"
        >
          <button
            type="button"
            disabled={syncing}
            onClick={handleSync}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing IG Inbox...' : 'Sync DM Inbox'}</span>
          </button>
        </Header>

        <main className="p-4 sm:p-6 lg:p-8 space-y-4 flex-1 max-w-6xl w-full mx-auto min-w-0">
          {loading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-sm text-slate-400">
              Loading Instagram replies...
            </div>
          ) : replies.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400">
                <InstagramIcon className="w-6 h-6" />
              </div>
              <div className="text-sm font-medium text-slate-200">No Instagram DM replies yet</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                When prospects reply to your automated Instagram DMs, the autonomous worker (or the Sync DM Inbox button) captures and classifies them here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {replies.map((r) => (
                <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <MessageCircle className="w-4 h-4 text-fuchsia-400" />
                      <span className="font-semibold text-fuchsia-300">{r.sender_handle}</span>
                      {r.lead_name && <span className="text-slate-400">({r.lead_name})</span>}
                      {r.campaign_name && <span className="text-slate-500">• {r.campaign_name}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30 capitalize">
                        {r.classification.replace(/_/g, ' ')}
                      </span>
                      <span className="text-slate-500">{new Date(r.received_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-200 bg-slate-950 border border-slate-800 rounded-lg p-3">
                    {r.reply_text || r.classification_summary}
                  </p>
                  {r.classification_summary && r.reply_text && (
                    <div className="text-[11px] text-slate-400">AI Summary: {r.classification_summary}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
