'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, Menu, Sun, Moon, Flame } from 'lucide-react';
import { useNavigation } from './NavigationContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
  category?: string;
  children?: React.ReactNode;
}

export function Header({ title, subtitle, category, children }: HeaderProps) {
  const { toggleMobileNav, theme, toggleTheme } = useNavigation();
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
    <header className="min-h-16 py-3 border-b border-border-subtle bg-charcoal/90 px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md gap-3 select-none">
      {/* Title & Mobile Nav Toggle */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 shrink">
        <button
          type="button"
          onClick={toggleMobileNav}
          aria-label="Open mobile navigation menu"
          className="p-1.5 -ml-1 rounded-[8px] text-text-muted hover:text-text-primary hover:bg-surface-hover lg:hidden transition-colors shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          {category && (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#E84B2C]/10 border border-[#E84B2C]/25 text-[#E87A38] text-[9px] font-mono uppercase tracking-widest font-semibold mb-1">
              <span className="w-1 h-1 rounded-full bg-[#E84B2C] shadow-[0_0_6px_#E84B2C]"></span>
              {category}
            </div>
          )}
          <h1 className="text-base sm:text-lg font-bold font-syne text-text-primary tracking-[-0.025em] truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="hidden md:block text-[11px] sm:text-xs text-text-muted mt-0.5 truncate max-w-xs lg:max-w-md xl:max-w-xl font-sans">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Action Buttons & Status Indicators */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 justify-end">
        {children}

        {/* Gmail Status Pill */}
        {gmailStatus && (
          <div
            title={gmailStatus.connected ? `Google Inbox: ${gmailStatus.email || ''}` : 'No Google Inbox Connected'}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-mono font-medium border shrink-0 whitespace-nowrap ${
              gmailStatus.connected
                ? 'bg-[#63C7A2]/10 border-[#63C7A2]/30 text-[#63C7A2]'
                : 'bg-[#E87A38]/10 border-[#E87A38]/30 text-[#E87A38]'
            }`}
          >
            {gmailStatus.connected ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="max-w-[100px] xl:max-w-[140px] truncate">{gmailStatus.email || 'OAuth Active'}</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xl:inline">Gmail </span>Offline
              </>
            )}
          </div>
        )}

        {/* Auto Worker Status Pill */}
        <div
          title="Background worker running autonomous dispatch loop"
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-mono font-medium bg-[#63C7A2]/10 border border-[#63C7A2]/30 text-[#63C7A2] shrink-0 whitespace-nowrap"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#63C7A2] animate-pulse shrink-0 shadow-[0_0_8px_#63C7A2]" />
          <span>Worker: Active</span>
        </div>

        {/* Manual Process Queue Button */}
        <button
          onClick={handleTriggerWorker}
          disabled={isRunningWorker}
          title="Trigger background worker execution"
          className="btn-secondary px-2.5 sm:px-3 py-1.5 text-xs shrink-0 whitespace-nowrap gap-1.5"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 shrink-0 ${
              isRunningWorker ? 'animate-spin text-[#E84B2C]' : 'text-text-muted'
            }`}
          />
          <span className="hidden sm:inline">{isRunningWorker ? 'Dispatching...' : 'Run Worker'}</span>
        </button>

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Warm Ivory Light' : 'Obsidian Dark'} mode`}
          className="p-2 rounded-[10px] bg-surface-elevated border border-border-standard text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-[#E87A38]" />
          ) : (
            <Moon className="w-4 h-4 text-[#D4AF37]" />
          )}
        </button>

        {workerMessage && (
          <div className="text-xs text-[#E87A38] bg-[#E84B2C]/10 border border-[#E84B2C]/30 px-2.5 py-1 rounded-[8px] animate-fade-in text-[11px] shrink-0 whitespace-nowrap shadow-sm font-mono">
            {workerMessage}
          </div>
        )}
      </div>
    </header>
  );
}
