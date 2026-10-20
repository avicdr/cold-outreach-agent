'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import {
  Sparkles,
  Send,
  Clock,
  Calendar,
  Layers,
  ArrowRight,
  ArrowLeft,
  XCircle,
  Plus,
  Trash2,
} from 'lucide-react';

export default function NewCampaignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    business_context: '',
    ideal_customer_profile: '',
    offer: '',
    tone: 'Concise, direct, highly professional',
    call_to_action: '15-minute quick discovery call',
    initial_email_instructions: 'Keep under 100 words. Focus on specific value without fluff.',
    sending_config: {
      days: [1, 2, 3, 4, 5], // Mon-Fri
      start_hour: 9,
      end_hour: 17,
      timezone: 'Asia/Kolkata',
      daily_limit: 15,
      hourly_limit: 4,
    },
    followup_config: {
      max_followups: 2,
      steps: [
        { step: 1, delay_days: 4, instructions: 'Polite reminder sharing a concise perspective or short case study.' },
        { step: 2, delay_days: 9, instructions: 'Final friendly breakup email with a low friction question.' },
      ],
    },
  });

  const toggleDay = (dayNum: number) => {
    const currentDays = form.sending_config.days;
    const nextDays = currentDays.includes(dayNum)
      ? currentDays.filter((d) => d !== dayNum)
      : [...currentDays, dayNum].sort();
    setForm({
      ...form,
      sending_config: { ...form.sending_config, days: nextDays },
    });
  };

  const handleStepChange = (index: number, field: string, val: any) => {
    const steps = [...form.followup_config.steps];
    steps[index] = { ...steps[index], [field]: val };
    setForm({
      ...form,
      followup_config: { ...form.followup_config, steps },
    });
  };

  const addFollowupStep = () => {
    if (form.followup_config.steps.length >= 4) return;
    const nextStepNum = form.followup_config.steps.length + 1;
    const steps = [
      ...form.followup_config.steps,
      { step: nextStepNum, delay_days: nextStepNum * 4, instructions: 'Follow-up check-in' },
    ];
    setForm({
      ...form,
      followup_config: { ...form.followup_config, max_followups: steps.length, steps },
    });
  };

  const removeFollowupStep = (index: number) => {
    const steps = form.followup_config.steps.filter((_, i) => i !== index);
    setForm({
      ...form,
      followup_config: { ...form.followup_config, max_followups: steps.length, steps },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Campaign name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create campaign');
      }

      router.push(`/campaigns/${data.id}`);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setLoading(false);
    }
  };

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title="Create Campaign" subtitle="Define campaign persona, offer, schedule, and follow-ups" />

        <main className="p-8 max-w-4xl w-full mx-auto space-y-8">
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* 1. Campaign Basics */}
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/30 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-400" />
                <span>1. Campaign Information</span>
              </h3>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Campaign Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Q4 B2B SaaS Founders Outreach"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Ideal Customer Profile (ICP)</label>
                    <input
                      type="text"
                      placeholder="e.g. CTOs and VP Eng at seed to Series B startups"
                      value={form.ideal_customer_profile}
                      onChange={(e) => setForm({ ...form, ideal_customer_profile: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Call to Action (CTA)</label>
                    <input
                      type="text"
                      placeholder="e.g. 15-minute quick discovery call"
                      value={form.call_to_action}
                      onChange={(e) => setForm({ ...form, call_to_action: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Your Offer / Core Value Proposition</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. We automate B2B outbound research and personalization with verified claims, cutting lead prep time by 80%."
                    value={form.offer}
                    onChange={(e) => setForm({ ...form, offer: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Tone of Voice</label>
                    <input
                      type="text"
                      placeholder="e.g. Concise, direct, helpful"
                      value={form.tone}
                      onChange={(e) => setForm({ ...form, tone: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Initial Email Instructions</label>
                    <input
                      type="text"
                      placeholder="e.g. Keep under 90 words. Reference lead company naturally."
                      value={form.initial_email_instructions}
                      onChange={(e) => setForm({ ...form, initial_email_instructions: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Sending Schedule & Limits */}
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/30 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>2. Sending Schedule & Safety Limits</span>
              </h3>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-2">Sending Days</label>
                  <div className="flex flex-wrap gap-2">
                    {dayLabels.map((day, idx) => {
                      const isSelected = form.sending_config.days.includes(idx);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(idx)}
                          className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Sending Hours (Window)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="23"
                        value={form.sending_config.start_hour}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            sending_config: { ...form.sending_config, start_hour: parseInt(e.target.value, 10) },
                          })
                        }
                        className="w-16 px-2 py-1.5 rounded bg-slate-950 border border-slate-800 text-center text-slate-200"
                      />
                      <span className="text-slate-500">to</span>
                      <input
                        type="number"
                        min="0"
                        max="23"
                        value={form.sending_config.end_hour}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            sending_config: { ...form.sending_config, end_hour: parseInt(e.target.value, 10) },
                          })
                        }
                        className="w-16 px-2 py-1.5 rounded bg-slate-950 border border-slate-800 text-center text-slate-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Daily Limit</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={form.sending_config.daily_limit}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          sending_config: { ...form.sending_config, daily_limit: parseInt(e.target.value, 10) },
                        })
                      }
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Timezone</label>
                    <input
                      type="text"
                      value={form.sending_config.timezone}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          sending_config: { ...form.sending_config, timezone: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Follow-up Sequence */}
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/30 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span>3. Multi-Step Follow-Up Sequence</span>
                </h3>
                {form.followup_config.steps.length < 3 && (
                  <button
                    type="button"
                    onClick={addFollowupStep}
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Follow-up Step
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {form.followup_config.steps.map((st, i) => (
                  <div key={i} className="p-4 rounded-lg border border-slate-800/80 bg-slate-950/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300">Follow-up Step #{st.step}</span>
                      {form.followup_config.steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeFollowupStep(i)}
                          className="text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1">Delay (Days after prev email)</label>
                        <input
                          type="number"
                          min="1"
                          max="30"
                          value={st.delay_days}
                          onChange={(e) => handleStepChange(i, 'delay_days', parseInt(e.target.value, 10))}
                          className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-200"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-slate-400 mb-1">AI Prompt Instructions for Step</label>
                        <input
                          type="text"
                          value={st.instructions}
                          onChange={(e) => handleStepChange(i, 'instructions', e.target.value)}
                          className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-200"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <Link
                href="/campaigns"
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-colors disabled:opacity-50"
              >
                <span>{loading ? 'Creating Campaign...' : 'Save & Configure Campaign'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
