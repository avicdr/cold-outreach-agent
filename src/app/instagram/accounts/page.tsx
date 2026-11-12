'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { InstagramIcon } from '@/components/InstagramIcon';
import {
  Plus,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Clock,
  Gauge,
  RefreshCw,
  X,
  Play,
  Pause,
  Key,
  Lock,
  Code2,
  Eye,
  EyeOff,
  Edit2,
} from 'lucide-react';

interface SafeInstagramAccount {
  id: string;
  username: string;
  display_name: string;
  ig_user_id?: string | null;
  auth_method: 'login' | 'session' | 'graph_api';
  daily_limit: number;
  min_interval_minutes: number;
  status: 'active' | 'paused' | 'error' | 'challenge_required';
  last_error?: string | null;
  last_sent_at?: string | null;
  last_sync_at?: string | null;
  connected_at: string;
  sent_today?: number;
  remaining_today?: number;
}

interface AccountStats {
  totalAccounts: number;
  activeAccounts: number;
  dailyCapacity: number;
  sentToday: number;
  remainingToday: number;
}

export default function InstagramAccountsPage() {
  const [accounts, setAccounts] = useState<SafeInstagramAccount[]>([]);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Connect Modal
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'session' | 'graph_api'>('login');
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [twoFactorState, setTwoFactorState] = useState<{
    required: boolean;
    identifier: string;
    username: string;
  } | null>(null);

  const [form, setForm] = useState({
    username: '',
    password: '',
    two_factor_code: '',
    sessionid: '',
    csrftoken: '',
    ds_user_id: '',
    ig_user_id: '',
    access_token: '',
    daily_limit: 25,
    min_interval_minutes: 10,
  });

  // Edit / Verifying state
  const [editingAccount, setEditingAccount] = useState<SafeInstagramAccount | null>(null);
  const [editLimits, setEditLimits] = useState({ daily_limit: 25, min_interval_minutes: 10 });
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/instagram/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
      setStats(data?.stats || null);
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowConnectModal(false);
        setEditingAccount(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const resetConnectForm = () => {
    setForm({
      username: '',
      password: '',
      two_factor_code: '',
      sessionid: '',
      csrftoken: '',
      ds_user_id: '',
      ig_user_id: '',
      access_token: '',
      daily_limit: 25,
      min_interval_minutes: 10,
    });
    setTwoFactorState(null);
    setFormError(null);
    setShowSecret(false);
  };

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const payload: Record<string, any> = {
        auth_method: authTab,
        daily_limit: Number(form.daily_limit) || 25,
        min_interval_minutes: Number(form.min_interval_minutes) || 10,
      };

      if (authTab === 'login') {
        payload.username = form.username;
        payload.password = form.password;
        if (twoFactorState?.required) {
          payload.two_factor_code = form.two_factor_code;
          payload.two_factor_identifier = twoFactorState.identifier;
        }
      } else if (authTab === 'session') {
        payload.username = form.username;
        payload.sessionid = form.sessionid;
        payload.csrftoken = form.csrftoken;
        payload.ds_user_id = form.ds_user_id;
      } else {
        payload.ig_user_id = form.ig_user_id;
        payload.access_token = form.access_token;
      }

      const res = await fetch('/api/instagram/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.status === 202 && data?.requires_two_factor) {
        setTwoFactorState({
          required: true,
          identifier: data.two_factor_identifier || '',
          username: data.username || form.username,
        });
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        setFormError(data?.error || 'Failed to connect Instagram account.');
        setSubmitting(false);
        return;
      }

      setShowConnectModal(false);
      resetConnectForm();
      setNotice({ type: 'success', text: `Connected @${data.account.username} successfully.` });
      await fetchAccounts();
    } catch (err: any) {
      setFormError(err?.message || 'Connection failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (acc: SafeInstagramAccount) => {
    const nextStatus = acc.status === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`/api/instagram/accounts/${acc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await fetchAccounts();
      }
    } catch {
      // ignore
    }
  };

  const handleVerifyAccount = async (id: string) => {
    setVerifyingId(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/instagram/accounts/${id}/verify`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setNotice({ type: 'success', text: `Verified @${data.account.username} — session is active.` });
      } else {
        setNotice({ type: 'error', text: data?.error || 'Verification failed.' });
      }
      await fetchAccounts();
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    try {
      const res = await fetch(`/api/instagram/accounts/${editingAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daily_limit: Number(editLimits.daily_limit) || 25,
          min_interval_minutes: Number(editLimits.min_interval_minutes) || 10,
        }),
      });
      if (res.ok) {
        setEditingAccount(null);
        await fetchAccounts();
      }
    } catch {
      // ignore
    }
  };

  const handleDelete = async (acc: SafeInstagramAccount) => {
    setDeletingId(acc.id);
    try {
      const res = await fetch(`/api/instagram/accounts/${acc.id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotice({ type: 'success', text: `Removed @${acc.username}.` });
        await fetchAccounts();
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Instagram Accounts"
          subtitle="Connect IG accounts via login, session cookie, or official Graph API (segregated from email)"
          category="Instagram DM"
        >
          <button
            type="button"
            onClick={() => {
              resetConnectForm();
              setShowConnectModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-fuchsia-600 to-rose-500 hover:from-fuchsia-500 hover:to-rose-400 text-white shadow-sm transition-all shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Instagram Account</span>
          </button>
        </Header>

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto min-w-0">
          {notice && (
            <div
              role="status"
              aria-live="polite"
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                notice.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {notice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{notice.text}</span>
              </div>
              <button type="button" onClick={() => setNotice(null)} className="p-1 hover:opacity-80">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Capacity Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 uppercase font-mono tracking-wider">Connected Accounts</div>
              <div className="mt-1 text-2xl font-bold text-slate-100">{stats?.totalAccounts ?? accounts.length}</div>
              <div className="text-xs text-emerald-400 mt-1">{stats?.activeAccounts ?? 0} active senders</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 uppercase font-mono tracking-wider">Daily DM Capacity</div>
              <div className="mt-1 text-2xl font-bold text-slate-100">{stats?.dailyCapacity ?? 0}</div>
              <div className="text-xs text-slate-400 mt-1">Across active IG accounts</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 uppercase font-mono tracking-wider">DMs Sent Today</div>
              <div className="mt-1 text-2xl font-bold text-fuchsia-400">{stats?.sentToday ?? 0}</div>
              <div className="text-xs text-slate-400 mt-1">UTC daily counter</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 uppercase font-mono tracking-wider">Remaining Today</div>
              <div className="mt-1 text-2xl font-bold text-emerald-400">{stats?.remainingToday ?? 0}</div>
              <div className="text-xs text-slate-400 mt-1">Available DM slots</div>
            </div>
          </div>

          {/* Accounts Grid */}
          {loading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-sm text-slate-400">
              Loading Instagram accounts...
            </div>
          ) : accounts.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400">
                <InstagramIcon className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h2 className="text-base font-semibold text-slate-100">No Instagram Accounts Connected</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Connect an Instagram account using Login (username & password), a browser Session Cookie (recommended for zero-friction auth), or Meta Graph API to start automating DMs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetConnectForm();
                  setShowConnectModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                Connect First Instagram Account
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map((acc) => {
                const statusColors =
                  acc.status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : acc.status === 'paused'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20';

                const methodLabel =
                  acc.auth_method === 'login'
                    ? 'Login Auth'
                    : acc.auth_method === 'graph_api'
                      ? 'Meta Graph API'
                      : 'Session Cookie';

                return (
                  <div
                    key={acc.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-fuchsia-600/25 to-rose-500/25 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-300 shrink-0">
                            <InstagramIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-100 truncate">
                              @{acc.username}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {acc.display_name && acc.display_name !== acc.username
                                ? acc.display_name
                                : methodLabel}
                            </div>
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColors}`}>
                          {acc.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">
                          {methodLabel}
                        </span>
                        {acc.ig_user_id && (
                          <span className="font-mono text-[10px] text-slate-500 truncate">
                            ID: {acc.ig_user_id}
                          </span>
                        )}
                      </div>

                      {acc.last_error && (
                        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300">
                          {acc.last_error}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                          <div className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Gauge className="w-3 h-3" /> Sent Today
                          </div>
                          <div className="font-semibold text-slate-200 mt-0.5">
                            {acc.sent_today ?? 0} / {acc.daily_limit}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                          <div className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Cooldown
                          </div>
                          <div className="font-semibold text-slate-200 mt-0.5">
                            {acc.min_interval_minutes} min
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(acc)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          title={acc.status === 'active' ? 'Pause account' : 'Resume account'}
                        >
                          {acc.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVerifyAccount(acc.id)}
                          disabled={verifyingId === acc.id}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors disabled:opacity-50"
                          title="Verify live connection"
                        >
                          <RefreshCw className={`w-3 h-3 ${verifyingId === acc.id ? 'animate-spin' : ''}`} />
                          <span>Test</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAccount(acc);
                            setEditLimits({
                              daily_limit: acc.daily_limit,
                              min_interval_minutes: acc.min_interval_minutes,
                            });
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          title="Edit daily limit & cooldown"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDelete(acc)}
                        disabled={deletingId === acc.id}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors disabled:opacity-50"
                        title="Disconnect account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Connect Instagram Account Modal */}
      {showConnectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="connect-ig-title"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400">
                  <InstagramIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="connect-ig-title" className="text-sm font-semibold text-slate-100">
                    Connect Instagram Account
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Credentials are encrypted with AES-256-GCM before storage
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Auth Method Tabs */}
              <div className="grid grid-cols-3 gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('login');
                    setFormError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors ${
                    authTab === 'login'
                      ? 'bg-fuchsia-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Login</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('session');
                    setFormError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors ${
                    authTab === 'session'
                      ? 'bg-fuchsia-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Session Cookie</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('graph_api');
                    setFormError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors ${
                    authTab === 'graph_api'
                      ? 'bg-fuchsia-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Graph API</span>
                </button>
              </div>

              {formError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300"
                >
                  {formError}
                </div>
              )}

              <form onSubmit={handleConnectSubmit} className="space-y-4">
                {authTab === 'login' && (
                  <>
                    {!twoFactorState?.required ? (
                      <>
                        <div>
                          <label htmlFor="ig-login-username" className="block text-xs font-medium text-slate-300 mb-1">
                            Instagram Username <span aria-hidden="true">*</span>
                          </label>
                          <input
                            id="ig-login-username"
                            name="username"
                            type="text"
                            required
                            autoComplete="username"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            value={form.username}
                            onChange={(e) => setForm({ ...form, username: e.target.value })}
                            placeholder="yourhandle"
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-fuchsia-500"
                          />
                        </div>
                        <div>
                          <label htmlFor="ig-login-password" className="block text-xs font-medium text-slate-300 mb-1">
                            Password <span aria-hidden="true">*</span>
                          </label>
                          <div className="relative">
                            <input
                              id="ig-login-password"
                              name="password"
                              type={showSecret ? 'text' : 'password'}
                              required
                              autoComplete="current-password"
                              value={form.password}
                              onChange={(e) => setForm({ ...form, password: e.target.value })}
                              placeholder="••••••••"
                              className="w-full px-3 py-2 pr-10 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-fuchsia-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSecret(!showSecret)}
                              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
                              aria-label={showSecret ? 'Hide password' : 'Show password'}
                            >
                              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                        <div className="text-xs text-amber-200 font-medium">
                          2FA Verification Required for @{twoFactorState.username}
                        </div>
                        <div>
                          <label htmlFor="ig-2fa-code" className="block text-xs text-slate-300 mb-1">
                            6-digit Authenticator / SMS Code
                          </label>
                          <input
                            id="ig-2fa-code"
                            name="two_factor_code"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            required
                            value={form.two_factor_code}
                            onChange={(e) => setForm({ ...form, two_factor_code: e.target.value })}
                            placeholder="123456"
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100"
                          />
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-slate-400">
                      Note: If Instagram triggers an IP checkpoint on direct login, switch to the <strong>Session Cookie</strong> tab for instant, reliable connection.
                    </p>
                  </>
                )}

                {authTab === 'session' && (
                  <>
                    <div className="p-3 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 text-[11px] text-slate-300 space-y-1.5">
                      <div className="font-semibold text-fuchsia-300">How to get your Session Cookie:</div>
                      <div>1. Open <strong className="text-slate-100">instagram.com</strong> logged into your account in Chrome/Firefox/Edge.</div>
                      <div>2. Press <kbd className="px-1 py-0.5 bg-slate-950 border border-slate-800 rounded font-mono text-[10px]">F12</kbd> → Application (or Storage) → Cookies → <code className="px-1 py-0.5 bg-slate-950 rounded">instagram.com</code>.</div>
                      <div>3. Copy the value of <code className="px-1 py-0.5 bg-slate-950 text-fuchsia-300 rounded font-mono">sessionid</code> and paste it below.</div>
                    </div>
                    <div>
                      <label htmlFor="ig-session-user" className="block text-xs font-medium text-slate-300 mb-1">
                        Instagram Handle <span className="text-slate-400 font-normal">(@username)</span>{' '}
                        <span className="text-[10px] text-fuchsia-400 font-normal ml-1">(Recommended)</span>
                      </label>
                      <input
                        id="ig-session-user"
                        name="username"
                        type="text"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={form.username}
                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                        placeholder="e.g. yourhandle"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-fuchsia-500"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Providing your handle guarantees instant setup even if Instagram anti-bot checks throttle server verification.
                      </p>
                    </div>
                    <div>
                      <label htmlFor="ig-session-id" className="block text-xs font-medium text-slate-300 mb-1">
                        sessionid Cookie <span aria-hidden="true">*</span>
                      </label>
                      <input
                        id="ig-session-id"
                        name="sessionid"
                        type={showSecret ? 'text' : 'password'}
                        required
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={form.sessionid}
                        onChange={(e) => {
                          const val = e.target.value;
                          const trimmed = val.trim();
                          if (trimmed.includes(';') || trimmed.includes('=')) {
                            let foundSession = '';
                            let foundCsrf = form.csrftoken;
                            let foundDsUserId = form.ds_user_id;
                            for (const pair of trimmed.split(';')) {
                              const eq = pair.indexOf('=');
                              if (eq !== -1) {
                                const k = pair.slice(0, eq).trim().toLowerCase();
                                const v = pair.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
                                if (k === 'sessionid') foundSession = v;
                                else if (k === 'csrftoken') foundCsrf = v;
                                else if (k === 'ds_user_id') foundDsUserId = v;
                              }
                            }
                            setForm({
                              ...form,
                              sessionid: foundSession || trimmed,
                              csrftoken: foundCsrf,
                              ds_user_id: foundDsUserId,
                            });
                          } else {
                            setForm({ ...form, sessionid: val });
                          }
                        }}
                        placeholder="Paste sessionid (or entire cookie string)"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100 focus:outline-none focus:border-fuchsia-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="ig-csrf" className="block text-xs font-medium text-slate-300 mb-1">
                        csrftoken <span className="text-slate-500 font-normal">(optional)</span>
                      </label>
                      <input
                        id="ig-csrf"
                        name="csrftoken"
                        type="text"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={form.csrftoken}
                        onChange={(e) => setForm({ ...form, csrftoken: e.target.value })}
                        placeholder="Auto-fetched if left blank"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100"
                      />
                    </div>
                  </>
                )}

                {authTab === 'graph_api' && (
                  <>
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
                      Official Meta Graph API works for Instagram Professional/Business accounts linked to a Facebook Page (note: Meta restricts cold DMs to users who have not messaged your page first).
                    </div>
                    <div>
                      <label htmlFor="ig-graph-id" className="block text-xs font-medium text-slate-300 mb-1">
                        Instagram Business Account ID <span aria-hidden="true">*</span>
                      </label>
                      <input
                        id="ig-graph-id"
                        name="ig_user_id"
                        type="text"
                        required
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={form.ig_user_id}
                        onChange={(e) => setForm({ ...form, ig_user_id: e.target.value })}
                        placeholder="17841400000000000"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100"
                      />
                    </div>
                    <div>
                      <label htmlFor="ig-graph-token" className="block text-xs font-medium text-slate-300 mb-1">
                        Page / Instagram Access Token <span aria-hidden="true">*</span>
                      </label>
                      <input
                        id="ig-graph-token"
                        name="access_token"
                        type={showSecret ? 'text' : 'password'}
                        required
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={form.access_token}
                        onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                        placeholder="EAA..."
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100"
                      />
                    </div>
                  </>
                )}

                {/* Safe Pacing Limits */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                  <div>
                    <label htmlFor="ig-daily-limit" className="block text-xs font-medium text-slate-300 mb-1">
                      Daily DM Limit
                    </label>
                    <input
                      id="ig-daily-limit"
                      name="daily_limit"
                      type="number"
                      min={1}
                      max={100}
                      value={form.daily_limit}
                      onChange={(e) => setForm({ ...form, daily_limit: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="ig-interval" className="block text-xs font-medium text-slate-300 mb-1">
                      Cooldown (minutes)
                    </label>
                    <input
                      id="ig-interval"
                      name="min_interval_minutes"
                      type="number"
                      min={1}
                      max={120}
                      value={form.min_interval_minutes}
                      onChange={(e) => setForm({ ...form, min_interval_minutes: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowConnectModal(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white disabled:opacity-50"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{submitting ? 'Connecting...' : twoFactorState?.required ? 'Verify 2FA & Connect' : 'Verify & Connect'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Account Limits Modal */}
      {editingAccount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-ig-title"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="edit-ig-title" className="text-sm font-semibold text-slate-100">
                Pacing for @{editingAccount.username}
              </h2>
              <button type="button" onClick={() => setEditingAccount(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveLimits} className="space-y-4">
              <div>
                <label htmlFor="edit-daily-limit" className="block text-xs text-slate-300 mb-1">
                  Daily DM Limit
                </label>
                <input
                  id="edit-daily-limit"
                  type="number"
                  min={1}
                  max={100}
                  value={editLimits.daily_limit}
                  onChange={(e) => setEditLimits({ ...editLimits, daily_limit: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="edit-cooldown" className="block text-xs text-slate-300 mb-1">
                  Minimum Interval Between DMs (minutes)
                </label>
                <input
                  id="edit-cooldown"
                  type="number"
                  min={1}
                  max={120}
                  value={editLimits.min_interval_minutes}
                  onChange={(e) => setEditLimits({ ...editLimits, min_interval_minutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-xs bg-fuchsia-600 text-white font-medium"
                >
                  Save Limits
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
