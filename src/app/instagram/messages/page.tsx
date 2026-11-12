'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { InstagramMessage } from '@/types/database';
import { RefreshCw, Edit2, Trash2, X, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';

export default function InstagramMessagesPage() {
  const [messages, setMessages] = useState<InstagramMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [editingMsg, setEditingMsg] = useState<InstagramMessage | null>(null);
  const [editBody, setEditBody] = useState('');
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchMessages = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    try {
      const res = await fetch(`/api/instagram/messages?${params.toString()}`);
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [statusFilter]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMsg) return;
    const res = await fetch(`/api/instagram/messages/${editingMsg.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body_text: editBody }),
    });
    if (res.ok) {
      setEditingMsg(null);
      setNotice({ type: 'success', text: 'Instagram DM updated.' });
      await fetchMessages();
    }
  };

  const handleRegenerate = async (id: string) => {
    setRegeneratingId(id);
    try {
      const res = await fetch(`/api/instagram/messages/${id}/regenerate`, { method: 'POST' });
      if (res.ok) {
        setNotice({ type: 'success', text: 'DM regenerated with AI.' });
        await fetchMessages();
      } else {
        const d = await res.json();
        setNotice({ type: 'error', text: d?.error || 'Regeneration failed' });
      }
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/instagram/messages/${id}`, { method: 'DELETE' });
    if (res.ok) await fetchMessages();
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Instagram Messages"
          subtitle="Inspect, edit, and regenerate AI Instagram DM drafts and scheduled sends"
          category="Instagram DM"
        >
          <button
            type="button"
            onClick={fetchMessages}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </Header>

        <main className="p-4 sm:p-6 lg:p-8 space-y-5 flex-1 max-w-7xl w-full mx-auto min-w-0">
          {notice && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                notice.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {notice.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{notice.text}</span>
              </div>
              <button type="button" onClick={() => setNotice(null)}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/50 border border-slate-800 p-3 rounded-xl">
            {['', 'draft', 'scheduled', 'sent', 'paused', 'failed', 'cancelled'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                  statusFilter === st ? 'bg-fuchsia-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {st === '' ? 'All' : st.charAt(0).toUpperCase() + st.slice(1)}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-sm text-slate-400">
                Loading Instagram DMs...
              </div>
            ) : messages.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-sm text-slate-400">
                No Instagram DMs found for this filter.
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-fuchsia-300">
                        {m.lead?.normalized_handle ? `@${m.lead.normalized_handle}` : m.lead?.full_name || 'Lead'}
                      </span>
                      {m.campaign_name && (
                        <Link href={`/instagram/campaigns/${m.campaign_id}`} className="text-slate-400 hover:text-fuchsia-300">
                          • {m.campaign_name}
                        </Link>
                      )}
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300">
                        DM #{m.step_number + 1}
                      </span>
                      {m.instagram_account && (
                        <span className="text-[11px] text-slate-400">via @{m.instagram_account.username}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-medium capitalize">
                        {m.status}
                      </span>
                      {m.status !== 'sent' && (
                        <>
                          <button
                            type="button"
                            disabled={regeneratingId === m.id}
                            onClick={() => handleRegenerate(m.id)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-fuchsia-300"
                            title="Regenerate DM with AI"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${regeneratingId === m.id ? 'animate-pulse' : ''}`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMsg(m);
                              setEditBody(m.body_text);
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                            title="Edit DM"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(m.id)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
                            title="Delete DM"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-200 whitespace-pre-wrap bg-slate-950 border border-slate-800/80 rounded-lg p-3">
                    {m.body_text}
                  </p>
                  {m.error_message && (
                    <div className="text-[11px] text-rose-400">{m.error_message}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </main>
      </div>

      {editingMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Edit Instagram DM</h2>
              <button type="button" onClick={() => setEditingMsg(null)} className="text-slate-400 hover:text-slate-200"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <textarea
                rows={5}
                required
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingMsg(null)} className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-300">Cancel</button>
                <button type="submit" className="px-4 py-1.5 rounded-lg text-xs bg-fuchsia-600 text-white font-medium">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
