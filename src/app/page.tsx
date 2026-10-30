import Link from 'next/link';
import { constructMetadata } from '@/lib/seo/metadata';
import {
  getSoftwareApplicationSchema,
  getWebSiteSchema,
  getOrganizationSchema,
} from '@/lib/seo/schema';
import { JsonLd } from '@/components/seo/JsonLd';
import { PublicHeader } from '@/components/seo/PublicHeader';
import { PublicFooter } from '@/components/seo/PublicFooter';
import { SITE_CONFIG } from '@/lib/seo/config';
import {
  Send,
  Inbox,
  Sparkles,
  ShieldCheck,
  Compass,
  ArrowRight,
  Flame,
  Clock,
  CheckCircle2,
  Lock,
  Layers,
  ArrowUpRight,
  Zap,
} from 'lucide-react';

export const metadata = constructMetadata({
  path: '/',
});

export default function HomePage() {
  const structuredData = [
    getSoftwareApplicationSchema(),
    getWebSiteSchema(),
    getOrganizationSchema(),
  ];

  return (
    <div className="min-h-screen bg-obsidian text-text-primary flex flex-col font-sans selection:bg-[#E84B2C]/20 selection:text-[#E87A38]">
      <JsonLd data={structuredData} />
      <PublicHeader />

      <main className="flex-1 flex flex-col">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28 border-b border-border-subtle">
          {/* Dual Volcanic Ambient Lighting */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `
                radial-gradient(ellipse at 50% 10%, rgba(232, 75, 44, 0.14), transparent 55%),
                radial-gradient(ellipse at 85% 85%, rgba(200, 105, 56, 0.08), transparent 50%)
              `,
            }}
          />

          <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10 text-center space-y-6">
            {/* Ecosystem Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#E84B2C]/10 border border-[#E84B2C]/30 text-[#E87A38] text-xs font-mono font-semibold uppercase tracking-widest shadow-[0_0_15px_rgba(232,75,44,0.12)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E84B2C] shadow-[0_0_8px_#E84B2C]"></span>
              <span>An Arenova Ecosystem Platform</span>
            </div>

            {/* Main H1 Heading */}
            <h1 className="font-syne font-extrabold text-4xl sm:text-5xl lg:text-6xl tracking-tight text-text-primary max-w-4xl mx-auto leading-[1.12]">
              Email Outreach &amp;{' '}
              <span className="text-gradient-ember">Sales Automation</span>{' '}
              Platform
            </h1>

            {/* Subheading / Value Proposition */}
            <p className="text-base sm:text-lg text-text-secondary max-w-2xl mx-auto font-sans leading-relaxed">
              Scale enterprise outbound revenue safely. Outreacher coordinates multi-inbox rotation, AI draft generation with zero hallucinations, automated warmup, and autonomous B2B lead discovery.
            </p>

            {/* CTA Group */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-4">
              <Link
                href="/dashboard"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-[12px] bg-[#E84B2C] text-white font-semibold text-sm shadow-[0_4px_20px_rgba(232,75,44,0.38)] hover:bg-[#D43E20] hover:shadow-[0_6px_28px_rgba(232,75,44,0.52)] hover:-translate-y-0.5 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>Launch Outreach App</span>
                <ArrowRight className="w-4 h-4 ml-0.5" />
              </Link>
              <Link
                href="#capabilities"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-[12px] bg-surface-elevated border border-border-standard text-text-primary font-semibold text-sm hover:bg-surface-hover hover:border-border-hover transition-all"
              >
                <span>Explore Capabilities</span>
              </Link>
            </div>

            {/* Trust & Architecture Guardrails */}
            <div className="pt-10 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto text-left">
              <div className="p-3.5 rounded-[10px] bg-surface-elevated border border-border-subtle space-y-1">
                <div className="flex items-center gap-1.5 text-[#E87A38] text-xs font-mono font-bold">
                  <Clock className="w-3.5 h-3.5 text-[#E84B2C]" />
                  <span>15–18 / day</span>
                </div>
                <div className="text-[11px] text-text-muted leading-tight">
                  Strict inbox safety cap to protect sender reputation
                </div>
              </div>
              <div className="p-3.5 rounded-[10px] bg-surface-elevated border border-border-subtle space-y-1">
                <div className="flex items-center gap-1.5 text-[#63C7A2] text-xs font-mono font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Gmail &amp; SMTP</span>
                </div>
                <div className="text-[11px] text-text-muted leading-tight">
                  Multi-account pool rotation &amp; automated cooldowns
                </div>
              </div>
              <div className="p-3.5 rounded-[10px] bg-surface-elevated border border-border-subtle space-y-1">
                <div className="flex items-center gap-1.5 text-[#D4AF37] text-xs font-mono font-bold">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Dual AI Engine</span>
                </div>
                <div className="text-[11px] text-text-muted leading-tight">
                  Gemini 3.8 Flash with automated OpenAI fallback
                </div>
              </div>
              <div className="p-3.5 rounded-[10px] bg-surface-elevated border border-border-subtle space-y-1">
                <div className="flex items-center gap-1.5 text-text-primary text-xs font-mono font-bold">
                  <Lock className="w-3.5 h-3.5 text-[#E87A38]" />
                  <span>RFC 8058</span>
                </div>
                <div className="text-[11px] text-text-muted leading-tight">
                  Cryptographic 1-click unsubscribe compliance
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Capabilities Grid */}
        <section id="capabilities" className="py-20 sm:py-28 px-4 sm:px-6 max-w-6xl mx-auto w-full space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-secondary border border-border-subtle text-text-muted text-xs font-mono uppercase tracking-wider">
              Technical Architecture
            </div>
            <h2 className="font-syne font-bold text-3xl sm:text-4xl text-text-primary tracking-tight">
              Engineered for Deliverability, Accuracy, and Speed
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              Every outreach module is built to prevent spam traps, preserve threading continuity, and automate prospecting without manual overhead.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card 1: Multi-Inbox Rotation */}
            <article className="p-6 rounded-[14px] bg-surface-elevated border border-border-subtle card-volcanic hover:border-border-hover transition-all space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="p-2.5 rounded-[10px] bg-[#E84B2C]/10 w-fit text-[#E84B2C]">
                  <Inbox className="w-5 h-5" />
                </div>
                <h3 className="font-syne font-bold text-lg text-text-primary">
                  Multi-Inbox Account Rotation
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Connect multiple Google Workspace, Gmail, and custom SMTP inboxes. Outreacher cycles sending evenly, honors minimum 15-minute staggered cooldowns, and caps daily dispatch per inbox to keep spam scores near zero.
                </p>
              </div>
              <Link
                href="/features/email-outreach-automation"
                className="text-xs font-mono text-[#E87A38] hover:text-[#E84B2C] inline-flex items-center gap-1 font-semibold pt-2"
              >
                <span>Read deliverability specs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </article>

            {/* Card 2: AI Draft Generation */}
            <article className="p-6 rounded-[14px] bg-surface-elevated border border-border-subtle card-volcanic hover:border-border-hover transition-all space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="p-2.5 rounded-[10px] bg-[#E87A38]/10 w-fit text-[#E87A38]">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="font-syne font-bold text-lg text-text-primary">
                  Dual-Engine AI Personalization
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Drafts are written by Google Gemini with instant fallback to OpenAI (GPT-4o-mini). The engine verifies that every opening claim references real extracted company data, rejecting fake familiarity or fabricated news.
                </p>
              </div>
              <Link
                href="/features/email-outreach-automation#personalization"
                className="text-xs font-mono text-[#E87A38] hover:text-[#E84B2C] inline-flex items-center gap-1 font-semibold pt-2"
              >
                <span>View AI generation engine</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </article>

            {/* Card 3: Follow-Up Threading */}
            <article className="p-6 rounded-[14px] bg-surface-elevated border border-border-subtle card-volcanic hover:border-border-hover transition-all space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="p-2.5 rounded-[10px] bg-[#63C7A2]/10 w-fit text-[#63C7A2]">
                  <Send className="w-5 h-5" />
                </div>
                <h3 className="font-syne font-bold text-lg text-text-primary">
                  Sequencing &amp; Same-Inbox Threading
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Follow-ups are strictly bound to the exact inbox that initiated step 0. RFC-compliant <code className="text-[#E87A38] font-mono">In-Reply-To</code> and <code className="text-[#E87A38] font-mono">References</code> headers keep the conversation in a single thread, and stop automatically upon reply.
                </p>
              </div>
              <Link
                href="/features/email-outreach-automation#threading"
                className="text-xs font-mono text-[#E87A38] hover:text-[#E84B2C] inline-flex items-center gap-1 font-semibold pt-2"
              >
                <span>Explore sequencing logic</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </article>

            {/* Card 4: Autonomous Lead Discovery */}
            <article className="p-6 rounded-[14px] bg-surface-elevated border border-border-subtle card-volcanic hover:border-border-hover transition-all space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="p-2.5 rounded-[10px] bg-[#D4AF37]/10 w-fit text-[#D4AF37]">
                  <Compass className="w-5 h-5" />
                </div>
                <h3 className="font-syne font-bold text-lg text-text-primary">
                  B2B Lead Discovery &amp; Qualification
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Search prospect niches across Google Places and OpenStreetMap Overpass. The platform verifies phone numbers, scrapes booking setups, and assigns an automated 0–100 qualification score before enrollment.
                </p>
              </div>
              <Link
                href="/features/lead-discovery"
                className="text-xs font-mono text-[#E87A38] hover:text-[#E84B2C] inline-flex items-center gap-1 font-semibold pt-2"
              >
                <span>Inspect lead intelligence</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </article>

            {/* Card 5: Warmup System */}
            <article className="p-6 rounded-[14px] bg-surface-elevated border border-border-subtle card-volcanic hover:border-border-hover transition-all space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="p-2.5 rounded-[10px] bg-[#E84B2C]/10 w-fit text-[#E84B2C]">
                  <Flame className="w-5 h-5" />
                </div>
                <h3 className="font-syne font-bold text-lg text-text-primary">
                  Inbox Warmup Engine
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Ramp new domain inboxes with controlled peer exchanges and target reply rates (70%+). Daily increments automatically advance day-by-day until inboxes reach full capacity without triggering ISP spam flags.
                </p>
              </div>
              <Link
                href="/features/email-outreach-automation#warmup"
                className="text-xs font-mono text-[#E87A38] hover:text-[#E84B2C] inline-flex items-center gap-1 font-semibold pt-2"
              >
                <span>Read warmup protocols</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </article>

            {/* Card 6: Anti-Spam & Unsubscribe Compliance */}
            <article className="p-6 rounded-[14px] bg-surface-elevated border border-border-subtle card-volcanic hover:border-border-hover transition-all space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="p-2.5 rounded-[10px] bg-[#63C7A2]/10 w-fit text-[#63C7A2]">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="font-syne font-bold text-lg text-text-primary">
                  Anti-Spam &amp; Compliance Guard
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Every outbound email includes HMAC-signed unsubscribe tokens that add recipients to a global suppression table on first click. Automated filters detect and purge mailer-daemon/delivery failures from reply logs.
                </p>
              </div>
              <Link
                href="/privacy"
                className="text-xs font-mono text-[#E87A38] hover:text-[#E84B2C] inline-flex items-center gap-1 font-semibold pt-2"
              >
                <span>Review compliance terms</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </article>
          </div>
        </section>

        {/* Arenova Ecosystem Integration Section */}
        <section className="py-16 sm:py-24 border-t border-border-subtle bg-surface-elevated">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E84B2C]/10 border border-[#E84B2C]/25 text-[#E87A38] text-xs font-mono uppercase tracking-wider font-semibold">
              Parent Brand Architecture
            </div>

            <h2 className="font-syne font-bold text-3xl sm:text-4xl text-text-primary tracking-tight">
              Part of the Arenova AI Ecosystem
            </h2>

            <p className="text-sm sm:text-base text-text-secondary max-w-2xl mx-auto leading-relaxed">
              Outreacher is engineered and maintained by{' '}
              <a
                href={SITE_CONFIG.parentBrand.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#E87A38] hover:text-[#E84B2C] underline decoration-[#E87A38]/40 underline-offset-4 font-semibold"
              >
                Arenova
              </a>
              , an AI automation and digital growth agency. Outreacher serves as the outbound email execution pillar alongside our client acquisition and operations suite.
            </p>

            <div className="pt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
              <a
                href={SITE_CONFIG.parentBrand.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-5 rounded-[12px] bg-obsidian border border-border-standard hover:border-[#E84B2C]/40 transition-colors group block space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-syne font-bold text-text-primary text-sm">Arenova Agency</span>
                  <ArrowUpRight className="w-4 h-4 text-text-muted group-hover:text-[#E87A38]" />
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  Full-stack AI automation, custom agents, workflow integrations, and growth infrastructure.
                </p>
              </a>

              <a
                href="https://frontdesk.arenova.in"
                target="_blank"
                rel="noopener noreferrer"
                className="p-5 rounded-[12px] bg-obsidian border border-border-standard hover:border-[#E84B2C]/40 transition-colors group block space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-syne font-bold text-text-primary text-sm">Arenova Frontdesk</span>
                  <ArrowUpRight className="w-4 h-4 text-text-muted group-hover:text-[#E87A38]" />
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  AI-powered WhatsApp receptionist and 24/7 appointment booking automation for clinics.
                </p>
              </a>

              <a
                href="https://arova.arenova.in"
                target="_blank"
                rel="noopener noreferrer"
                className="p-5 rounded-[12px] bg-obsidian border border-border-standard hover:border-[#E84B2C]/40 transition-colors group block space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-syne font-bold text-text-primary text-sm">Arova Intelligence</span>
                  <ArrowUpRight className="w-4 h-4 text-text-muted group-hover:text-[#E87A38]" />
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  B2B lead intelligence, verified prospect discovery, and buyer signal enrichment.
                </p>
              </a>
            </div>
          </div>
        </section>

        {/* Bottom CTA Banner */}
        <section className="py-16 sm:py-20 px-4 sm:px-6 bg-obsidian relative overflow-hidden border-t border-border-subtle">
          <div className="max-w-4xl mx-auto rounded-[16px] p-8 sm:p-12 text-center bg-surface-elevated border border-border-standard card-volcanic space-y-6 relative z-10 shadow-[0_10px_35px_rgba(0,0,0,0.5)]">
            <h2 className="font-syne font-extrabold text-2xl sm:text-3xl text-text-primary tracking-tight">
              Ready to Accelerate Your Outbound Pipeline?
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary max-w-xl mx-auto leading-relaxed">
              Launch Outreacher to connect your inboxes, import qualified prospects, and dispatch hyper-personalized outreach campaigns backed by multi-inbox rotation.
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-[12px] bg-[#E84B2C] text-white font-semibold text-sm shadow-[0_4px_20px_rgba(232,75,44,0.38)] hover:bg-[#D43E20] hover:shadow-[0_6px_28px_rgba(232,75,44,0.52)] transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>Open Outreacher Dashboard</span>
                <ArrowRight className="w-4 h-4 ml-0.5" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
