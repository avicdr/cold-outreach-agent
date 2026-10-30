import Link from 'next/link';
import { FileText, ShieldCheck, ArrowLeft, CheckCircle2, AlertTriangle, Scale, Lock, RefreshCw } from 'lucide-react';
import { constructMetadata } from '@/lib/seo/metadata';
import { getBreadcrumbListSchema, getWebPageSchema } from '@/lib/seo/schema';
import { JsonLd } from '@/components/seo/JsonLd';
import { PublicHeader } from '@/components/seo/PublicHeader';
import { PublicFooter } from '@/components/seo/PublicFooter';
import { SITE_CONFIG } from '@/lib/seo/config';

export const metadata = constructMetadata({
  title: 'Terms of Service',
  description:
    'Terms of Service, acceptable use guidelines, anti-spam policies, and compliance terms for Outreacher, developed by Arenova.',
  path: '/tos',
});

export default function TermsOfServicePage() {
  const breadcrumbs = [
    { name: 'Home', item: '/' },
    { name: 'Terms of Service', item: '/tos' },
  ];

  const structuredData = [
    getBreadcrumbListSchema(breadcrumbs),
    getWebPageSchema({
      title: 'Terms of Service | Outreacher by Arenova',
      description: 'Terms of Service, acceptable use guidelines, and anti-spam policies for Outreacher by Arenova.',
      path: '/tos',
    }),
  ];

  return (
    <div className="min-h-screen bg-obsidian text-text-primary flex flex-col font-sans selection:bg-[#E84B2C]/20 selection:text-[#E87A38]">
      <JsonLd data={structuredData} />
      <PublicHeader />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-10 w-full">
        {/* Title Section */}
        <div className="space-y-3 border-b border-border-subtle pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E87A38]/10 border border-[#E87A38]/30 text-[#E87A38] text-xs font-mono font-medium">
            <Scale className="w-3.5 h-3.5" />
            <span>Standard B2B SaaS Agreement</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold font-syne text-text-primary tracking-tight">
            Terms of Service
          </h1>
          <p className="text-text-muted text-xs font-mono">
            Last Updated: October 30, 2026 • Effective Immediately
          </p>
        </div>

        {/* Introduction */}
        <section className="space-y-3 text-sm text-text-secondary leading-relaxed">
          <p>
            Welcome to {SITE_CONFIG.name}. By accessing or using our website, APIs, or software services (collectively, the &quot;Service&quot;), operated by {SITE_CONFIG.parentBrand.name} (<a href={SITE_CONFIG.parentBrand.url} className="text-[#E87A38] underline" target="_blank" rel="noreferrer">arenova.in</a>), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, please do not use the Service.
          </p>
          <p className="text-xs text-text-muted">
            These Terms apply to all users, subscribers, and organizations utilizing Outreacher for B2B cold outreach, lead intelligence, inbox warmups, and automated follow-up sequences.
          </p>
        </section>

        {/* Section 1: Acceptable Use & Anti-Spam Compliance */}
        <section className="space-y-4 p-6 rounded-[14px] bg-surface-elevated border border-border-standard card-volcanic">
          <h2 className="text-lg font-semibold font-syne text-text-primary flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#63C7A2]" />
            1. Acceptable Use &amp; Strict Anti-Spam Policy
          </h2>
          <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
            <p>
              Outreacher is engineered strictly for professional, legitimate business-to-business (B2B) communications. You explicitly agree and warrant that all email campaigns dispatched through our platform will comply with all applicable local, national, and international laws, including but not limited to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-text-muted">
              <li>The United States CAN-SPAM Act of 2003 (15 U.S.C. § 7701 et seq.)</li>
              <li>The European Union General Data Protection Regulation (GDPR) and ePrivacy Directive</li>
              <li>Canada&apos;s Anti-Spam Legislation (CASL)</li>
              <li>RFC 8058 One-Click List-Unsubscribe Header standards</li>
            </ul>
            <div className="pt-2">
              <h4 className="text-xs font-semibold text-text-primary mb-1">Prohibited Activities:</h4>
              <p className="text-xs text-text-muted leading-relaxed">
                You may NOT use Outreacher to send unsolicited commercial emails to purchased or unverified consumer lists; send deceptive or misleading email headers, subjects, or sender identities; distribute malware or phishing links; promote illegal products or predatory schemes; or attempt to bypass recipient security filters.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Daily Sending Safeguards & Multi-Inbox Limits */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold font-syne text-text-primary flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#E87A38]" />
            2. Daily Sending Quotas &amp; Deliverability Safeguards
          </h2>
          <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
            <p>
              To protect domain reputation and maintain high deliverability standards across mail service providers (Google, Microsoft, Yahoo), Outreacher enforces programmatic sending constraints:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="p-4 rounded-[12px] bg-surface-elevated border border-border-subtle space-y-1">
                <span className="font-semibold text-text-primary text-xs font-mono">Per-Inbox Daily Limits</span>
                <p className="text-xs text-text-muted leading-relaxed">
                  Each connected outreach inbox is governed by a strict maximum limit of 15–18 emails per day. Scaling outreach volume is achieved by rotating multiple inboxes rather than blasting single accounts.
                </p>
              </div>
              <div className="p-4 rounded-[12px] bg-surface-elevated border border-border-subtle space-y-1">
                <span className="font-semibold text-text-primary text-xs font-mono">Dynamic Interval Pacing</span>
                <p className="text-xs text-text-muted leading-relaxed">
                  Our background worker enforces a minimum 15-minute randomized interval between consecutive sends from the same inbox to simulate authentic human behavior.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Warmup Pool Terms */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold font-syne text-text-primary flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-[#E84B2C]" />
            3. Account Warmup Pool Terms
          </h2>
          <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
            <p>
              Outreacher includes a deliverability warmup feature that allows users to place new or existing email accounts into warmup pools. By activating the Warmup Pool, you acknowledge and agree that:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-text-muted">
              <li>
                Participating inboxes will automatically send and receive simulated business conversations to and from other accounts within your authorized pool.
              </li>
              <li>
                Simulated emails are strictly for training ISP deliverability scoring and do not constitute actual commercial transactions.
              </li>
              <li>
                You may pause or remove any account from warmup at any time via the Inboxes &amp; Groups dashboard.
              </li>
            </ul>
          </div>
        </section>

        {/* Section 4: Limitation of Liability */}
        <section className="space-y-4 border-t border-border-subtle pt-6">
          <h2 className="text-lg font-semibold font-syne text-text-primary">
            4. Limitation of Liability
          </h2>
          <p className="text-xs text-text-muted leading-relaxed">
            {SITE_CONFIG.parentBrand.name} provides Outreacher &quot;as is&quot; without warranties of any kind regarding open rates, response rates, or third-party email provider suspensions resulting from user compliance violations. In no event shall Arenova be liable for indirect or consequential damages.
          </p>
        </section>

        {/* Section 5: Governing Law & Contact */}
        <section className="space-y-4 border-t border-border-subtle pt-6">
          <h2 className="text-lg font-semibold font-syne text-text-primary">
            5. Governing Law &amp; Contact
          </h2>
          <p className="text-xs text-text-muted leading-relaxed">
            These Terms are governed by and construed in accordance with applicable laws. For legal questions regarding these Terms, contact us at{' '}
            <a href={`mailto:${SITE_CONFIG.supportEmail}`} className="text-[#E87A38] underline">
              {SITE_CONFIG.supportEmail}
            </a>.
          </p>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
