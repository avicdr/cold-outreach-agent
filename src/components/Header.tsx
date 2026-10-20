'use client';

import { useState, useEffect } from 'react';
import { Play, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function Header({ title, subtitle, children }: HeaderProps) {
  const [isRunningWorker, setIsRunningWorker] = useState(false);
  const [workerMessage, setWorkerMessage] = useState<string | null>(null);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email?: string } | null>(null);

  useEffect(() => {
    fetch('/api/integrations/google/status')
      .then((res) => res.json())
      .then((data) => setGmailStatus(data))
      .catch(() => setGmailStatus({ connected: false }));
  }, []);

  const handleTriggerWorker = async () => {
    setIsRunningWorker(true);
    setWorkerMessage(null);
    try {
      const res = await fetch('/api/jobs/process', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setWorkerMessage(`Processed ${data.processed || 0} job(s)`);
      } else {
        setWorkerMessage(`Worker failed: ${data.error || 'Unknown error'}`);
      }
    } catch {
      setWorkerMessage('Failed to trigger worker');
    } finally {
      setIsRunningWorker(false);
      setTimeout(() => setWorkerMessage(null), 4000);
    }
  };

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-950/40 px-8 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
      <div>
        <h1 className="text-lg font-semibold text-white tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {children}

        {/* Gmail Status Pill */}
        {gmailStatus && (
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              gmailStatus.connected
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}
          >
            {gmailStatus.connected ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{gmailStatus.email || 'Gmail Connected'}</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Gmail Disconnected</span>
              </>
            )}
          </div>
        )}

        {/* Manual Process Queue Button */}
        <button
          onClick={handleTriggerWorker}
          disabled={isRunningWorker}
          title="Run background job worker"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRunningWorker ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
          <span>{isRunningWorker ? 'Processing...' : 'Run Worker'}</span>
        </button>

        {workerMessage && (
          <div className="text-xs text-indigo-300 bg-indigo-950/60 border border-indigo-800/60 px-2.5 py-1 rounded animate-fade-in">
            {workerMessage}
          </div>
        )}
      </div>
    </header>
  );
}
