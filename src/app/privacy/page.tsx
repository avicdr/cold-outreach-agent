import Link from 'next/link';
import { ShieldCheck, Lock, ArrowLeft, CheckCircle2, FileText, Mail, EyeOff, Server, ArrowRight } from 'lucide-react';
import { constructMetadata } from '@/lib/seo/metadata';
import { getBreadcrumbListSchema, getWebPageSchema } from '@/lib/seo/schema';
import { JsonLd } from '@/components/seo/JsonLd';
import { PublicHeader } from '@/components/seo/PublicHeader';
import { PublicFooter } from '@/components/seo/PublicFooter';
import { SITE_CONFIG } from '@/lib/seo/config';

export const metadata = constructMetadata({
  title: 'Privacy Policy',
  description:
    'Privacy Policy and Google API Services User Data Policy compliance for Outreacher, developed by Arenova. Transparent data practices, AES-256 encryption, and limited use disclosure.',
  path: '/privacy',
});

export default function PrivacyPolicyPage() {
  const breadcrumbs = [
    { name: 'Home', item: '/' },
    { name: 'Privacy Policy', item: '/privacy' },
  ];

  const structuredData = [
    getBreadcrumbListSchema(breadcrumbs),
    getWebPageSchema({
      title: 'Privacy Policy | Outreacher by Arenova',
      description: 'Privacy Policy and Google API Services User Data Policy compliance for Outreacher by Arenova.',
      path: '/privacy',
    }),
  ];

  return (
    <div className="min-h-screen bg-obsidian text-text-primary flex flex-col font-sans selection:bg-[#E84B2C]/20 selection:text-[#E87A38]">
      <JsonLd data={structuredData} />
      <PublicHeader />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-10 w-full">
        {/* Title Section */}
        <div className="space-y-3 border-b border-border-subtle pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#63C7A2]/10 border border-[#63C7A2]/30 text-[#63C7A2] text-xs font-mono font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Google API Services User Data Policy Compliant</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold font-syne text-text-primary tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-text-muted text-xs font-mono">
            Last Updated: October 30, 2026 • Effective Immediately
          </p>
        </div>

        {/* Overview Banner */}
        <div className="p-5 rounded-[14px] bg-surface-elevated border border-border-standard card-volcanic space-y-2">
          <h2 className="text-sm font-semibold font-syne text-[#E87A38] flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Commitment to Data Privacy &amp; Protection
          </h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            {SITE_CONFIG.name} (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;), a software product developed by {SITE_CONFIG.parentBrand.name} (<a href={SITE_CONFIG.parentBrand.url} className="text-[#E87A38] underline" target="_blank" rel="noreferrer">arenova.in</a>), provides an enterprise B2B cold email personalization, follow-up sequencing, and deliverability warmup platform. This Privacy Policy outlines our transparent practices regarding data collection, AES-256 encryption, access permissions, and strict compliance with Google&apos;s Limited Use requirements.
          </p>
        </div>

        {/* Section 1: Google API Scopes & Access */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold font-syne text-text-primary flex items-center gap-2">
            <Mail className="w-5 h-5 text-[#E84B2C]" />
            1. Google OAuth &amp; Gmail API Data Access
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            When you connect your Google Workspace or Gmail account to Outreacher via OAuth 2.0, our application requests access to specific, minimal scopes necessary to fulfill user-directed cold email workflows:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-[12px] bg-surface-elevated border border-border-subtle space-y-2">
              <span className="font-mono text-xs text-[#E87A38] font-semibold block">userinfo.email</span>
              <p className="text-xs text-text-muted leading-relaxed">
                Used solely to identify your connected email address, verify inbox ownership, and configure sender routing.
              </p>
            </div>
            <div className="p-4 rounded-[12px] bg-surface-elevated border border-border-subtle space-y-2">
              <span className="font-mono text-xs text-[#E87A38] font-semibold block">gmail.send</span>
              <p className="text-xs text-text-muted leading-relaxed">
                Permits our background worker to send user-authorized cold outreach emails and scheduled intra-pool warmup messages.
              </p>
            </div>
            <div className="p-4 rounded-[12px] bg-surface-elevated border border-border-subtle space-y-2">
              <span className="font-mono text-xs text-[#E87A38] font-semibold block">gmail.readonly</span>
              <p className="text-xs text-text-muted leading-relaxed">
                Monitors replies to your campaigns to automatically pause follow-up sequences, classify lead sentiment, and process unsubscribes.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Google API Limited Use Policy Disclosure */}
        <section className="space-y-4 p-6 rounded-[14px] bg-surface-elevated border border-border-standard card-volcanic">
          <h2 className="text-lg font-semibold font-syne text-text-primary flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#63C7A2]" />
            2. Google API Services User Data Policy &amp; Limited Use Disclosure
          </h2>
          <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
            <p className="font-medium text-text-primary">
              Outreacher&apos;s use and transfer of information received from Google APIs to any other app adheres to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noreferrer"
                className="text-[#E87A38] hover:text-[#E84B2C] underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <p className="text-xs text-text-muted leading-relaxed">
              We do not use Google user data to develop, train, or fine-tune general AI or machine learning models. User data is processed strictly for transient, user-directed email composition and dispatch.
            </p>
          </div>
        </section>

        {/* Section 3: Data Encryption & Storage */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold font-syne text-text-primary flex items-center gap-2">
            <Server className="w-5 h-5 text-[#E87A38]" />
            3. Data Storage, AES-256 Encryption &amp; Security
          </h2>
          <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
            <p>
              Security and data minimization are core architectural principles of Outreacher:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-text-muted">
              <li>
                <strong>OAuth Tokens &amp; Passwords:</strong> All access tokens, refresh tokens, and SMTP credentials are encrypted at rest using AES-256-GCM authenticated encryption before being saved to the database. Plaintext tokens never appear in server logs or client bundles.
              </li>
              <li>
                <strong>Prospect Data:</strong> Lead information imported via CSV/Excel or discovered through Google Places is isolated to your authenticated account and is never shared, rented, or traded across organizations.
              </li>
              <li>
                <strong>Unsubscribe Cryptography:</strong> Unsubscribe URLs utilize HMAC-SHA256 signatures with secret key salting to prevent URL tampering.
              </li>
            </ul>
          </div>
        </section>

        {/* Section 4: Contact Information */}
        <section className="space-y-4 border-t border-border-subtle pt-6">
          <h2 className="text-lg font-semibold font-syne text-text-primary">
            4. Contact &amp; Privacy Inquiries
          </h2>
          <p className="text-xs text-text-muted leading-relaxed">
            If you have questions, data deletion requests, or concerns regarding this Privacy Policy or your connected data, please contact Arenova support directly at{' '}
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
