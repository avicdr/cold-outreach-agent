'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNavigation } from './NavigationContext';
import {
  LayoutDashboard,
  Users,
  Send,
  Mail,
  MessageSquareQuote,
  Settings,
  Sparkles,
  Zap,
  Inbox,
  Compass,
  Activity,
  X,
} from 'lucide-react';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Inboxes & Groups', href: '/accounts', icon: Inbox },
  { name: 'Lead Discovery', href: '/discovery', icon: Compass },
  { name: 'Leads', href: '/leads', icon: Users },
  { name: 'Campaigns', href: '/campaigns', icon: Send },
  { name: 'Messages', href: '/messages', icon: Mail },
  { name: 'Replies', href: '/replies', icon: MessageSquareQuote },
  { name: 'Job Queue', href: '/jobs', icon: Activity },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isMobileNavOpen, closeMobileNav } = useNavigation();

  const renderNavLinks = (onItemClick?: () => void) => (
    <div className="p-3 space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === '/dashboard'
            ? pathname === '/' || pathname === '/dashboard'
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onItemClick}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
            {item.name}
          </Link>
        );
      })}
    </div>
  );

  const renderFooter = (onItemClick?: () => void) => (
    <div className="p-4 border-t border-slate-800/80 bg-slate-900/30 space-y-2">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="text-xs font-medium text-slate-300">Agent Background Worker</span>
      </div>
      <div className="text-[11px] text-slate-400 flex items-center justify-between">
        <span>Worker: Active</span>
        <Link
          href="/jobs"
          onClick={onItemClick}
          className="text-indigo-400 hover:text-indigo-300 font-mono transition-colors"
        >
          View Queue →
        </Link>
      </div>
      <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500">
        <Link href="/privacy" onClick={onItemClick} className="hover:text-slate-300 transition-colors">
          Privacy Policy
        </Link>
        <span>•</span>
        <Link href="/tos" onClick={onItemClick} className="hover:text-slate-300 transition-colors">
          Terms of Service
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar (Hidden on mobile) */}
      <aside className="hidden lg:flex w-64 border-r border-slate-800 bg-slate-950/80 flex-col justify-between shrink-0 h-screen sticky top-0 select-none z-20">
        <div className="overflow-y-auto">
          {/* Brand Header */}
          <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-800/80">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-slate-100 text-sm tracking-tight flex items-center gap-1.5">
                Antigravity
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono font-bold">
                  AI
                </span>
              </div>
              <div className="text-[11px] text-slate-400">Cold Outreach Agent</div>
            </div>
          </div>

          {/* Navigation Items */}
          {renderNavLinks()}
        </div>

        {/* Footer */}
        {renderFooter()}
      </aside>

      {/* Mobile Drawer Backdrop & Slide-over Navigation */}
      {isMobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Dark backdrop overlay */}
          <div
            onClick={closeMobileNav}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            aria-hidden="true"
          />

          {/* Off-canvas sidebar */}
          <aside
            className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-slate-950 border-r border-slate-800 flex flex-col justify-between shadow-2xl select-none animate-in slide-in-from-left duration-200"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Menu"
          >
            <div className="overflow-y-auto">
              {/* Header with Brand + Close Button */}
              <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 text-sm tracking-tight flex items-center gap-1.5">
                      Antigravity
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono font-bold">
                        AI
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">Cold Outreach Agent</div>
                  </div>
                </div>

                <button
                  onClick={closeMobileNav}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  aria-label="Close navigation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Items */}
              {renderNavLinks(closeMobileNav)}
            </div>

            {/* Footer */}
            {renderFooter(closeMobileNav)}
          </aside>
        </div>
      )}
    </>
  );
}

