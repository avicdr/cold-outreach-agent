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
  Compass,
  Search,
  Sliders,
  CheckCircle2,
  FileSpreadsheet,
  ArrowRight,
  Sparkles,
  Layers,
  ShieldCheck,
  Zap,
  Gauge,
  PhoneCall,
  Globe,
} from 'lucide-react';

export const metadata = constructMetadata({
  title: 'Autonomous B2B Lead Discovery & Qualification Scoring',
  description:
    'Discover high-intent B2B business leads across local directories, analyze online intake friction, and calculate 0–100 lead qualification scores automatically with Outreacher by Arenova.',
  path: '/features/lead-discovery',
  keywords: [
    'B2B lead discovery software',
    'lead qualification scoring',
    'automated prospect research',
    'local business lead scraper',
    'Google Places lead discovery',
    'OpenStreetMap business finder',
    'Arenova Outreacher',
  ],
});

export default function LeadDiscoveryFeaturePage() {
  const breadcrumbs = [
    { name: 'Home', item: '/' },
    { name: 'Features', item: '/#capabilities' },
    { name: 'Lead Discovery', item: '/features/lead-discovery' },
  ];

  const structuredData = [
    getSoftwareApplicationSchema(),
    getBreadcrumbListSchema(breadcrumbs),
    getWebPageSchema({
      title: 'Autonomous B2B Lead Discovery & Qualification Scoring',
      description:
        'Discover high-intent B2B business leads across local directories, analyze online intake friction, and calculate 0–100 lead qualification scores automatically with Outreacher by Arenova.',
      path: '/features/lead-discovery',
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
            <span className="text-[#E87A38] font-semibold truncate">Lead Discovery &amp; Intelligence</span>
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
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#E87A38]/10 border border-[#E87A38]/30 text-[#E87A38] text-xs font-mono font-semibold uppercase tracking-wider">
              <Compass className="w-3.5 h-3.5" />
              <span>Prospect Intelligence &amp; Discovery</span>
            </div>

            <h1 className="font-syne font-extrabold text-3xl sm:text-5xl text-text-primary tracking-tight leading-tight">
              Autonomous B2B Lead Discovery &amp;{' '}
              <span className="text-gradient-ember">Qualification Scoring</span>
            </h1>

            <p className="text-sm sm:text-base text-text-secondary max-w-2xl mx-auto leading-relaxed">
              Find verified business prospects across geographical regions, inspect their digital booking workflows for operational friction, and score them automatically from 0 to 100 before launching outreach.
            </p>

            <div className="pt-4 flex items-center justify-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-[12px] bg-[#E84B2C] text-white font-semibold text-xs shadow-[0_4px_16px_rgba(232,75,44,0.35)] hover:bg-[#D43E20] transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Start Lead Discovery Job</span>
                <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* Deep Dive 1: Multi-Provider Directory Ingestion */}
        <section className="py-16 sm:py-20 px-4 sm:px-6 max-w-5xl mx-auto w-full space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#E87A38] font-semibold">
                <Search className="w-4 h-4 text-[#E84B2C]" />
                <span>Multi-Source Directory Search</span>
              </div>
              <h2 className="font-syne font-bold text-2xl sm:text-3xl text-text-primary tracking-tight">
                Google Places &amp; OpenStreetMap Discovery
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                Outreacher queries live directories using business niche keywords (e.g. "Dental Clinic", "Med Spa", "SaaS Startup") and target city/metro areas. If Google Places quotas are exceeded, the engine seamlessly falls back to OpenStreetMap Overpass without interrupting the job.
              </p>
              <ul className="space-y-2 text-xs text-text-muted pt-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#63C7A2] shrink-0 mt-0.5" />
                  <span>Extracts verified phone numbers, website domains, and Google review counts.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#63C7A2] shrink-0 mt-0.5" />
                  <span>Deduplicates leads automatically against your existing database to prevent double contact.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#63C7A2] shrink-0 mt-0.5" />
                  <span>Auto-generates Google Maps reference links and business verification evidence.</span>
                </li>
              </ul>
            </div>

            <div className="p-6 rounded-[14px] bg-surface-elevated border border-border-standard card-volcanic space-y-4 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <span className="text-[#E87A38] font-bold">Discovered Business Profile</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#63C7A2]/10 text-[#63C7A2]">ENRICHED</span>
              </div>
              <div className="space-y-2.5 text-text-secondary">
                <div>
                  <span className="text-text-muted">Business:</span> <span className="text-text-primary font-bold">Apex Dental Care</span>
                </div>
                <div>
                  <span className="text-text-muted">Category:</span> Dental Practice • Austin, TX
                </div>
                <div>
                  <span className="text-text-muted">Reviews:</span> 4.9 ★ (148 reviews)
                </div>
                <div>
                  <span className="text-text-muted">Intake Flow:</span> Contact form only (no after-hours scheduling)
                </div>
                <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                  <span className="text-text-muted">Calculated Score:</span>
                  <span className="text-[#E84B2C] font-extrabold text-sm">88 / 100 (HIGH PRIORITY)</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Deep Dive 2: Qualification Scoring Engine */}
        <section id="scoring" className="py-16 sm:py-20 px-4 sm:px-6 border-t border-border-subtle bg-surface-elevated">
          <div className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="order-2 md:order-1 p-6 rounded-[14px] bg-obsidian border border-border-standard card-volcanic space-y-4 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <span className="text-[#E84B2C] font-bold">Qualification Friction Matrix</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#E84B2C]/10 text-[#E87A38]">OBSERVED GAPS</span>
              </div>
              <div className="space-y-3">
                <div className="p-3 rounded-[8px] bg-surface-secondary border border-border-subtle space-y-1">
                  <div className="text-text-primary font-semibold flex items-center justify-between">
                    <span>After-Hours Intake Gap</span>
                    <span className="text-[#E84B2C]">+30 pts</span>
                  </div>
                  <p className="text-[10px] text-text-muted">Prospect directs weekend traffic to static contact forms without 24/7 capture.</p>
                </div>
                <div className="p-3 rounded-[8px] bg-surface-secondary border border-border-subtle space-y-1">
                  <div className="text-text-primary font-semibold flex items-center justify-between">
                    <span>High Google Review Footfall</span>
                    <span className="text-[#E87A38]">+25 pts</span>
                  </div>
                  <p className="text-[10px] text-text-muted">Over 50+ 5-star Google reviews indicating high demand and active customer flow.</p>
                </div>
                <div className="p-3 rounded-[8px] bg-surface-secondary border border-border-subtle space-y-1">
                  <div className="text-text-primary font-semibold flex items-center justify-between">
                    <span>Verified Contact Point</span>
                    <span className="text-[#63C7A2]">+20 pts</span>
                  </div>
                  <p className="text-[10px] text-text-muted">Direct founder email or primary business inbox identified and syntax verified.</p>
                </div>
              </div>
            </div>

            <div className="order-1 md:order-2 space-y-4">
              <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#E84B2C] font-semibold">
                <Gauge className="w-4 h-4" />
                <span>Intelligent Lead Scoring</span>
              </div>
              <h2 className="font-syne font-bold text-2xl sm:text-3xl text-text-primary tracking-tight">
                Prioritize Prospects With Objective Friction Signals
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                Do not waste email quota on low-intent or unreachable businesses. Outreacher's AI analyzes digital presence and scores each lead from 0 to 100 based on quantifiable friction criteria:
              </p>
              <div className="space-y-2 text-xs text-text-muted pt-2">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E84B2C]"></span>
                  <span><strong>High Priority (75–100):</strong> Verified email, high review footfall, and clear intake friction.</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E87A38]"></span>
                  <span><strong>Medium Priority (50–74):</strong> Established business needing personalization hooks.</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-text-muted"></span>
                  <span><strong>Low Priority (&lt;50):</strong> Missing core contact channels or unverified domains.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Deep Dive 3: CSV & Excel Ingestion */}
        <section className="py-16 sm:py-20 px-4 sm:px-6 max-w-5xl mx-auto w-full space-y-8">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="font-syne font-bold text-2xl sm:text-3xl text-text-primary tracking-tight">
              Enterprise CSV &amp; Excel Prospect Ingestion
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
              Already have your own prospect lists from Apollo, Clay, or LinkedIn? Import up to 10MB CSV or Excel files with automated column detection and formula injection sanitization.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <div className="p-5 rounded-[12px] bg-surface-elevated border border-border-subtle card-volcanic space-y-2">
              <div className="font-syne font-bold text-sm text-text-primary">Auto-Detect Mappings</div>
              <p className="text-xs text-text-muted leading-relaxed">
                Smart headers detect common variations like <code className="text-[#E87A38]">Target_Cold_Email</code>, <code className="text-[#E87A38]">Founder_Direct_Emails</code>, <code className="text-[#E87A38]">Business_Name</code>, and custom fields automatically.
              </p>
            </div>
            <div className="p-5 rounded-[12px] bg-surface-elevated border border-border-subtle card-volcanic space-y-2">
              <div className="font-syne font-bold text-sm text-text-primary">RFC Email Normalization</div>
              <p className="text-xs text-text-muted leading-relaxed">
                Cleans whitespace, lowercase-normalizes, and strictly validates syntax to prevent invalid email formats and duplicate database entries per user.
              </p>
            </div>
            <div className="p-5 rounded-[12px] bg-surface-elevated border border-border-subtle card-volcanic space-y-2">
              <div className="font-syne font-bold text-sm text-text-primary">CWE-1236 Formula Protection</div>
              <p className="text-xs text-text-muted leading-relaxed">
                Protects exports against CSV injection vulnerabilities by sanitizing cells starting with <code className="text-[#E87A38]">=</code>, <code className="text-[#E87A38]">+</code>, <code className="text-[#E87A38]">-</code>, or <code className="text-[#E87A38]">@</code>.
              </p>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-16 px-4 sm:px-6 border-t border-border-subtle bg-surface-elevated text-center">
          <div className="max-w-2xl mx-auto space-y-5">
            <h2 className="font-syne font-bold text-2xl text-text-primary">
              Ready to discover and qualify high-intent B2B prospects?
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
              Launch Outreacher to run your first automated lead discovery pipeline or import your prospect lists.
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-[12px] bg-[#E84B2C] text-white font-semibold text-xs shadow-[0_4px_16px_rgba(232,75,44,0.35)] hover:bg-[#D43E20] transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Open Lead Discovery</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

