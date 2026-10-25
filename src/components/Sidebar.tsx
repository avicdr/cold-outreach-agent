'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useNavigation } from './NavigationContext';
import {
  LayoutDashboard,
  Users,
  Send,
  Mail,
  MessageSquareQuote,
  Settings,
  Inbox,
  Compass,
  Activity,
  X,
  LogOut,
  Sun,
  Moon,
  ShieldCheck,
  Flame,
} from 'lucide-react';
import { useState, useEffect } from 'react';

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
  const router = useRouter();
  const { isMobileNavOpen, closeMobileNav, theme, toggleTheme } = useNavigation();
  const [adminEmail, setAdminEmail] = useState<string>('avi@arenova.in');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.email) {
          setAdminEmail(data.user.email);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Proceed to login anyway
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

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
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] text-xs font-medium transition-all duration-200 group relative ${
              isActive
                ? 'bg-[#E84B2C] text-white shadow-[0_2px_12px_rgba(232,75,44,0.35)]'
                : 'text-[#D0CBC1] hover:text-[#F3F0E8] hover:bg-[#26201B]'
            }`}
          >
            <Icon
              className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                isActive ? 'text-white' : 'text-[#9E9B93] group-hover:text-[#E87A38]'
              }`}
            />
            <span className="font-sans font-medium tracking-wide">{item.name}</span>
            {isActive && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_#ffffff]" />
            )}
          </Link>
        );
      })}
    </div>
  );

  const renderFooter = (onItemClick?: () => void) => (
    <div className="p-3 border-t border-[rgba(243,240,232,0.08)] bg-[#0D0D0C] space-y-3">
      {/* Background Worker Status Pill */}
      <div className="p-2.5 rounded-[10px] bg-[#171614] border border-[rgba(243,240,232,0.06)] space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#63C7A2] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#63C7A2]"></span>
            </span>
            <span className="text-[11px] font-semibold text-[#F3F0E8] tracking-tight">Autonomous Worker</span>
          </div>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono bg-[#63C7A2]/10 text-[#63C7A2] border border-[#63C7A2]/30">
            Active
          </span>
        </div>
        <div className="text-[10px] text-[#9E9B93] flex items-center justify-between pt-0.5">
          <span>60s dispatch loop</span>
          <Link
            href="/jobs"
            onClick={onItemClick}
            className="text-[#E87A38] hover:text-[#E84B2C] font-mono transition-colors"
          >
            Queue →
          </Link>
        </div>
      </div>

      {/* Admin Profile & Theme Switch Card */}
      <div className="p-2.5 rounded-[10px] bg-[#171614] border border-[rgba(243,240,232,0.08)] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[#E84B2C]/15 border border-[#E84B2C]/30 flex items-center justify-center shrink-0">
              <Flame className="w-3.5 h-3.5 text-[#E87A38]" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-[#F3F0E8] truncate max-w-[120px]" title={adminEmail}>
                {adminEmail}
              </div>
              <div className="text-[9px] text-[#9E9B93] uppercase font-mono tracking-wider">
                Admin Owner
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'Warm Ivory Light' : 'Obsidian Dark'} mode`}
              className="p-1.5 rounded-[6px] text-[#D0CBC1] hover:text-[#F3F0E8] hover:bg-[#26201B] border border-transparent hover:border-[rgba(243,240,232,0.12)] transition-colors"
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-[#E87A38]" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-[#D4AF37]" />
              )}
            </button>

            {/* Logout Button */}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              title="Sign Out"
              className="p-1.5 rounded-[6px] text-[#9E9B93] hover:text-[#E84B2C] hover:bg-[#26201B] transition-colors disabled:opacity-50"
              aria-label="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer Links */}
      <div className="pt-1 flex items-center justify-between text-[10px] text-[#9E9B93]">
        <Link href="/privacy" onClick={onItemClick} className="hover:text-[#F3F0E8] transition-colors">
          Privacy
        </Link>
        <span>•</span>
        <Link href="/tos" onClick={onItemClick} className="hover:text-[#F3F0E8] transition-colors">
          Terms
        </Link>
        <span>•</span>
        <span className="font-mono text-[#9E9B93]">v2.5</span>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:flex w-64 border-r border-[rgba(243,240,232,0.08)] bg-[#0D0D0C] flex-col justify-between shrink-0 h-screen sticky top-0 select-none z-20">
        <div className="overflow-y-auto">
          {/* Brand Header: Clean borderless presentation of arenova.png at full scale sitting flush next to Syne wordmark */}
          <div className="h-16 flex items-center px-5 border-b border-[rgba(243,240,232,0.08)] bg-[#111110]">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <img
                src="/arenova.png"
                alt="ARENOVA"
                width={36}
                height={36}
                className="w-9 h-9 object-contain shrink-0 filter drop-shadow-[0_0_12px_rgba(232,75,44,0.35)] transition-transform group-hover:scale-105"
              />
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-syne font-bold text-lg tracking-[-0.025em] text-[#F3F0E8] leading-none">
                    ARENOVA
                  </span>
                  <span className="text-[9px] px-1 py-0.2 rounded font-mono font-bold uppercase tracking-wider bg-[#E84B2C]/15 text-[#E87A38] border border-[#E84B2C]/30 leading-tight">
                    PRO
                  </span>
                </div>
                <span className="text-[9px] text-[#9E9B93] tracking-widest uppercase font-cinzel mt-0.5">
                  Cold Outreach Agent
                </span>
              </div>
            </Link>
          </div>

          {/* Category Micro-Badge */}
          <div className="px-4 pt-3.5 pb-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#E84B2C]/10 border border-[#E84B2C]/30 text-[#E87A38] text-[9px] font-mono uppercase tracking-widest font-semibold w-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E84B2C] shadow-[0_0_8px_#E84B2C]"></span>
              <span>Enterprise Control</span>
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
          <div
            onClick={closeMobileNav}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            aria-hidden="true"
          />

          <aside
            className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-[#0D0D0C] border-r border-[rgba(243,240,232,0.08)] flex flex-col justify-between shadow-2xl select-none animate-in slide-in-from-left duration-200"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Menu"
          >
            <div className="overflow-y-auto">
              {/* Header with Brand + Close Button */}
              <div className="h-16 flex items-center justify-between px-5 border-b border-[rgba(243,240,232,0.08)] bg-[#111110]">
                <div className="flex items-center gap-3">
                  <img
                    src="/arenova.png"
                    alt="ARENOVA"
                    width={34}
                    height={34}
                    className="w-8 h-8 object-contain shrink-0 filter drop-shadow-[0_0_10px_rgba(232,75,44,0.35)]"
                  />
                  <div className="flex flex-col">
                    <span className="font-syne font-bold text-base tracking-[-0.025em] text-[#F3F0E8] leading-none">
                      ARENOVA
                    </span>
                    <span className="text-[9px] text-[#9E9B93] tracking-wider uppercase font-cinzel mt-0.5">
                      Cold Outreach Agent
                    </span>
                  </div>
                </div>

                <button
                  onClick={closeMobileNav}
                  className="p-1.5 rounded-[8px] text-[#9E9B93] hover:text-[#F3F0E8] hover:bg-[#26201B] transition-colors"
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
