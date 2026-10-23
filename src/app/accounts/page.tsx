'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { Pagination } from '@/components/Pagination';
import {
  Inbox,
  Plus,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Trash2,
  Edit2,
  Clock,
  Gauge,
  Layers,
  Sparkles,
  RefreshCw,
  X,
  Play,
  Pause,
  Flame,
  Activity,
  Zap,
  AlertTriangle,
  Server,
  Eye,
  EyeOff,
  Key,
} from 'lucide-react';


interface AccountGroup {
  id: string;
  name: string;
  description: string;
  accounts_count?: number;
  daily_capacity?: number;
  is_warmup_enabled?: boolean;
  warmup_daily_limit?: number;
  warmup_ramp_per_day?: number;
  warmup_reply_rate?: number;
}

interface EmailAccount {
  id: string;
  user_id: string;
  email_address: string;
  sender_name?: string;
  provider?: 'gmail' | 'smtp' | string;
  group_id?: string | null;
  group?: AccountGroup | null;
  daily_limit: number;
  min_interval_minutes: number;
  status: 'active' | 'paused' | 'error';
  last_sent_at?: string | null;
  sent_today?: number;
  remaining_today?: number;
  connected_at: string;
  warmup_enabled?: boolean;
  warmup_status?: 'inactive' | 'warming' | 'warm' | 'paused';
  warmup_day_count?: number;
  warmup_sent_today?: number;
  warmup_received_today?: number;
  total_warmup_sent?: number;
  total_warmup_received?: number;
  warmup_reputation_score?: number;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_secure?: boolean;
  smtp_username?: string | null;
}

interface AccountStats {
  totalAccounts: number;
  activeAccounts: number;
  dailyCapacity: number;
  sentToday: number;
  remainingToday: number;
}

interface WarmupStats {
  activeAccounts: number;
  totalWarmupSent: number;
  totalWarmupReceived: number;
  avgReputationScore: number;
  targetReplyRate: number;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [warmupStats, setWarmupStats] = useState<WarmupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'accounts' | 'groups' | 'warmup'>('accounts');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [runningWarmup, setRunningWarmup] = useState(false);

  // Pagination states
  const [accountsPage, setAccountsPage] = useState(1);
  const [accountsPageSize, setAccountsPageSize] = useState(9);
  const [groupsPage, setGroupsPage] = useState(1);
  const [groupsPageSize, setGroupsPageSize] = useState(6);
  const [warmupPage, setWarmupPage] = useState(1);
  const [warmupPageSize, setWarmupPageSize] = useState(10);

  // Modals state
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<EmailAccount | null>(null);
  const [editingGroup, setEditingGroup] = useState<AccountGroup | null>(null);

  // Form states
  const [connectionTab, setConnectionTab] = useState<'titan' | 'gmail' | 'smtp'>('titan');
  const [showPassword, setShowPassword] = useState(false);
  const [verifyingSmtp, setVerifyingSmtp] = useState(false);
  const [smtpStatus, setSmtpStatus] = useState<{ verified: boolean; message?: string } | null>(null);

  const [accountForm, setAccountForm] = useState({
    email_address: '',
    sender_name: '',
    group_id: '',
    daily_limit: 18,
    min_interval_minutes: 15,
    warmup_enabled: true,
    smtp_host: 'smtp.titan.email',
    smtp_port: 465,
    smtp_secure: true,
    smtp_username: '',
    smtp_password: '',
  });

  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    is_warmup_enabled: true,
    warmup_daily_limit: 15,
    warmup_ramp_per_day: 2,
    warmup_reply_rate: 70,
  });

  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotice({ message, type });
    setTimeout(() => setNotice(null), 5000);
  };

  const loadData = async () => {
    try {
      const [accRes, warmupRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/warmup'),
      ]);

      const accData = await accRes.json();
      if (accRes.ok) {
        setAccounts(accData.accounts || []);
        setGroups(accData.groups || []);
        setStats(accData.stats || null);
      }

      if (warmupRes.ok) {
        const warmupData = await warmupRes.json();
        setWarmupStats(warmupData.stats || null);
      }
    } catch (err) {
      console.error('Failed to load accounts data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Check OAuth return params
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('connected') === 'true') {
        const email = params.get('email');
        showNotification(`Successfully connected Google inbox ${email || ''}! Account is ready for outreach & warmup.`);
        window.history.replaceState({}, '', '/accounts');
      } else if (params.get('error')) {
        showNotification(`OAuth authentication failed: ${params.get('error')}`, 'error');
        window.history.replaceState({}, '', '/accounts');
      }
    }
  }, []);

  const handleConnectGmailOAuth = async () => {
    try {
      const res = await fetch('/api/integrations/google/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo: '/accounts' }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        showNotification(data.error || 'Failed to initiate Google OAuth', 'error');
      }
    } catch {
      showNotification('Failed to initiate Google OAuth', 'error');
    }
  };

  const handleVerifySmtp = async () => {
    const isTitan = connectionTab === 'titan';
    const host = isTitan ? 'smtp.titan.email' : (accountForm.smtp_host || 'smtp.titan.email');
    const port = isTitan ? 465 : (accountForm.smtp_port || 465);
    const user = accountForm.smtp_username.trim() || accountForm.email_address.trim();
    const pass = accountForm.smtp_password;

    if (!user || !pass) {
      setSmtpStatus({ verified: false, message: 'Please enter your email and password first' });
      return;
    }

    setVerifyingSmtp(true);
    setSmtpStatus(null);
    try {
      const res = await fetch('/api/integrations/smtp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host,
          port,
          secure: port === 465,
          user,
          pass,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSmtpStatus({ verified: true, message: 'SMTP connection verified successfully!' });
      } else {
        setSmtpStatus({ verified: false, message: data.error || 'Connection failed. Verify your email & password (or App Password).' });
      }
    } catch {
      setSmtpStatus({ verified: false, message: 'Network error checking SMTP connection' });
    } finally {
      setVerifyingSmtp(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.email_address) return;
    setSubmitting(true);
    try {
      const isSmtp = connectionTab === 'titan' || connectionTab === 'smtp';
      const payload: any = {
        email_address: accountForm.email_address.trim(),
        sender_name: accountForm.sender_name.trim(),
        group_id: accountForm.group_id || null,
        daily_limit: accountForm.daily_limit,
        min_interval_minutes: accountForm.min_interval_minutes,
        warmup_enabled: accountForm.warmup_enabled,
        provider: isSmtp ? 'smtp' : 'gmail',
      };

      if (isSmtp) {
        payload.smtp_host = connectionTab === 'titan' ? 'smtp.titan.email' : (accountForm.smtp_host.trim() || 'smtp.titan.email');
        payload.smtp_port = connectionTab === 'titan' ? 465 : (accountForm.smtp_port || 465);
        payload.smtp_secure = connectionTab === 'titan' ? true : accountForm.smtp_secure;
        payload.smtp_username = (accountForm.smtp_username.trim() || accountForm.email_address.trim());
        payload.smtp_password = accountForm.smtp_password;
        if (connectionTab === 'titan') {
          payload.imap_host = 'imap.titan.email';
          payload.imap_port = 993;
        }
      }

      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`Inbox ${accountForm.email_address} connected successfully!`);
        setShowAddAccountModal(false);
        setAccountForm({
          email_address: '',
          sender_name: '',
          group_id: '',
          daily_limit: 18,
          min_interval_minutes: 15,
          warmup_enabled: true,
          smtp_host: 'smtp.titan.email',
          smtp_port: 465,
          smtp_secure: true,
          smtp_username: '',
          smtp_password: '',
        });
        setSmtpStatus(null);
        loadData();
      } else {
        showNotification(data.error || 'Failed to add inbox', 'error');
      }
    } catch {
      showNotification('Network error adding inbox', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/accounts/${editingAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_name: editingAccount.sender_name,
          group_id: editingAccount.group_id || null,
          daily_limit: editingAccount.daily_limit,
          min_interval_minutes: editingAccount.min_interval_minutes,
          status: editingAccount.status,
          warmup_enabled: editingAccount.warmup_enabled,
          warmup_status: editingAccount.warmup_status,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('Inbox configuration updated');
        setEditingAccount(null);
        loadData();
      } else {
        showNotification(data.error || 'Failed to update inbox', 'error');
      }
    } catch {
      showNotification('Network error updating inbox', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAccountStatus = async (account: EmailAccount) => {
    const nextStatus = account.status === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        showNotification(`Inbox ${account.email_address} ${nextStatus === 'active' ? 'resumed' : 'paused'}`);
        loadData();
      }
    } catch {
      showNotification('Failed to toggle status', 'error');
    }
  };

  const handleToggleAccountWarmup = async (account: EmailAccount) => {
    const nextEnabled = !account.warmup_enabled;
    try {
      const res = await fetch('/api/warmup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_account',
          accountId: account.id,
          warmup_enabled: nextEnabled,
          warmup_status: nextEnabled ? 'warming' : 'inactive',
        }),
      });
      if (res.ok) {
        showNotification(`Warmup ${nextEnabled ? 'enabled' : 'disabled'} for ${account.email_address}`);
        loadData();
      } else {
        showNotification('Failed to toggle warmup', 'error');
      }
    } catch {
      showNotification('Network error updating warmup status', 'error');
    }
  };

  const handleDeleteAccount = async (account: EmailAccount) => {
    if (!confirm(`Are you sure you want to disconnect inbox ${account.email_address}?`)) return;
    try {
      const res = await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification(`Inbox ${account.email_address} removed`);
        loadData();
      } else {
        showNotification('Failed to delete inbox', 'error');
      }
    } catch {
      showNotification('Network error deleting inbox', 'error');
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupForm.name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groupForm),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`Group "${groupForm.name}" created!`);
        setShowAddGroupModal(false);
        setGroupForm({
          name: '',
          description: '',
          is_warmup_enabled: true,
          warmup_daily_limit: 15,
          warmup_ramp_per_day: 2,
          warmup_reply_rate: 70,
        });
        loadData();
      } else {
        showNotification(data.error || 'Failed to create group', 'error');
      }
    } catch {
      showNotification('Network error creating group', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/groups/${editingGroup.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingGroup.name,
          description: editingGroup.description,
          is_warmup_enabled: editingGroup.is_warmup_enabled,
          warmup_daily_limit: editingGroup.warmup_daily_limit,
          warmup_ramp_per_day: editingGroup.warmup_ramp_per_day,
          warmup_reply_rate: editingGroup.warmup_reply_rate,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('Group configuration updated');
        setEditingGroup(null);
        loadData();
      } else {
        showNotification(data.error || 'Failed to update group', 'error');
      }
    } catch {
      showNotification('Network error updating group', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleGroupWarmup = async (group: AccountGroup) => {
    const nextEnabled = !group.is_warmup_enabled;
    try {
      const res = await fetch('/api/warmup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_group',
          groupId: group.id,
          is_warmup_enabled: nextEnabled,
        }),
      });
      if (res.ok) {
        showNotification(`Warmup pool ${nextEnabled ? 'activated' : 'deactivated'} for "${group.name}"`);
        loadData();
      } else {
        showNotification('Failed to toggle group warmup', 'error');
      }
    } catch {
      showNotification('Network error updating group warmup', 'error');
    }
  };

  const handleDeleteGroup = async (group: AccountGroup) => {
    if (!confirm(`Delete group "${group.name}"? Inboxes inside it will remain active and become unassigned.`)) return;
    try {
      const res = await fetch(`/api/groups/${group.id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification(`Group "${group.name}" deleted`);
        loadData();
      } else {
        showNotification('Failed to delete group', 'error');
      }
    } catch {
      showNotification('Failed to delete group', 'error');
    }
  };

  const handleTriggerWarmupCycle = async () => {
    setRunningWarmup(true);
    try {
      const res = await fetch('/api/warmup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_cycle' }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`Warmup cycle dispatched! ${data.messagesSent || 0} peer emails exchanged across ${data.groupsProcessed || 0} active groups.`);
        loadData();
      } else {
        showNotification(data.error || 'Warmup cycle failed', 'error');
      }
    } catch {
      showNotification('Failed to run warmup cycle', 'error');
    } finally {
      setRunningWarmup(false);
    }
  };

  const filteredAccounts = accounts.filter((acc) => {
    if (selectedGroupFilter === 'all') return true;
    if (selectedGroupFilter === 'unassigned') return !acc.group_id;
    return acc.group_id === selectedGroupFilter;
  });

  const warmingAccounts = accounts.filter((a) => a.warmup_enabled);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Inboxes & Warmup Pools"
          subtitle="Connect inboxes via Google OAuth, organize into campaign groups, and build domain reputation with automated peer warmup"
        >
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <button
              onClick={handleConnectGmailOAuth}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/25 transition-all"
              title="Connect another Gmail/Workspace inbox via OAuth (forces account chooser)"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Connect Google OAuth</span>
              <span className="sm:hidden">Google OAuth</span>
            </button>
            <button
              onClick={() => setShowAddGroupModal(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">+ New Group</span>
              <span className="sm:hidden">+ Group</span>
            </button>
            <button
              onClick={() => setShowAddAccountModal(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Inbox</span>
            </button>
          </div>
        </Header>

        <main className="p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8 flex-1 min-w-0">
          {notice && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
                notice.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {notice.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{notice.message}</span>
              </div>
              <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
          )}

          {/* Aggregate Quota & Scaling Banner */}
          <section className="rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 via-slate-900/60 to-slate-950 p-6 relative overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <Inbox className="w-3.5 h-3.5 text-indigo-400" /> Connected Inboxes
                </span>
                <div className="text-2xl font-bold text-white font-mono">
                  {stats?.totalAccounts ?? 0}{' '}
                  <span className="text-xs font-normal text-slate-400">({stats?.activeAccounts ?? 0} active)</span>
                </div>
                <div className="text-[11px] text-slate-400">Multi-inbox OAuth enabled</div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-blue-400" /> Outreach Sending Quota
                </span>
                <div className="text-2xl font-bold text-white font-mono">
                  {stats?.dailyCapacity ?? 0}{' '}
                  <span className="text-xs font-normal text-slate-400">emails / day</span>
                </div>
                <div className="text-[11px] text-indigo-400 font-mono">
                  {stats?.activeAccounts ?? 0} inboxes × 18 limit
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" /> Warmup Pool
                </span>
                <div className="text-2xl font-bold text-amber-400 font-mono">
                  {warmupStats?.activeAccounts ?? warmingAccounts.length}{' '}
                  <span className="text-xs font-normal text-slate-400">warming</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {warmupStats?.avgReputationScore ?? 99}% avg deliverability health
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" /> Interval Safety Guard
                </span>
                <div className="text-2xl font-bold text-white font-mono">~15 min</div>
                <div className="text-[11px] text-slate-400">Cooldown spacing between sends</div>
              </div>
            </div>
          </section>

          {/* Navigation Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-3 gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('accounts')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 ${
                  activeTab === 'accounts'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Inbox className="w-3.5 h-3.5" />
                <span>Outreach Inboxes ({accounts.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('groups')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 ${
                  activeTab === 'groups'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Account Groups ({groups.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('warmup')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 ${
                  activeTab === 'warmup'
                    ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/30'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>Warmup Pool ({warmingAccounts.length})</span>
              </button>
            </div>

            {activeTab === 'accounts' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Filter Group:</span>
                <select
                  value={selectedGroupFilter}
                  onChange={(e) => setSelectedGroupFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Groups ({accounts.length})</option>
                  <option value="unassigned">Unassigned ({accounts.filter((a) => !a.group_id).length})</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({accounts.filter((a) => a.group_id === g.id).length})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeTab === 'warmup' && (
              <button
                onClick={handleTriggerWarmupCycle}
                disabled={runningWarmup}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600/90 hover:bg-amber-600 text-white shadow-sm transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${runningWarmup ? 'animate-spin' : ''}`} />
                <span>{runningWarmup ? 'Dispatching Warmup...' : 'Run Warmup Round Now'}</span>
              </button>
            )}
          </div>

          {/* TAB 1: ACCOUNTS LIST */}
          {activeTab === 'accounts' && (
            <div>
              {filteredAccounts.length === 0 ? (
                <div className="py-16 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 space-y-3">
                  <Inbox className="w-10 h-10 text-slate-600 mx-auto" />
                  <h3 className="text-sm font-semibold text-white">No outreach inboxes found</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Connect as many accounts as you want. Each inbox safely sends 15–18 emails per day, multiplying your daily outreach volume.
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-2">
                    <button
                      onClick={handleConnectGmailOAuth}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-500 text-white shadow-sm flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Connect via Google OAuth</span>
                    </button>
                    <button
                      onClick={() => setShowAddAccountModal(true)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      Add Manually
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredAccounts.slice((accountsPage - 1) * accountsPageSize, accountsPage * accountsPageSize).map((acc) => {
                    const limit = acc.daily_limit || 18;
                    const sent = acc.sent_today || 0;
                    const remaining = Math.max(0, limit - sent);
                    const percent = Math.min(100, Math.round((sent / limit) * 100));

                    return (
                      <div
                        key={acc.id}
                        className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          {/* Header: Email and status */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="font-semibold text-white text-sm truncate max-w-[200px]" title={acc.email_address}>
                                {acc.email_address}
                              </div>
                              <div className="text-xs text-slate-400">
                                Sender: <span className="text-slate-300 font-medium">{acc.sender_name || 'Default'}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleToggleAccountStatus(acc)}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                                acc.status === 'active'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}
                              title={`Click to ${acc.status === 'active' ? 'pause' : 'resume'}`}
                            >
                              {acc.status === 'active' ? <Play className="w-2.5 h-2.5" /> : <Pause className="w-2.5 h-2.5" />}
                              <span className="capitalize">{acc.status}</span>
                            </button>
                          </div>

                          {/* Badges: Provider, Group & Warmup */}
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            {acc.provider === 'smtp' ? (
                              <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-medium text-[11px] flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-blue-400" />
                                <span>{acc.smtp_host?.includes('titan') || !acc.smtp_host ? 'Titan (GoDaddy)' : 'Custom SMTP'}</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20 font-medium text-[11px] flex items-center gap-1">
                                <Mail className="w-3 h-3 text-red-400" />
                                <span>Google OAuth</span>
                              </span>
                            )}

                            {acc.group ? (
                              <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium text-[11px]">
                                Group: {acc.group.name}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[11px]">
                                Unassigned
                              </span>
                            )}

                            {acc.warmup_enabled ? (
                              <button
                                onClick={() => handleToggleAccountWarmup(acc)}
                                className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/25 font-medium text-[11px] flex items-center gap-1 hover:bg-amber-500/20 transition-colors"
                                title="Warmup active. Click to disable."
                              >
                                <Flame className="w-3 h-3 text-amber-400" />
                                <span>Day {acc.warmup_day_count || 1} • {acc.warmup_reputation_score ?? 100}% Health</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleToggleAccountWarmup(acc)}
                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-[11px] flex items-center gap-1 transition-colors"
                                title="Click to enable warmup for this inbox"
                              >
                                <Flame className="w-3 h-3 text-slate-500" />
                                <span>Warmup Off</span>
                              </button>
                            )}
                          </div>

                          {/* Today's Limit & Progress */}
                          <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400">Outreach ({limit} max)</span>
                              <span className="font-mono text-indigo-300 font-medium">
                                {sent} sent • {remaining} left
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 transition-all duration-300"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                              <span>Interval: {acc.min_interval_minutes || 15}m</span>
                              <span>
                                {acc.warmup_enabled
                                  ? `Warmup: ${acc.warmup_sent_today || 0} sent · ${acc.warmup_received_today || 0} replied`
                                  : acc.last_sent_at
                                  ? `Sent ${new Date(acc.last_sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                  : 'Ready to send'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions Footer */}
                        <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
                          <button
                            onClick={() => setEditingAccount(acc)}
                            className="text-slate-400 hover:text-white flex items-center gap-1"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit Settings
                          </button>
                          <button
                            onClick={() => handleDeleteAccount(acc)}
                            className="text-rose-400 hover:text-rose-300 flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Inboxes Pagination */}
              {filteredAccounts.length > 0 && (
                <div className="mt-4">
                  <Pagination
                    currentPage={accountsPage}
                    totalItems={filteredAccounts.length}
                    pageSize={accountsPageSize}
                    pageSizeOptions={[6, 9, 18, 36]}
                    itemName="inboxes"
                    onPageChange={(newPage) => setAccountsPage(newPage)}
                    onPageSizeChange={(newSize) => {
                      setAccountsPageSize(newSize);
                      setAccountsPage(1);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GROUPS LIST */}
          {activeTab === 'groups' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Campaign Account Groups</h3>
                  <p className="text-xs text-slate-400">
                    Group inboxes by domain, offer, or team. Enabling Warmup for a group automatically initiates daily peer email exchanges across all member inboxes.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddGroupModal(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  + Add New Group
                </button>
              </div>

              {groups.length === 0 ? (
                <div className="py-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 space-y-2">
                  <Layers className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-sm font-medium text-slate-300">No account groups created yet</p>
                  <p className="text-xs text-slate-400">Create a group (e.g. &quot;Alpha Outreach Pool&quot;) to bundle inboxes and activate group warmup.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groups.slice((groupsPage - 1) * groupsPageSize, groupsPage * groupsPageSize).map((group) => {
                    const inboxes = accounts.filter((a) => a.group_id === group.id);
                    const activeInboxes = inboxes.filter((a) => a.status === 'active');
                    const capacity = activeInboxes.reduce((sum, a) => sum + (a.daily_limit || 18), 0);
                    const warmingCount = inboxes.filter((a) => a.warmup_enabled).length;

                    return (
                      <div
                        key={group.id}
                        className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-4 hover:border-slate-700 transition-colors flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold text-white text-sm">{group.name}</h4>
                              <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                                {group.description || 'No description provided'}
                              </p>
                            </div>
                            <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono font-medium">
                              {capacity} sends / day
                            </span>
                          </div>

                          {/* Warmup Pool Card Section */}
                          <div className={`p-3 rounded-lg border text-xs space-y-2 ${
                            group.is_warmup_enabled
                              ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                              : 'bg-slate-950/60 border-slate-800 text-slate-400'
                          }`}>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold flex items-center gap-1.5">
                                <Flame className={`w-3.5 h-3.5 ${group.is_warmup_enabled ? 'text-amber-400' : 'text-slate-500'}`} />
                                <span>Warmup Pool: {group.is_warmup_enabled ? 'Active' : 'Disabled'}</span>
                              </span>
                              <button
                                onClick={() => handleToggleGroupWarmup(group)}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                  group.is_warmup_enabled
                                    ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                }`}
                              >
                                {group.is_warmup_enabled ? 'Turn Off' : 'Activate'}
                              </button>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span>Warming Inboxes:</span>
                              <span className="font-mono text-white font-medium">{warmingCount} / {inboxes.length} inboxes</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span>Warmup Target:</span>
                              <span className="font-mono text-white font-medium">
                                Up to {group.warmup_daily_limit || 15}/day (+{group.warmup_ramp_per_day || 2}/day)
                              </span>
                            </div>
                            {inboxes.length < 2 && group.is_warmup_enabled && (
                              <div className="text-[10px] text-amber-400 flex items-center gap-1 pt-1 border-t border-amber-500/20">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>Needs 2+ inboxes in this group for peer exchanges</span>
                              </div>
                            )}
                          </div>

                          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Assigned Inboxes:</span>
                              <span className="text-slate-200 font-mono font-medium">{inboxes.length} inboxes</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Outreach Capacity:</span>
                              <span className="text-emerald-400 font-mono font-medium">
                                {activeInboxes.length} × 18 = {capacity} emails/day
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                          <button
                            onClick={() => setEditingGroup(group)}
                            className="text-slate-400 hover:text-white flex items-center gap-1"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteGroup(group)}
                            className="text-rose-400 hover:text-rose-300 flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Groups Pagination */}
              {groups.length > 0 && (
                <div className="mt-4">
                  <Pagination
                    currentPage={groupsPage}
                    totalItems={groups.length}
                    pageSize={groupsPageSize}
                    pageSizeOptions={[3, 6, 12, 24]}
                    itemName="account groups"
                    onPageChange={(newPage) => setGroupsPage(newPage)}
                    onPageSizeChange={(newSize) => {
                      setGroupsPageSize(newSize);
                      setGroupsPage(1);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 3: WARMUP POOL */}
          {activeTab === 'warmup' && (
            <div className="space-y-6">
              {/* Warmup Explain Banner */}
              <div className="p-5 rounded-2xl bg-amber-950/20 border border-amber-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 max-w-2xl">
                  <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    Automated Peer Deliverability Warmup System
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    New email accounts must be warmed up gradually to build sender reputation with Google and avoid spam filters.
                    Inboxes placed in warmup groups automatically exchange realistic business messages and auto-reply to each other at a 70% rate, ramping up volume by +2 emails each day until reaching the safe daily threshold.
                  </p>
                </div>
                <button
                  onClick={handleTriggerWarmupCycle}
                  disabled={runningWarmup}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/30 flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 transition-all"
                >
                  <RefreshCw className={`w-4 h-4 ${runningWarmup ? 'animate-spin' : ''}`} />
                  <span>{runningWarmup ? 'Dispatching Peer Warmup...' : 'Trigger Warmup Cycle Now'}</span>
                </button>
              </div>

              {/* Warmup Key Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Inbox className="w-3.5 h-3.5 text-amber-400" /> Active Warming Inboxes
                  </span>
                  <div className="text-2xl font-bold font-mono text-white">
                    {warmingAccounts.length}
                  </div>
                  <div className="text-[11px] text-slate-400">Across {groups.filter((g) => g.is_warmup_enabled).length} warmup groups</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" /> Pool Health & Reputation
                  </span>
                  <div className="text-2xl font-bold font-mono text-emerald-400">
                    {warmupStats?.avgReputationScore ?? 99}%
                  </div>
                  <div className="text-[11px] text-slate-400">Zero spam complaints</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-indigo-400" /> Total Warmup Exchanged
                  </span>
                  <div className="text-2xl font-bold font-mono text-indigo-300">
                    {warmupStats?.totalWarmupSent ?? 0}{' '}
                    <span className="text-xs font-normal text-slate-400">sent / {warmupStats?.totalWarmupReceived ?? 0} replies</span>
                  </div>
                  <div className="text-[11px] text-slate-400">Simulated human conversations</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-blue-400" /> Target Reply Rate
                  </span>
                  <div className="text-2xl font-bold font-mono text-blue-400">
                    {warmupStats?.targetReplyRate ?? 70}%
                  </div>
                  <div className="text-[11px] text-slate-400">Boosts inbox engagement score</div>
                </div>
              </div>

              {/* Inboxes Warmup Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">Inboxes in Warmup Pool</h4>
                  <span className="text-xs text-slate-400">{warmingAccounts.length} warming accounts</span>
                </div>

                {accounts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">No accounts connected yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                        <tr>
                          <th className="px-4 py-3">Account Email</th>
                          <th className="px-4 py-3">Warmup Group</th>
                          <th className="px-4 py-3">Ramp Progress</th>
                          <th className="px-4 py-3">Sent / Replies Today</th>
                          <th className="px-4 py-3">Lifetime Volume</th>
                          <th className="px-4 py-3">Health Score</th>
                          <th className="px-4 py-3 text-right">Warmup Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {accounts.slice((warmupPage - 1) * warmupPageSize, warmupPage * warmupPageSize).map((acc) => (
                          <tr key={acc.id} className="hover:bg-slate-900/60 transition-colors">
                            <td className="px-4 py-3.5 font-medium text-white">
                              {acc.email_address}
                              {acc.sender_name && (
                                <span className="block text-[11px] text-slate-400 font-normal">{acc.sender_name}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-300">
                              {acc.group ? (
                                <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[11px]">
                                  {acc.group.name}
                                </span>
                              ) : (
                                <span className="text-slate-500 italic">Unassigned</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono">
                              {acc.warmup_enabled ? (
                                <span className="text-amber-400 font-semibold">
                                  Day {acc.warmup_day_count || 1}
                                </span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-300">
                              {acc.warmup_sent_today || 0} sent • {acc.warmup_received_today || 0} replies
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-400">
                              {acc.total_warmup_sent || 0} total sends
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                  <div
                                    className="h-full bg-emerald-400 rounded-full"
                                    style={{ width: `${acc.warmup_reputation_score ?? 100}%` }}
                                  />
                                </div>
                                <span className="font-mono text-emerald-400 font-medium">
                                  {acc.warmup_reputation_score ?? 100}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleToggleAccountWarmup(acc)}
                                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                                  acc.warmup_enabled
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {acc.warmup_enabled ? 'Active' : 'Disabled'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Warmup Pool Pagination */}
                {accounts.length > 0 && (
                  <div className="p-3 border-t border-slate-800">
                    <Pagination
                      currentPage={warmupPage}
                      totalItems={accounts.length}
                      pageSize={warmupPageSize}
                      pageSizeOptions={[5, 10, 25]}
                      itemName="warmup accounts"
                      onPageChange={(newPage) => setWarmupPage(newPage)}
                      onPageSizeChange={(newSize) => {
                        setWarmupPageSize(newSize);
                        setWarmupPage(1);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: ADD OUTREACH INBOX */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Add Outreach Inbox</h3>
                <p className="text-xs text-slate-400">Connect GoDaddy Titan, Google Workspace, or custom SMTP</p>
              </div>
              <button
                onClick={() => { setShowAddAccountModal(false); setSmtpStatus(null); }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Provider Selector Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => { setConnectionTab('titan'); setSmtpStatus(null); }}
                className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  connectionTab === 'titan'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>GoDaddy Titan</span>
              </button>
              <button
                type="button"
                onClick={() => { setConnectionTab('gmail'); setSmtpStatus(null); }}
                className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  connectionTab === 'gmail'
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Google OAuth</span>
              </button>
              <button
                type="button"
                onClick={() => { setConnectionTab('smtp'); setSmtpStatus(null); }}
                className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  connectionTab === 'smtp'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>Custom SMTP</span>
              </button>
            </div>

            {/* TAB: GOOGLE OAUTH */}
            {connectionTab === 'gmail' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-gradient-to-r from-red-950/30 to-slate-950 border border-red-500/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <ExternalLink className="w-4 h-4 text-red-400" />
                      Google Workspace / Gmail OAuth
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                      Multi-Inbox OAuth
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Connect multiple Google Workspace or Gmail inboxes sequentially. Google will prompt the account chooser so you can authorize each inbox one by one.
                  </p>
                  <button
                    type="button"
                    onClick={handleConnectGmailOAuth}
                    className="w-full py-2.5 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-md shadow-red-600/20 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Authorize with Google OAuth</span>
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <span className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-indigo-400" />
                    Using Titan via Gmail "Send As"?
                  </span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    If you added your Titan email under Gmail Settings → Accounts and Import → <em>"Send mail as"</em> with Titan SMTP (<code className="text-indigo-300">smtp.titan.email</code>), authorising that Gmail account will automatically send outreach using your Titan domain alias!
                  </p>
                </div>
              </div>
            )}

            {/* TAB: TITAN & CUSTOM SMTP */}
            {(connectionTab === 'titan' || connectionTab === 'smtp') && (
              <form onSubmit={handleCreateAccount} className="space-y-4">
                {connectionTab === 'titan' && (
                  <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-950/40 to-slate-950 border border-blue-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-200 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-blue-400" />
                        GoDaddy Titan Professional Email Preset
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 font-mono">
                        smtp.titan.email:465 (SSL)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Outgoing server is pre-configured. Enter your full GoDaddy Titan email address and password below.
                    </p>
                    <div className="text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                      <strong className="text-slate-300">2FA Note:</strong> If 2-Factor Authentication is enabled on your GoDaddy account, create an App Password inside Titan Webmail settings (<strong>Preferences → Security → App Passwords</strong>).
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder={connectionTab === 'titan' ? 'you@yourdomain.com' : 'outreach@yourdomain.com'}
                    value={accountForm.email_address}
                    onChange={(e) => setAccountForm({ ...accountForm, email_address: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Sender Display Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Sarah Connor"
                    value={accountForm.sender_name}
                    onChange={(e) => setAccountForm({ ...accountForm, sender_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Password Field with Show/Hide */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-300">
                      {connectionTab === 'titan' ? 'Titan Password / App Password *' : 'SMTP Password *'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showPassword ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••••••"
                    value={accountForm.smtp_password}
                    onChange={(e) => {
                      setAccountForm({ ...accountForm, smtp_password: e.target.value });
                      setSmtpStatus(null);
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                {/* Custom SMTP host & port if custom tab */}
                {connectionTab === 'smtp' && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[11px] text-slate-400">SMTP Host *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. smtp.mailgun.org"
                        value={accountForm.smtp_host}
                        onChange={(e) => setAccountForm({ ...accountForm, smtp_host: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400">Port *</label>
                      <input
                        type="number"
                        required
                        value={accountForm.smtp_port}
                        onChange={(e) => setAccountForm({ ...accountForm, smtp_port: parseInt(e.target.value, 10) || 465 })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>
                  </div>
                )}

                {/* Test Connection Button & Status */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      disabled={verifyingSmtp || !accountForm.email_address || !accountForm.smtp_password}
                      onClick={handleVerifySmtp}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 flex items-center gap-1.5 transition-all disabled:opacity-40"
                    >
                      {verifyingSmtp ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
                          <span>Testing Connection...</span>
                        </>
                      ) : (
                        <>
                          <Key className="w-3 h-3 text-indigo-400" />
                          <span>Test Credentials</span>
                        </>
                      )}
                    </button>

                    {smtpStatus && (
                      <span
                        className={`text-xs flex items-center gap-1 font-medium ${
                          smtpStatus.verified ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {smtpStatus.verified ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                        )}
                        <span>{smtpStatus.message}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Assign to Account Group</label>
                  <select
                    value={accountForm.group_id}
                    onChange={(e) => setAccountForm({ ...accountForm, group_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">No Group (Unassigned / General Rotation)</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-300">Daily Limit (Max 18)</label>
                      <span className="text-[11px] text-indigo-400 font-mono font-bold">{accountForm.daily_limit} / day</span>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={18}
                      value={accountForm.daily_limit}
                      onChange={(e) => setAccountForm({ ...accountForm, daily_limit: parseInt(e.target.value, 10) || 18 })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[10px] text-slate-400">Strictly 15–18 emails/day for domain safety</p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-300">Interval Cooldown</label>
                      <span className="text-[11px] text-indigo-400 font-mono font-bold">{accountForm.min_interval_minutes} mins</span>
                    </div>
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={accountForm.min_interval_minutes}
                      onChange={(e) => setAccountForm({ ...accountForm, min_interval_minutes: parseInt(e.target.value, 10) || 15 })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[10px] text-slate-400">Minimum spacing between sends</p>
                  </div>
                </div>

                {/* Warmup Checkbox */}
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accountForm.warmup_enabled}
                    onChange={(e) => setAccountForm({ ...accountForm, warmup_enabled: e.target.checked })}
                    className="rounded border-slate-700 text-amber-500 focus:ring-0 focus:outline-none"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-white flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      Auto-enroll in Daily Warmup Pool
                    </span>
                    <span className="text-slate-400 block text-[11px]">
                      Builds sender reputation across active outreach peers
                    </span>
                  </div>
                </label>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => { setShowAddAccountModal(false); setSmtpStatus(null); }}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-blue-600/30"
                  >
                    {submitting ? 'Connecting...' : connectionTab === 'titan' ? 'Connect Titan Inbox' : 'Save Outreach Inbox'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: EDIT OUTREACH INBOX */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Edit Inbox Settings</h3>
                <p className="text-xs text-slate-400 font-mono">{editingAccount.email_address}</p>
              </div>
              <button onClick={() => setEditingAccount(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateAccount} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Sender Display Name</label>
                <input
                  type="text"
                  value={editingAccount.sender_name || ''}
                  onChange={(e) => setEditingAccount({ ...editingAccount, sender_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Account Group</label>
                <select
                  value={editingAccount.group_id || ''}
                  onChange={(e) => setEditingAccount({ ...editingAccount, group_id: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">No Group (Unassigned)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              {editingAccount.provider === 'smtp' && (
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
                  <div className="text-[11px] text-slate-400 font-medium">SMTP Server (GoDaddy Titan / Custom)</div>
                  <div className="font-mono text-indigo-300">
                    {editingAccount.smtp_host || 'smtp.titan.email'}:{editingAccount.smtp_port || 465}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Daily Limit (Max 18)</label>
                  <input
                    type="number"
                    min={1}
                    max={18}
                    value={editingAccount.daily_limit}
                    onChange={(e) => setEditingAccount({ ...editingAccount, daily_limit: parseInt(e.target.value, 10) || 18 })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Interval Cooldown (mins)</label>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={editingAccount.min_interval_minutes}
                    onChange={(e) => setEditingAccount({ ...editingAccount, min_interval_minutes: parseInt(e.target.value, 10) || 15 })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Status and Warmup row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Sending Status</label>
                  <select
                    value={editingAccount.status}
                    onChange={(e) => setEditingAccount({ ...editingAccount, status: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="active">Active (Sending Enabled)</option>
                    <option value="paused">Paused (Temporarily Halts Sends)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Warmup Status</label>
                  <select
                    value={editingAccount.warmup_status || (editingAccount.warmup_enabled ? 'warming' : 'inactive')}
                    onChange={(e) => {
                      const val = e.target.value as 'inactive' | 'warming' | 'warm' | 'paused';
                      setEditingAccount({
                        ...editingAccount,
                        warmup_status: val,
                        warmup_enabled: val !== 'inactive',
                      });
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="warming">Warming (Active Pool)</option>
                    <option value="warm">Warm (Completed Ramp)</option>
                    <option value="paused">Warmup Paused</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Update Inbox'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD ACCOUNT GROUP */}
      {showAddGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Create Account Group</h3>
                <p className="text-xs text-slate-400">Bundle inboxes for campaign rotation & peer warmup</p>
              </div>
              <button onClick={() => setShowAddGroupModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Group Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Domain Alpha Warmup & Outreach"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Description</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Dedicated inbox group for new outbound domains"
                  value={groupForm.description}
                  onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Group Warmup Settings */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={groupForm.is_warmup_enabled}
                    onChange={(e) => setGroupForm({ ...groupForm, is_warmup_enabled: e.target.checked })}
                    className="rounded border-slate-700 text-amber-500 focus:ring-0 focus:outline-none"
                  />
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    Enable Daily Warmup Pool for this Group
                  </span>
                </label>

                {groupForm.is_warmup_enabled && (
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/80 text-xs">
                    <div>
                      <label className="text-[10px] text-slate-400 block">Daily Limit</label>
                      <input
                        type="number"
                        min={5}
                        max={30}
                        value={groupForm.warmup_daily_limit}
                        onChange={(e) => setGroupForm({ ...groupForm, warmup_daily_limit: parseInt(e.target.value, 10) || 15 })}
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block">Ramp / Day</label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={groupForm.warmup_ramp_per_day}
                        onChange={(e) => setGroupForm({ ...groupForm, warmup_ramp_per_day: parseInt(e.target.value, 10) || 2 })}
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block">Reply Rate %</label>
                      <input
                        type="number"
                        min={30}
                        max={90}
                        value={groupForm.warmup_reply_rate}
                        onChange={(e) => setGroupForm({ ...groupForm, warmup_reply_rate: parseInt(e.target.value, 10) || 70 })}
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddGroupModal(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT ACCOUNT GROUP */}
      {editingGroup && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Edit Account Group</h3>
                <p className="text-xs text-slate-400">Update group details & warmup parameters</p>
              </div>
              <button onClick={() => setEditingGroup(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateGroup} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Group Name *</label>
                <input
                  type="text"
                  required
                  value={editingGroup.name}
                  onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Description</label>
                <textarea
                  rows={2}
                  value={editingGroup.description}
                  onChange={(e) => setEditingGroup({ ...editingGroup, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Group Warmup Settings */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingGroup.is_warmup_enabled ?? false}
                    onChange={(e) => setEditingGroup({ ...editingGroup, is_warmup_enabled: e.target.checked })}
                    className="rounded border-slate-700 text-amber-500 focus:ring-0 focus:outline-none"
                  />
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    Enable Daily Warmup Pool for this Group
                  </span>
                </label>

                {editingGroup.is_warmup_enabled && (
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/80 text-xs">
                    <div>
                      <label className="text-[10px] text-slate-400 block">Daily Limit</label>
                      <input
                        type="number"
                        min={5}
                        max={30}
                        value={editingGroup.warmup_daily_limit ?? 15}
                        onChange={(e) => setEditingGroup({ ...editingGroup, warmup_daily_limit: parseInt(e.target.value, 10) || 15 })}
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block">Ramp / Day</label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={editingGroup.warmup_ramp_per_day ?? 2}
                        onChange={(e) => setEditingGroup({ ...editingGroup, warmup_ramp_per_day: parseInt(e.target.value, 10) || 2 })}
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block">Reply Rate %</label>
                      <input
                        type="number"
                        min={30}
                        max={90}
                        value={editingGroup.warmup_reply_rate ?? 70}
                        onChange={(e) => setEditingGroup({ ...editingGroup, warmup_reply_rate: parseInt(e.target.value, 10) || 70 })}
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingGroup(null)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
