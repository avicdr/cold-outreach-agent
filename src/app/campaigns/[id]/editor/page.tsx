'use client';

import { useState, useEffect, use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { EmailMessage } from '@/types/database';
import {
  Sparkles,
  Save,
  Send,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
  Eye,
  Info,
} from 'lucide-react';
import { Suspense } from 'react';

export default function EmailEditorPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Loading editor...</div>}>
      <EmailEditorInner params={params} />
    </Suspense>
  );
}

function EmailEditorInner({ params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const messageId = searchParams.get('messageId');

  const [message, setMessage] = useState<EmailMessage | null>(null);
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [validation, setValidation] = useState<{
    unsupported_claims: string[];
    unresolved_placeholders: string[];
    word_count: number;
    char_count: number;
    needs_review: boolean;
  } | null>(null);

  useEffect(() => {
    if (!messageId) {
      // Auto-load the first message of the campaign if messageId is not passed in query params
      fetch(`/api/campaigns/${campaignId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.messages && data.messages.length > 0) {
            const firstMsg = data.messages[0];
            router.replace(`/campaigns/${campaignId}/editor?messageId=${firstMsg.id}`);
          } else {
            setLoading(false);
          }
        })
        .catch(() => setLoading(false));
      return;
    }

    fetch(`/api/messages/${messageId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.message) {
          setMessage(data.message);
          setSubject(data.message.subject);
          setBodyText(data.message.body_text);
          setValidation(data.validation);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [messageId, campaignId, router]);

  const handleSaveDraft = async () => {
    if (!messageId) return;
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`/api/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body_text: bodyText }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        setValidation(data.validation);
        setSaveStatus('Draft saved successfully!');
      } else {
        setSaveStatus(`Failed to save: ${data.error}`);
      }
    } catch {
      setSaveStatus('Error saving draft');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const handleRegenerate = async () => {
    if (!messageId) return;
    setIsRegenerating(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`/api/messages/${messageId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_instructions: customInstructions }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        setSubject(data.message.subject);
        setBodyText(data.message.body_text);
        setValidation(data.validation);
        setSaveStatus('Regenerated personalized draft with Gemini!');
      } else {
        setSaveStatus(`Regeneration error: ${data.error}`);
      }
    } catch {
      setSaveStatus('Failed to regenerate');
    } finally {
      setIsRegenerating(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailAddress) {
      alert('Please enter an email address to receive the test email.');
      return;
    }
    if (!messageId) {
      alert('No active email draft loaded to test.');
      return;
    }
    setIsSendingTest(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`/api/messages/${messageId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_email: testEmailAddress,
          subject,
          body_text: bodyText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send test email');
      }
      alert(`Test email sent successfully to ${testEmailAddress} from ${data.sender || 'your connected Gmail account'}! Please check your inbox.`);
      setSaveStatus(`Test email dispatched to ${testEmailAddress} via Gmail!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Failed to send test email: ${msg}`);
      setSaveStatus(`Error: ${msg}`);
    } finally {
      setIsSendingTest(false);
      setTimeout(() => setSaveStatus(null), 5000);
    }
  };

  const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;
  const charCount = bodyText.length;

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title="Interactive Email Editor" subtitle={`Campaign Lead Draft Editor`}>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <Link
              href={`/campaigns/${campaignId}`}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back to Campaign</span>
              <span className="sm:hidden">Back</span>
            </Link>
            <button
              onClick={handleSaveDraft}
              disabled={isSaving || !messageId}
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
            </button>
          </div>
        </Header>

        <main className="p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6 min-w-0">
          {saveStatus && (
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-400" />
              <span>{saveStatus}</span>
            </div>
          )}

          {/* Warnings & Claims Banner */}
          {validation && (validation.unsupported_claims.length > 0 || validation.unresolved_placeholders.length > 0) && (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-amber-300">
                <AlertTriangle className="w-4 h-4" />
                <span>Verification & Safety Warnings</span>
              </div>
              {validation.unresolved_placeholders.length > 0 && (
                <div className="text-amber-200">
                  <span className="font-semibold">Unresolved Placeholders:</span>{' '}
                  {validation.unresolved_placeholders.join(', ')}
                </div>
              )}
              {validation.unsupported_claims.length > 0 && (
                <div className="text-amber-200">
                  <span className="font-semibold">Potential Unverified Claims / Fluff:</span>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    {validation.unsupported_claims.map((claim, idx) => (
                      <li key={idx}>{claim}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Editor Canvas */}
            <div className="lg:col-span-2 space-y-4">
              <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
                {/* Subject Line */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Subject Line
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm font-medium text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Body Text */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Email Body (Plain Text)
                    </label>
                    <div className="text-[11px] text-slate-500">
                      {wordCount} words | {charCount} chars
                    </div>
                  </div>
                  <textarea
                    rows={12}
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 font-sans leading-relaxed focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Personalization Basis Box */}
                {message?.personalization_basis && message.personalization_basis.length > 0 && (
                  <div className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-900/40 text-xs space-y-1">
                    <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" /> Personalization Evidence Provided by Gemini:
                    </div>
                    <ul className="list-disc list-inside text-slate-400 space-y-0.5">
                      {message.personalization_basis.map((basis, idx) => (
                        <li key={idx}>{basis}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Controls & AI Prompt Revision */}
            <div className="space-y-4">
              {/* AI Revision */}
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>AI Regeneration & Refinement</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Ask Gemini to adjust tone, focus on a different benefit, or shorten length.
                </p>
                <textarea
                  rows={3}
                  placeholder="e.g. Make it more casual, keep it strictly under 60 words, emphasize time savings."
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={isRegenerating || !messageId}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                  <span>{isRegenerating ? 'Writing with Gemini...' : 'Regenerate Draft'}</span>
                </button>
              </div>

              {/* Send Test Email */}
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-slate-400" />
                  <span>Send Test Email</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Preview how this email renders in your inbox before campaign dispatch.
                </p>
                <input
                  type="email"
                  placeholder="your.email@business.com"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={isSendingTest}
                  className="w-full py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                >
                  {isSendingTest ? 'Sending Test...' : 'Send Test'}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
