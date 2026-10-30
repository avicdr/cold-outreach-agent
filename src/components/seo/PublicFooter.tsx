import Link from 'next/link';
import { SITE_CONFIG } from '@/lib/seo/config';
import { ArrowUpRight, ShieldCheck, Mail, Globe, Flame } from 'lucide-react';

export function PublicFooter() {
  const currentYear = 2026;

  return (
    <footer className="border-t border-border-subtle bg-surface-elevated text-text-secondary text-xs font-sans mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Column 1: Brand Info */}
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2">
              <img
                src="/arenova.png"
                alt="Outreacher by Arenova logo"
                width={28}
                height={28}
                className="w-7 h-7 object-contain"
              />
              <span className="font-syne font-bold text-base text-text-primary">
                {SITE_CONFIG.name}
              </span>
            </div>
            <p className="text-text-muted text-[11px] leading-relaxed">
              {SITE_CONFIG.tagline}. High-velocity enterprise cold email automation, multi-inbox rotation, and lead discovery by Arenova.
            </p>
            <div className="pt-1 flex items-center gap-1.5 text-[11px] text-[#E87A38]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Google API Data Policy Compliant</span>
            </div>
          </div>

          {/* Column 2: Solutions & Capabilities */}
          <div className="space-y-2">
            <h4 className="font-mono text-[11px] uppercase tracking-wider text-text-primary font-semibold">
              Capabilities
            </h4>
            <ul className="space-y-1.5 text-text-muted">
              <li>
                <Link
                  href="/features/email-outreach-automation"
                  className="hover:text-text-primary transition-colors"
                >
                  Multi-Inbox Email Automation
                </Link>
              </li>
              <li>
                <Link
                  href="/features/email-outreach-automation#warmup"
                  className="hover:text-text-primary transition-colors"
                >
                  Automated Inbox Warmup
                </Link>
              </li>
              <li>
                <Link
                  href="/features/lead-discovery"
                  className="hover:text-text-primary transition-colors"
                >
                  Autonomous Lead Discovery
                </Link>
              </li>
              <li>
                <Link
                  href="/features/lead-discovery#scoring"
                  className="hover:text-text-primary transition-colors"
                >
                  Lead Qualification Scoring
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Arenova Ecosystem */}
          <div className="space-y-2">
            <h4 className="font-mono text-[11px] uppercase tracking-wider text-text-primary font-semibold">
              Arenova Ecosystem
            </h4>
            <ul className="space-y-1.5 text-text-muted">
              <li>
                <a
                  href={SITE_CONFIG.parentBrand.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#E87A38] transition-colors inline-flex items-center gap-1"
                >
                  <span>Arenova Agency</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://frontdesk.arenova.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#E87A38] transition-colors inline-flex items-center gap-1"
                >
                  <span>Arenova Frontdesk</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://arova.arenova.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#E87A38] transition-colors inline-flex items-center gap-1"
                >
                  <span>Arova Lead Intelligence</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
              <li>
                <Link
                  href="/llms.txt"
                  className="hover:text-text-primary transition-colors"
                >
                  AI Discovery (llms.txt)
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Legal & App */}
          <div className="space-y-2">
            <h4 className="font-mono text-[11px] uppercase tracking-wider text-text-primary font-semibold">
              Trust & Security
            </h4>
            <ul className="space-y-1.5 text-text-muted">
              <li>
                <Link
                  href="/privacy"
                  className="hover:text-text-primary transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/tos"
                  className="hover:text-text-primary transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="hover:text-text-primary transition-colors"
                >
                  Admin Gateway
                </Link>
              </li>
              <li>
                <a
                  href={`mailto:${SITE_CONFIG.supportEmail}`}
                  className="hover:text-text-primary transition-colors inline-flex items-center gap-1"
                >
                  <Mail className="w-3 h-3" />
                  <span>{SITE_CONFIG.supportEmail}</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-text-muted">
          <div>
            © {currentYear} {SITE_CONFIG.parentBrand.name}. All rights reserved. Outreacher is a registered software product of Arenova.
          </div>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-text-secondary">Privacy</Link>
            <span>•</span>
            <Link href="/tos" className="hover:text-text-secondary">Terms</Link>
            <span>•</span>
            <Link href="/sitemap.xml" className="hover:text-text-secondary">Sitemap</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default PublicFooter;

