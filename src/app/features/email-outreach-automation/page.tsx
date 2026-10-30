import Link from 'next/link';
import { constructMetadata } from '@/lib/seo/metadata';
import {
  getSoftwareApplicationSchema,
  getBreadcrumbListSchema,
  getWebPageSchema,
} from '@/lib/seo/schema';
import { JsonLd } from '@/components/seo/JsonLd';
import { PublicHeader } from '@/components/seo/PublicHeader';
import { PublicFooter } from '@/components/seo/PublicFooter';
import { SITE_CONFIG } from '@/lib/seo/config';
import {
  Send,
  Inbox,
  Flame,
  ShieldCheck,
  Clock,
  Sparkles,
  ArrowRight,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Mail,
  Zap,
} from 'lucide-react';

export const metadata = constructMetadata({
  title: 'Cold Email Outreach & Multi-Inbox Deliverability Automation',
  description:
    'Automate outbound cold email campaigns with multi-inbox rotation, Gmail OAuth & SMTP integration, strict daily sending limits, automated warmup ramps, and AI-powered follow-up threading.',
  path: '/features/email-outreach-automation',
  keywords: [
    'cold email outreach software',
    'multi inbox email rotation',
    'email deliverability warmup',
    'automated email followups',
    'Gmail SMTP outreach automation',
    'cold email sequencing platform',
    'Arenova Outreacher',
  ],
});

export default function EmailOutreachAutomationPage() {
  const breadcrumbs = [
    { name: 'Home', item: '/' },
    { name: 'Features', item: '/#capabilities' },
    { name: 'Email Outreach Automation', item: '/features/email-outreach-automation' },
  ];

  const structuredData = [
    getSoftwareApplicationSchema(),
    getBreadcrumbListSchema(breadcrumbs),
    getWebPageSchema({
      title: 'Cold Email Outreach & Multi-Inbox Deliverability Automation',
      description:
        'Automate outbound cold email campaigns with multi-inbox rotation, Gmail OAuth & SMTP integration, strict daily sending limits, automated warmup ramps, and AI-powered follow-up threading.',
      path: '/features/email-outreach-automation',
    }),
  ];

  return (
    <div className="min-h-screen bg-obsidian text-text-primary flex flex-col font-sans selection:bg-[#E84B2C]/20 selection:text-[#E87A38]">
      <JsonLd data={structuredData} />
      <PublicHeader />

      <main className="flex-1 flex flex-col">
        {/* Breadcrumb Header */}
        <section className="border-b border-border-subtle bg-surface-elevated/40 py-3.5 px-4 sm:px-6">
          <nav className="max-w-5xl mx-auto flex items-center gap-2 text-xs font-mono text-text-muted" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-text-primary transition-colors">Home</Link>
            <span>/</span>
            <Link href="/#capabilities" className="hover:text-text-primary transition-colors">Features</Link>
            <span>/</span>
            <span className="text-[#E87A38] font-semibold truncate">Email Outreach Automation</span>
          </nav>
        </section>

        {/* Feature Hero */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 relative overflow-hidden border-b border-border-subtle">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `
                radial-gradient(ellipse at 50% 15%, rgba(232, 75, 44, 0.12), transparent 50%),
                radial-gradient(ellipse at 85% 85%, rgba(200, 105, 56, 0.08), transparent 45%)
              `,
            }}
          />

          <div className="max-w-4xl mx-auto relative z-10 text-center space-y-5">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#E84B2C]/10 border border-[#E84B2C]/30 text-[#E87A38] text-xs font-mono font-semibold uppercase tracking-wider">
              <Send className="w-3.5 h-3.5 text-[#E84B2C]" />
              <span>Deliverability &amp; Sequencing Engine</span>
            </div>

            <h1 className="font-syne font-extrabold text-3xl sm:text-5xl text-text-primary tracking-tight leading-tight">
              Cold Email Outreach &amp;{' '}
              <span className="text-gradient-ember">Multi-Inbox Deliverability</span>
            </h1>

            <p className="text-sm sm:text-base text-text-secondary max-w-2xl mx-auto leading-relaxed">
              Traditional outreach tools burn domains by blasting hundreds of emails from single mailboxes. Outreacher distributes sending across accounts, enforces randomized intervals, and guarantees inbox continuity.
            </p>

            <div className="pt-4 flex items-center justify-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-[12px] bg-[#E84B2C] text-white font-semibold text-xs shadow-[0_4px_16px_rgba(232,75,44,0.35)] hover:bg-[#D43E20] transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Launch Outreach Campaigns</span>
                <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* Feature Deep Dive 1: Multi-Inbox Rotation */}
        <section className="py-16 sm:py-20 px-4 sm:px-6 max-w-5xl mx-auto w-full space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#E87A38] font-semibold">
                <Inbox className="w-4 h-4 text-[#E84B2C]" />
                <span>Multi-Account Pool Rotation</span>
              </div>
              <h2 className="font-syne font-bold text-2xl sm:text-3xl text-text-primary tracking-tight">
                Never Exceed 18 Emails Per Day Per Account
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                Google Workspace and custom SMTP servers trigger spam filters when accounts send high volumes in bursts. Outreacher enforces an ironclad daily send cap (15–18 emails/day per connected inbox) with minimum 15-minute staggered cooldowns.
              </p>
              <ul className="space-y-2 text-xs text-text-muted pt-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#63C7A2] shrink-0 mt-0.5" />
                  <span>Connect unlimited Google OAuth accounts and custom SMTP/IMAP credentials.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#63C7A2] shrink-0 mt-0.5" />
                  <span>Staggered sending schedule adapts automatically to recipient timezones.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#63C7A2] shrink-0 mt-0.5" />
                  <span>Automatic cooldown rescheduling if an inbox is in cooldown when a job triggers.</span>
                </li>
              </ul>
            </div>

            <div className="p-6 rounded-[14px] bg-surface-elevated border border-border-standard card-volcanic space-y-4 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <span className="text-[#E87A38] font-bold">Inbox Dispatch Matrix</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#63C7A2]/10 text-[#63C7A2]">ROTATING</span>
              </div>
              <div className="space-y-3">
                <div className="p-3 rounded-[8px] bg-surface-secondary border border-border-subtle flex items-center justify-between">
                  <div>
                    <div className="text-text-primary font-semibold">inbox-1@company.com</div>
                    <div className="text-[10px] text-text-muted">Gmail OAuth • Last sent 14m ago</div>
                  </div>
                  <span className="text-[#63C7A2] font-bold">14 / 18</span>
                </div>
                <div className="p-3 rounded-[8px] bg-surface-secondary border border-border-subtle flex items-center justify-between">
                  <div>
                    <div className="text-text-primary font-semibold">inbox-2@company.com</div>
                    <div className="text-[10px] text-text-muted">SMTP Titan • Last sent 28m ago</div>
                  </div>
                  <span className="text-[#63C7A2] font-bold">12 / 18</span>
                </div>
                <div className="p-3 rounded-[8px] bg-surface-secondary border border-border-subtle flex items-center justify-between">
                  <div>
                    <div className="text-text-primary font-semibold">inbox-3@company.com</div>
                    <div className="text-[10px] text-text-muted">Gmail OAuth • Ready for dispatch</div>
                  </div>
                  <span className="text-[#E87A38] font-bold">08 / 18</span>
                </div>
              </div>
              <p className="text-[10px] text-text-muted pt-1">
                * Outreacher automatically balances queue items across all available inboxes in the assigned group.
              </p>
            </div>
          </div>
        </section>

        {/* Feature Deep Dive 2: Automated Warmup */}
        <section id="warmup" className="py-16 sm:py-20 px-4 sm:px-6 border-t border-border-subtle bg-surface-elevated">
          <div className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="order-2 md:order-1 p-6 rounded-[14px] bg-obsidian border border-border-standard card-volcanic space-y-4">
              <div className="flex items-center gap-2 text-[#E84B2C]">
                <Flame className="w-5 h-5" />
                <span className="font-mono text-xs uppercase font-bold text-text-primary">Simulated Warmup Progression</span>
              </div>
              <div className="space-y-3 font-mono text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-text-muted">
                    <span>Day 1–3: Initial ramp (2–6 emails/day)</span>
                    <span className="text-[#63C7A2]">100% Delivery</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-surface-secondary overflow-hidden">
                    <div className="w-1/4 h-full bg-[#E87A38]" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-text-muted">
                    <span>Day 4–8: Mid ramp (8–14 emails/day)</span>
                    <span className="text-[#63C7A2]">Peer Replies 70%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-surface-secondary overflow-hidden">
                    <div className="w-2/3 h-full bg-[#E87A38]" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-text-muted">
                    <span>Day 9+: Production Ready (15–18 emails/day)</span>
                    <span className="text-[#63C7A2]">Optimal Health</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-surface-secondary overflow-hidden">
                    <div className="w-full h-full bg-[#63C7A2]" />
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Accounts exchange natural contextual email conversations with automated simulated replies, training mailbox algorithms that incoming messages are high-priority.
              </p>
            </div>

            <div className="order-1 md:order-2 space-y-4">
              <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#E84B2C] font-semibold">
                <Flame className="w-4 h-4" />
                <span>Automated Warmup System</span>
              </div>
              <h2 className="font-syne font-bold text-2xl sm:text-3xl text-text-primary tracking-tight">
                Warm Inboxes Gradually to Keep Out of Spam
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                Brand new inboxes that send cold email immediately get blacklisted by Microsoft Defender and Google Spam Filters. Outreacher's built-in warmup engine safely ramps sending volume with peer exchanges and simulated thread replies.
              </p>
              <div className="space-y-2 text-xs text-text-muted pt-2">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#63C7A2]"></span>
                  <span>Configurable warmup daily target (default 15 emails/day)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#63C7A2]"></span>
                  <span>Configurable daily increment (default 2 emails increment/day)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#63C7A2]"></span>
                  <span>Target 70%+ simulated reply rate for maximum deliverability reputation</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Deep Dive 3: Follow-Up Threading */}
        <section id="threading" className="py-16 sm:py-20 px-4 sm:px-6 max-w-5xl mx-auto w-full space-y-8">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="font-syne font-bold text-2xl sm:text-3xl text-text-primary tracking-tight">
              RFC-Compliant Same-Inbox Follow-Up Sequencing
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
              When a prospect receives a follow-up email from a different address, trust is broken. Outreacher strictly binds all sequence steps to the initiating inbox and conversation thread.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <div className="p-5 rounded-[12px] bg-surface-elevated border border-border-subtle card-volcanic space-y-2">
              <div className="font-syne font-bold text-sm text-text-primary">1. Same-Inbox Binding</div>
              <p className="text-xs text-text-muted leading-relaxed">
                Step 1, step 2, and step 3 messages inherit the verified account ID of step 0. Even during multi-account pool rotation, prospects always receive replies from the original sender.
              </p>
            </div>
            <div className="p-5 rounded-[12px] bg-surface-elevated border border-border-subtle card-volcanic space-y-2">
              <div className="font-syne font-bold text-sm text-text-primary">2. Native Header Threading</div>
              <p className="text-xs text-text-muted leading-relaxed">
                Follow-ups pass authentic <code className="text-[#E87A38]">In-Reply-To</code> and <code className="text-[#E87A38]">References</code> message IDs, ensuring email clients group messages cleanly under a single subject line.
              </p>
            </div>
            <div className="p-5 rounded-[12px] bg-surface-elevated border border-border-subtle card-volcanic space-y-2">
              <div className="font-syne font-bold text-sm text-text-primary">3. Instant Reply Cancellation</div>
              <p className="text-xs text-text-muted leading-relaxed">
                As soon as a prospect replies, all subsequent scheduled follow-up jobs are automatically cancelled to prevent awkward or duplicate follow-up emails.
              </p>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-16 px-4 sm:px-6 border-t border-border-subtle bg-surface-elevated text-center">
          <div className="max-w-2xl mx-auto space-y-5">
            <h2 className="font-syne font-bold text-2xl text-text-primary">
              Ready to automate your cold email outreach?
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
              Connect your inboxes and start dispatching personalized, deliverability-protected cold outreach campaigns today.
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-[12px] bg-[#E84B2C] text-white font-semibold text-xs shadow-[0_4px_16px_rgba(232,75,44,0.35)] hover:bg-[#D43E20] transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Open Outreacher Dashboard</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

