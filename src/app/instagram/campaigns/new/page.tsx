'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { InstagramIcon } from '@/components/InstagramIcon';
import { ArrowLeft, Plus, Trash2, ArrowRight, AlertCircle } from 'lucide-react';

export default function NewInstagramCampaignPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<{ id: string; username: string; status: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    instagram_account_id: '',
    business_context: '',
    ideal_customer_profile: '',
    offer: '',
    tone: 'Casual, warm, conversational, zero fluff',
    call_to_action: 'Quick chat or 10-minute intro call',
    initial_dm_instructions: 'Keep under 60 words. Sound like a real human DM, not an email.',
    sending_config: {
      days: [1, 2, 3, 4, 5],
      start_hour: 9,
      end_hour: 20,
      timezone: 'Asia/Kolkata',
      daily_limit: 25,
      hourly_limit: 6,
    },
    followup_config: {
      max_followups: 2,
      steps: [
        { step: 1, delay_days: 3, instructions: 'Friendly short bump with a relevant quick insight' },
        { step: 2, delay_days: 7, instructions: 'Light final check-in with low-friction question' },
      ],
    },
  });

  useEffect(() => {
    fetch('/api/instagram/accounts')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.accounts)) {
          setAccounts(data.accounts);
        }
      })
      .catch(() => {});
  }, []);

  const toggleDay = (d: number) => {
    const days = form.sending_config.days.includes(d)
      ? form.sending_config.days.filter((x) => x !== d)
      : [...form.sending_config.days, d].sort();
    setForm({ ...form, sending_config: { ...form.sending_config, days } });
  };

  const addFollowup = () => {
    if (form.followup_config.steps.length >= 4) return;
    const next = form.followup_config.steps.length + 1;
    const steps = [
      ...form.followup_config.steps,
      { step: next, delay_days: next * 3, instructions: 'Quick friendly follow-up DM' },
    ];
    setForm({ ...form, followup_config: { max_followups: steps.length, steps } });
  };

  const removeFollowup = (idx: number) => {
    const steps = form.followup_config.steps
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, step: i + 1 }));
    setForm({ ...form, followup_config: { max_followups: steps.length, steps } });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Campaign name is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/instagram/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          instagram_account_id: form.instagram_account_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create Instagram campaign.');
      router.push(`/instagram/campaigns/${data.id}`);
    } catch (err: any) {
      setError(err.message || 'Creation failed');
      setLoading(false);
    }
  };

  const dayLabels = [
    { id: 1, label: 'Mon' },
    { id: 2, label: 'Tue' },
    { id: 3, label: 'Wed' },
    { id: 4, label: 'Thu' },
    { id: 5, label: 'Fri' },
    { id: 6, label: 'Sat' },
    { id: 0, label: 'Sun' },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="New Instagram DM Campaign"
          subtitle="Configure your AI DM messaging, IG sender account, and safe DM pacing"
          category="Instagram DM"
        >
          <Link
            href="/instagram/campaigns"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-800 text-slate-300"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </Link>
        </Header>

        <main className="p-4 sm:p-6 lg:p-8 max-w-4xl w-full mx-auto">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <InstagramIcon className="w-4 h-4 text-fuchsia-400" />
                <span>Campaign Identity & Sender</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ig-camp-name" className="block text-xs text-slate-300 mb-1">
                    Campaign Name <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="ig-camp-name"
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Q4 Fitness Coaches DM Outreach"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="ig-camp-account" className="block text-xs text-slate-300 mb-1">
                    Sending Instagram Account
                  </label>
                  <select
                    id="ig-camp-account"
                    value={form.instagram_account_id}
                    onChange={(e) => setForm({ ...form, instagram_account_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100"
                  >
                    <option value="">Rotate across all active IG accounts</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        @{a.username} ({a.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-100">DM Offer & AI Personalization</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ig-camp-context" className="block text-xs text-slate-300 mb-1">Business Context</label>
                  <textarea
                    id="ig-camp-context"
                    rows={3}
                    value={form.business_context}
                    onChange={(e) => setForm({ ...form, business_context: e.target.value })}
                    placeholder="Who are you and what problem do you solve?"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="ig-camp-icp" className="block text-xs text-slate-300 mb-1">Ideal Customer Profile</label>
                  <textarea
                    id="ig-camp-icp"
                    rows={3}
                    value={form.ideal_customer_profile}
                    onChange={(e) => setForm({ ...form, ideal_customer_profile: e.target.value })}
                    placeholder="e.g., Boutique gyms, D2C skincare brands, SaaS founders on IG"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ig-camp-offer" className="block text-xs text-slate-300 mb-1">Core Offer</label>
                  <input
                    id="ig-camp-offer"
                    type="text"
                    value={form.offer}
                    onChange={(e) => setForm({ ...form, offer: e.target.value })}
                    placeholder="We help convert IG followers into booked calls automatically"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="ig-camp-cta" className="block text-xs text-slate-300 mb-1">Call to Action</label>
                  <input
                    id="ig-camp-cta"
                    type="text"
                    value={form.call_to_action}
                    onChange={(e) => setForm({ ...form, call_to_action: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ig-camp-tone" className="block text-xs text-slate-300 mb-1">DM Tone</label>
                  <input
                    id="ig-camp-tone"
                    type="text"
                    value={form.tone}
                    onChange={(e) => setForm({ ...form, tone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="ig-camp-instr" className="block text-xs text-slate-300 mb-1">Initial DM Prompt Rules</label>
                  <input
                    id="ig-camp-instr"
                    type="text"
                    value={form.initial_dm_instructions}
                    onChange={(e) => setForm({ ...form, initial_dm_instructions: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-100">Sending Schedule & Pacing</h2>
              <div className="flex flex-wrap gap-2">
                {dayLabels.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDay(d.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                      form.sending_config.days.includes(d.id)
                        ? 'bg-fuchsia-600 border-fuchsia-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="ig-start-hr" className="block text-xs text-slate-300 mb-1">Start Hour</label>
                  <input
                    id="ig-start-hr"
                    type="number"
                    min={0}
                    max={23}
                    value={form.sending_config.start_hour}
                    onChange={(e) =>
                      setForm({ ...form, sending_config: { ...form.sending_config, start_hour: Number(e.target.value) } })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="ig-end-hr" className="block text-xs text-slate-300 mb-1">End Hour</label>
                  <input
                    id="ig-end-hr"
                    type="number"
                    min={0}
                    max={23}
                    value={form.sending_config.end_hour}
                    onChange={(e) =>
                      setForm({ ...form, sending_config: { ...form.sending_config, end_hour: Number(e.target.value) } })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="ig-daily-cap" className="block text-xs text-slate-300 mb-1">Daily DM Limit</label>
                  <input
                    id="ig-daily-cap"
                    type="number"
                    min={1}
                    max={100}
                    value={form.sending_config.daily_limit}
                    onChange={(e) =>
                      setForm({ ...form, sending_config: { ...form.sending_config, daily_limit: Number(e.target.value) } })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="ig-hourly-cap" className="block text-xs text-slate-300 mb-1">Hourly DM Limit</label>
                  <input
                    id="ig-hourly-cap"
                    type="number"
                    min={1}
                    max={30}
                    value={form.sending_config.hourly_limit}
                    onChange={(e) =>
                      setForm({ ...form, sending_config: { ...form.sending_config, hourly_limit: Number(e.target.value) } })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100">DM Follow-up Sequence</h2>
                <button
                  type="button"
                  onClick={addFollowup}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Step
                </button>
              </div>
              <div className="space-y-3">
                {form.followup_config.steps.map((st, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-xs font-mono text-fuchsia-400 shrink-0">DM #{idx + 2}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] text-slate-400">After</span>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={st.delay_days}
                        onChange={(e) => {
                          const steps = [...form.followup_config.steps];
                          steps[idx] = { ...steps[idx], delay_days: Number(e.target.value) };
                          setForm({ ...form, followup_config: { ...form.followup_config, steps } });
                        }}
                        className="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                      />
                      <span className="text-[11px] text-slate-400">days</span>
                    </div>
                    <input
                      type="text"
                      value={st.instructions}
                      onChange={(e) => {
                        const steps = [...form.followup_config.steps];
                        steps[idx] = { ...steps[idx], instructions: e.target.value };
                        setForm({ ...form, followup_config: { ...form.followup_config, steps } });
                      }}
                      className="flex-1 w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                    />
                    <button type="button" onClick={() => removeFollowup(idx)} className="p-1 text-slate-500 hover:text-rose-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Link href="/instagram/campaigns" className="px-4 py-2 rounded-lg text-xs bg-slate-800 text-slate-300">
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white disabled:opacity-50"
              >
                <span>{loading ? 'Creating...' : 'Create Campaign & Add Leads'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
