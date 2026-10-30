'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SITE_CONFIG } from '@/lib/seo/config';
import { Flame, ArrowUpRight, Menu, X, Sparkles, Send, Compass } from 'lucide-react';

export function PublicHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="border-b border-border-subtle bg-obsidian/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand Lockup */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <img
              src="/arenova.png"
              alt="Outreacher by Arenova logo"
              width={34}
              height={34}
              className="w-8 h-8 object-contain filter drop-shadow-[0_0_12px_rgba(232,75,44,0.35)] group-hover:scale-105 transition-transform"
            />
            <div className="flex items-center gap-2">
              <span className="font-syne font-extrabold text-xl text-text-primary tracking-tight">
                {SITE_CONFIG.name}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E84B2C]/10 text-[#E87A38] font-mono font-bold border border-[#E84B2C]/25 hidden sm:inline-block">
                BY ARENOVA
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6 text-xs text-text-secondary font-medium">
          <Link
            href="/#overview"
            className="hover:text-text-primary transition-colors py-1"
          >
            Overview
          </Link>
          <Link
            href="/features/email-outreach-automation"
            className="hover:text-text-primary transition-colors py-1 flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5 text-[#E84B2C]" />
            <span>Email Automation</span>
          </Link>
          <Link
            href="/features/lead-discovery"
            className="hover:text-text-primary transition-colors py-1 flex items-center gap-1.5"
          >
            <Compass className="w-3.5 h-3.5 text-[#E87A38]" />
            <span>Lead Discovery</span>
          </Link>
          <a
            href={SITE_CONFIG.parentBrand.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text-primary transition-colors py-1 flex items-center gap-1 text-text-muted hover:text-[#E87A38]"
          >
            <span>Arenova Agency</span>
            <ArrowUpRight className="w-3 h-3" />
          </a>
        </nav>

        {/* CTA & Mobile Menu Toggle */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-[10px] bg-[#E84B2C] text-white font-medium text-xs shadow-[0_2px_10px_rgba(232,75,44,0.32)] hover:bg-[#D43E20] transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Launch App</span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg bg-surface-elevated border border-border-standard text-text-muted hover:text-text-primary"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border-standard bg-surface-elevated px-6 py-4 space-y-3 animate-fade-in">
          <Link
            href="/#overview"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm text-text-secondary hover:text-text-primary py-2"
          >
            Overview
          </Link>
          <Link
            href="/features/email-outreach-automation"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm text-text-secondary hover:text-text-primary py-2 flex items-center gap-2"
          >
            <Send className="w-4 h-4 text-[#E84B2C]" />
            <span>Email Outreach & Deliverability</span>
          </Link>
          <Link
            href="/features/lead-discovery"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm text-text-secondary hover:text-text-primary py-2 flex items-center gap-2"
          >
            <Compass className="w-4 h-4 text-[#E87A38]" />
            <span>Lead Discovery & Intelligence</span>
          </Link>
          <a
            href={SITE_CONFIG.parentBrand.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-text-muted hover:text-[#E87A38] py-2 flex items-center justify-between"
          >
            <span>Arenova Parent Agency</span>
            <ArrowUpRight className="w-4 h-4" />
          </a>
          <div className="pt-2 border-t border-border-subtle flex items-center gap-4 text-xs text-text-muted">
            <Link href="/privacy" onClick={() => setMobileMenuOpen(false)}>Privacy Policy</Link>
            <Link href="/tos" onClick={() => setMobileMenuOpen(false)}>Terms of Service</Link>
            <Link href="/login" onClick={() => setMobileMenuOpen(false)}>Sign In</Link>
          </div>
        </div>
      )}
    </header>
  );
}

export default PublicHeader;

