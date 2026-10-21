'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import {
  Settings as SettingsIcon,
  Mail,
  CheckCircle2,
  AlertCircle,
  Save,
  ExternalLink,
  ShieldAlert,
  Clock,
  Building,
  User,
} from 'lucide-react';

export default function SettingsPage() {
  const [profile, setProfile] = useState({
    business_name: '',
    business_website: '',
    business_description: '',
    value_proposition: '',
    sender_name: '',
    sender_email: '',
    timezone: 'Asia/Kolkata',
    daily_send_limit: 15,
  });

  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    email?: string;
    token_expired?: boolean;
    scopes?: string[];
    connected_at?: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [profRes, statusRes] = await Promise.all([
        fetch('/api/profile'),
        fetch('/api/integrations/google/status'),
      ]);
      const profData = await profRes.json();
      const statusData = await statusRes.json();

      if (profRes.ok) setProfile(profData);
      if (statusRes.ok) setGmailStatus(statusData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveNotice(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setSaveNotice('Settings updated successfully!');
      } else {
        setSaveNotice('Failed to update settings');
      }
    } catch {
      setSaveNotice('Error saving settings');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveNotice(null), 3000);
    }
  };

  const handleConnectGmail = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/integrations/google/connect', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Failed to initiate Google OAuth:', err);
      setConnecting(false);
    }
  };

  const handleDisconnectGmail = async () => {
    if (!confirm('Are you sure you want to disconnect your Gmail account? Automated outreach will be paused.')) {
      return;
    }
    try {
      const res = await fetch('/api/integrations/google/disconnect', { method: 'POST' });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title="Settings & Integrations" subtitle="Configure business profile, daily limits, and Gmail OAuth" />

        <main className="p-8 max-w-4xl w-full mx-auto space-y-8">
          {saveNotice && (
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-400" />
              <span>{saveNotice}</span>
            </div>
          )}

          {/* 1. Gmail Integration Card */}
          <section className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Google OAuth & Gmail Integration</h3>
                  <p className="text-xs text-slate-400">Connect your Google workspace account to send outbound emails and monitor replies</p>
                </div>
              </div>

              {gmailStatus?.connected ? (
                <button
                  type="button"
                  onClick={handleDisconnectGmail}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
                >
                  Disconnect Account
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectGmail}
                  disabled={connecting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-colors"
                >
                  <span>{connecting ? 'Redirecting...' : 'Connect Gmail Account'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Connection Details */}
            {gmailStatus?.connected ? (
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Connected Email Address:</span>
                  <span className="text-slate-200 font-mono font-medium">{gmailStatus.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Active & Verified
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Token Storage:</span>
                  <span className="text-slate-300">Encrypted at rest with AES-256-GCM</span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Multi-Account Capacity:</span>
                  <a href="/accounts" className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1">
                    Manage all inboxes, groups & limits →
                  </a>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300 space-y-2">
                <div className="font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Google Cloud Console OAuth Testing Notice:</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  When creating your OAuth client in Google Cloud Console, ensure you add your sender email as a <strong>Test User</strong> under the OAuth consent screen if your app status is in "Testing".
                </p>
                <div className="text-[11px] text-slate-500">
                  Required scopes: <code className="text-slate-400 font-mono">gmail.send</code>, <code className="text-slate-400 font-mono">gmail.readonly</code>, <code className="text-slate-400 font-mono">userinfo.email</code>.
                </div>
              </div>
            )}
          </section>

          {/* 2. Business Profile & Defaults */}
          <section className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Building className="w-4 h-4 text-indigo-400" />
              <span>Business Profile & Cold Outreach Defaults</span>
            </h3>

            <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Business Name</label>
                  <input
                    type="text"
                    value={profile.business_name}
                    onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Business Website</label>
                  <input
                    type="url"
                    value={profile.business_website}
                    onChange={(e) => setProfile({ ...profile, business_website: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Company Description</label>
                <textarea
                  rows={2}
                  value={profile.business_description}
                  onChange={(e) => setProfile({ ...profile, business_description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Core Value Proposition</label>
                <textarea
                  rows={2}
                  value={profile.value_proposition}
                  onChange={(e) => setProfile({ ...profile, value_proposition: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Sender Display Name</label>
                  <input
                    type="text"
                    value={profile.sender_name}
                    onChange={(e) => setProfile({ ...profile, sender_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Sender Email</label>
                  <input
                    type="email"
                    value={profile.sender_email}
                    onChange={(e) => setProfile({ ...profile, sender_email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Default Daily Send Limit</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={profile.daily_send_limit}
                    onChange={(e) => setProfile({ ...profile, daily_send_limit: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Default Timezone</label>
                  <input
                    type="text"
                    value={profile.timezone}
                    onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-colors disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : 'Save Settings'}</span>
                </button>
              </div>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
