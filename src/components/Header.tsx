'use client';

import { useState, useEffect } from 'react';
import { Play, CheckCircle2, AlertCircle, RefreshCw, Menu } from 'lucide-react';
import { useNavigation } from './NavigationContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function Header({ title, subtitle, children }: HeaderProps) {
  const { toggleMobileNav } = useNavigation();
  const [isRunningWorker, setIsRunningWorker] = useState(false);
  const [workerMessage, setWorkerMessage] = useState<string | null>(null);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email?: string } | null>(null);

  useEffect(() => {
    fetch('/api/integrations/google/status')
      .then((res) => res.json())
      .then((data) => setGmailStatus(data))
      .catch(() => setGmailStatus({ connected: false }));
  }, []);

  // Automatic background worker runner: triggers queue processor every 60s while app is open
  useEffect(() => {
    const runWorkerSilently = async () => {
      try {
        await fetch('/api/jobs/process', { method: 'POST' });
      } catch {
        // Silent catch for background heartbeat
      }
    };

    const initialTimer = setTimeout(runWorkerSilently, 4000);
    const interval = setInterval(runWorkerSilently, 60000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
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
    <header className="min-h-16 py-2.5 border-b border-slate-800 bg-slate-950/40 px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md gap-3">
      {/* Title & Mobile Nav Toggle */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={toggleMobileNav}
          aria-label="Open mobile navigation menu"
          className="p-1.5 -ml-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden transition-colors shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>

      {/* Action Buttons & Status Indicators */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap justify-end">
        {children}

        {/* Gmail Status Pill */}
        {gmailStatus && (
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              gmailStatus.connected
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}
          >
            {gmailStatus.connected ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="max-w-[130px] truncate">{gmailStatus.email || 'Gmail Connected'}</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Gmail Disconnected</span>
              </>
            )}
          </div>
        )}

        {/* Auto Worker Status Pill */}
        <div
          title="Background worker automatically checks queue every 60s"
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Auto-Worker: Active</span>
        </div>

        {/* Manual Process Queue Button */}
        <button
          onClick={handleTriggerWorker}
          disabled={isRunningWorker}
          title="Run background job worker"
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRunningWorker ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
          <span className="hidden sm:inline">{isRunningWorker ? 'Processing...' : 'Run Worker'}</span>
        </button>

        {workerMessage && (
          <div className="text-xs text-indigo-300 bg-indigo-950/60 border border-indigo-800/60 px-2 py-1 rounded animate-fade-in text-[11px]">
            {workerMessage}
          </div>
        )}
      </div>
    </header>
  );
}
