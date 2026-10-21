'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
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
  Sliders,
  X,
  Play,
  Pause,
  AlertTriangle,
} from 'lucide-react';

interface AccountGroup {
  id: string;
  name: string;
  description: string;
  accounts_count?: number;
  daily_capacity?: number;
}

interface EmailAccount {
  id: string;
  user_id: string;
  email_address: string;
  sender_name?: string;
  group_id?: string | null;
  group?: AccountGroup | null;
  daily_limit: number;
  min_interval_minutes: number;
  status: 'active' | 'paused' | 'error';
  last_sent_at?: string | null;
  sent_today?: number;
  remaining_today?: number;
  connected_at: string;
}

interface AccountStats {
  totalAccounts: number;
  activeAccounts: number;
  dailyCapacity: number;
  sentToday: number;
  remainingToday: number;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'accounts' | 'groups'>('accounts');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');

  // Modals state
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<EmailAccount | null>(null);
  const [editingGroup, setEditingGroup] = useState<AccountGroup | null>(null);

  // Form states
  const [accountForm, setAccountForm] = useState({
    email_address: '',
    sender_name: '',
    group_id: '',
    daily_limit: 18,
    min_interval_minutes: 15,
  });

  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (res.ok) {
        setAccounts(data.accounts || []);
        setGroups(data.groups || []);
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error('Failed to load accounts data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotice({ message, type });
    setTimeout(() => setNotice(null), 4000);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.email_address) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...accountForm,
          group_id: accountForm.group_id || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`Inbox ${accountForm.email_address} added successfully!`);
        setShowAddAccountModal(false);
        setAccountForm({
          email_address: '',
          sender_name: '',
          group_id: '',
          daily_limit: 18,
          min_interval_minutes: 15,
        });
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
        setGroupForm({ name: '', description: '' });
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
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('Group updated successfully');
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

  const handleDeleteGroup = async (group: AccountGroup) => {
    if (!confirm(`Delete group "${group.name}"? Inboxes inside it will remain active and become unassigned.`)) return;
    try {
      const res = await fetch(`/api/groups/${group.id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification(`Group "${group.name}" deleted`);
        loadData();
      }
    } catch {
      showNotification('Failed to delete group', 'error');
    }
  };

  const handleConnectGmailOAuth = async () => {
    try {
      const res = await fetch('/api/integrations/google/connect', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      showNotification('Failed to initiate Google OAuth', 'error');
    }
  };

  const filteredAccounts = accounts.filter((acc) => {
    if (selectedGroupFilter === 'all') return true;
    if (selectedGroupFilter === 'unassigned') return !acc.group_id;
    return acc.group_id === selectedGroupFilter;
  });

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header
          title="Inboxes & Account Groups"
          subtitle="Add multiple outreach inboxes, organize into groups, and enforce 15–18 daily limits per inbox"
        >
          <div className="flex items-center gap-2">
            <button
              onClick={handleConnectGmailOAuth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/90 hover:bg-red-600 text-white shadow-sm shadow-red-600/20 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Connect Google OAuth</span>
            </button>
            <button
              onClick={() => setShowAddGroupModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>+ New Group</span>
            </button>
            <button
              onClick={() => setShowAddAccountModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Outreach Inbox</span>
            </button>
          </div>
        </Header>

        <main className="p-8 max-w-7xl w-full mx-auto space-y-8 flex-1">
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
                <div className="text-[11px] text-slate-400">Can add unlimited inboxes</div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-blue-400" /> Total Daily Limit
                </span>
                <div className="text-2xl font-bold text-white font-mono">
                  {stats?.dailyCapacity ?? 0}{' '}
                  <span className="text-xs font-normal text-slate-400">emails / day</span>
                </div>
                <div className="text-[11px] text-indigo-400 font-mono">
                  {stats?.activeAccounts ?? 0} inboxes × 18 max limit
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Remaining Today
                </span>
                <div className="text-2xl font-bold text-emerald-400 font-mono">
                  {stats?.remainingToday ?? 0}{' '}
                  <span className="text-xs font-normal text-slate-400">sends left</span>
                </div>
                <div className="text-[11px] text-slate-400">{stats?.sentToday ?? 0} sent so far today</div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" /> Interval Safety Guard
                </span>
                <div className="text-2xl font-bold text-white font-mono">~15 min</div>
                <div className="text-[11px] text-slate-400">Spacing between sends per inbox</div>
              </div>
            </div>
          </section>

          {/* Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('accounts')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 ${
                  activeTab === 'accounts'
                    ? 'bg-indigo-600 text-white'
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
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Account Groups ({groups.length})</span>
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
                      onClick={() => setShowAddAccountModal(true)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
                    >
                      + Add Outreach Inbox
                    </button>
                    <button
                      onClick={handleConnectGmailOAuth}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      Connect Google OAuth
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredAccounts.map((acc) => {
                    const limit = acc.daily_limit || 18;
                    const sent = acc.sent_today || 0;
                    const remaining = Math.max(0, limit - sent);
                    const percent = Math.min(100, Math.round((sent / limit) * 100));

                    return (
                      <div
                        key={acc.id}
                        className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-4 hover:border-slate-700 transition-all"
                      >
                        {/* Header: Email and status */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="font-semibold text-white text-sm truncate max-w-[200px]" title={acc.email_address}>
                              {acc.email_address}
                            </div>
                            <div className="text-xs text-slate-400">
                              Sender Name: <span className="text-slate-300 font-medium">{acc.sender_name || 'Default'}</span>
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

                        {/* Group info badge */}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-400">Group:</span>
                          {acc.group ? (
                            <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium text-[11px]">
                              {acc.group.name}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[11px]">
                              Unassigned (Default)
                            </span>
                          )}
                        </div>

                        {/* Today's Limit & Progress */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-800">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Today&apos;s Quota ({limit} max)</span>
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
                              {acc.last_sent_at
                                ? `Sent ${new Date(acc.last_sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                : 'Ready to send'}
                            </span>
                          </div>
                        </div>

                        {/* Actions Footer */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
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
            </div>
          )}

          {/* TAB 2: GROUPS LIST */}
          {activeTab === 'groups' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Campaign Account Groups</h3>
                  <p className="text-xs text-slate-400">
                    Group your inboxes by domain, offer, or SDR team. When a campaign selects a group, sends are automatically balanced across all inboxes in that group.
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
                  <p className="text-xs text-slate-400">Create a group (e.g. &quot;Alpha Outreach Inboxes&quot;) to link multiple inboxes together.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groups.map((group) => {
                    const inboxes = accounts.filter((a) => a.group_id === group.id);
                    const activeInboxes = inboxes.filter((a) => a.status === 'active');
                    const capacity = activeInboxes.reduce((sum, a) => sum + (a.daily_limit || 18), 0);

                    return (
                      <div
                        key={group.id}
                        className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-4 hover:border-slate-700 transition-colors"
                      >
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

                        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Assigned Inboxes:</span>
                            <span className="text-slate-200 font-mono font-medium">{inboxes.length} inboxes</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Active Sending Capacity:</span>
                            <span className="text-emerald-400 font-mono font-medium">
                              {activeInboxes.length} × 18 = {capacity} emails/day
                            </span>
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
            </div>
          )}
        </main>
      </div>

      {/* MODAL: ADD OUTREACH INBOX */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Add Outreach Inbox</h3>
                <p className="text-xs text-slate-400">Configure email address, daily sending limit (15–18), and safety interval</p>
              </div>
              <button
                onClick={() => setShowAddAccountModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. outreach@yourdomain.com"
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
                  <p className="text-[10px] text-slate-400">Strictly 15–18 emails/day to avoid spam flags</p>
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
                  <p className="text-[10px] text-slate-400">Minimum delay between sends from this inbox</p>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Save Outreach Inbox'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT OUTREACH INBOX */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
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

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Status</label>
                <select
                  value={editingAccount.status}
                  onChange={(e) => setEditingAccount({ ...editingAccount, status: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="active">Active (Sending Enabled)</option>
                  <option value="paused">Paused (Temporarily Halts Sends)</option>
                </select>
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Create Account Group</h3>
                <p className="text-xs text-slate-400">Bundle inboxes together for campaign rotation</p>
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
                  placeholder="e.g. Domain A Primary Outreach"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Description</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Inboxes for outbound enterprise campaigns"
                  value={groupForm.description}
                  onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                />
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Edit Account Group</h3>
                <p className="text-xs text-slate-400">Update group details</p>
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
