'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Ban, ShieldCheck } from 'lucide-react';

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Loading...</div>}>
      <UnsubscribeInner />
    </Suspense>
  );
}

function UnsubscribeInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setErrorMessage('Missing unsubscribe token. Please use the unsubscribe link provided in your email.');
      setLoading(false);
      return;
    }

    fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json().then((data) => ({ status: res.status, data })))
      .then(({ status, data }) => {
        if (status === 200 && data.success) {
          setSuccess(true);
          setEmail(data.email || '');
        } else {
          setErrorMessage(data.error || 'Invalid or expired unsubscribe link.');
        }
      })
      .catch(() => {
        setErrorMessage('Unable to process unsubscribe request. Please try again later.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-obsidian text-text-primary flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full rounded-[14px] border border-border-subtle bg-surface-elevated p-8 card-volcanic text-center space-y-6">
        <div className="flex items-center justify-center gap-2.5 pb-2 border-b border-border-subtle">
          <img
            src="/arenova.png"
            alt="ARENOVA"
            width={32}
            height={32}
            className="w-8 h-8 object-contain filter drop-shadow-[0_0_8px_rgba(232,75,44,0.35)]"
          />
          <span className="font-syne font-bold text-lg tracking-[-0.025em] text-text-primary">ARENOVA</span>
        </div>

        {loading ? (
          <div className="space-y-4 py-8">
            <div className="w-8 h-8 border-2 border-[#E84B2C] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-[#9E9B93]">Processing your opt-out request...</p>
          </div>
        ) : success ? (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h1 className="text-xl font-bold text-white tracking-tight">You are unsubscribed</h1>

            <p className="text-xs text-slate-300 leading-relaxed">
              We have permanently added <span className="font-mono text-emerald-300">{email}</span> to our global suppression list. All pending messages and future follow-ups have been cancelled.
            </p>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Compliant with CAN-SPAM, GDPR, and RFC 8058</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8" />
            </div>

            <h1 className="text-xl font-bold text-white tracking-tight">Unable to Unsubscribe</h1>

            <p className="text-xs text-rose-300">{errorMessage}</p>

            <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800">
              If you continue to receive unwanted emails, reply directly with "Unsubscribe" and our agent will automatically suppress your address.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
