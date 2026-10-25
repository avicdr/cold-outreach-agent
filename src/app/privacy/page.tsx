import Link from 'next/link';
import { ShieldCheck, Lock, ArrowLeft, CheckCircle2, FileText, Mail, EyeOff, Server } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy | Antigravity AI Cold Outreach Agent',
  description: 'Privacy Policy and Google API Services User Data Policy compliance for Antigravity AI.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Navigation Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/arenova.png"
              alt="ARENOVA"
              width={34}
              height={34}
              className="w-8 h-8 object-contain filter drop-shadow-[0_0_8px_rgba(232,75,44,0.35)]"
            />
            <div className="flex items-center gap-2">
              <span className="font-bold font-syne text-text-primary text-base tracking-[-0.025em]">ARENOVA</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E84B2C]/10 text-[#E87A38] font-mono font-bold border border-[#E84B2C]/25">
                LEGAL
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <Link
              href="/tos"
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/accounts"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to App</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto px-6 py-12 space-y-10">
        {/* Title Section */}
        <div className="space-y-3 border-b border-slate-800 pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Google API Services User Data Policy Compliant</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-slate-400 text-sm">
            Last Updated: October 23, 2026 • Effective Immediately
          </p>
        </div>

        {/* Overview Banner */}
        <div className="p-5 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-2">
          <h3 className="text-sm font-semibold text-indigo-300 flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Commitment to Data Privacy & Protection
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Antigravity AI (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) provides an autonomous B2B cold email personalization, follow-up sequencing, and deliverability warmup platform. This Privacy Policy outlines our transparent practices regarding data collection, AES-256 encryption, access permissions, and strict compliance with Google&apos;s Limited Use requirements.
          </p>
        </div>

        {/* Section 1: Google API Scopes & Access */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-400" />
            1. Google OAuth & Gmail API Data Access
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            When you connect your Google Workspace or Gmail account to Antigravity AI via OAuth 2.0, our application requests access to specific, minimal scopes necessary to fulfill user-directed cold email workflows:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <span className="font-mono text-xs text-indigo-400 font-semibold block">userinfo.email</span>
              <p className="text-xs text-slate-400">
                Used solely to identify your connected email address, verify inbox ownership, and configure sender routing.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <span className="font-mono text-xs text-indigo-400 font-semibold block">gmail.send</span>
              <p className="text-xs text-slate-400">
                Permits our background worker to send user-authorized cold outreach emails and scheduled intra-pool warmup messages.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <span className="font-mono text-xs text-indigo-400 font-semibold block">gmail.readonly</span>
              <p className="text-xs text-slate-400">
                Monitors replies to your campaigns to automatically pause follow-up sequences, classify lead sentiment, and process unsubscribes.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Google API Limited Use Policy Disclosure */}
        <section className="space-y-4 p-6 rounded-2xl bg-slate-900/40 border border-slate-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            2. Google API Services User Data Policy & Limited Use Disclosure
          </h2>
          <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
            <p className="font-medium text-slate-200">
              Antigravity AI&apos;s use and transfer of information received from Google APIs to any other app adheres to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-slate-400">
              <li>
                <strong className="text-slate-200">No Human Review:</strong> No human beings at Antigravity AI read your emails or email replies unless: (1) we have obtained your affirmative agreement for specific debugging sessions, (2) it is necessary for security investigations (such as preventing abuse), or (3) required by applicable law.
              </li>
              <li>
                <strong className="text-slate-200">No Advertising or Marketing:</strong> We never use or transfer Google user data for serving advertisements, retargeting, interest-based advertising, or personalized ads.
              </li>
              <li>
                <strong className="text-slate-200">No Sale of Data:</strong> We never sell, rent, lease, or monetize your Google account data or lead contacts to data brokers, advertising networks, or third parties.
              </li>
              <li>
                <strong className="text-slate-200">No Lending or Credit Evaluation:</strong> Data obtained through Google APIs is never used to determine creditworthiness or for lending purposes.
              </li>
            </ul>
          </div>
        </section>

        {/* Section 3: Data Storage, Security & AES-256 Encryption */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-indigo-400" />
            3. Data Storage & Military-Grade Encryption
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            All OAuth tokens (both access tokens and refresh tokens) received from Google are encrypted at rest using industry-standard authenticated encryption:
          </p>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>AES-256-GCM Authenticated Encryption</span>
            </div>
            <p className="text-slate-400">
              Tokens are never stored in plaintext. They are encrypted using unique 96-bit initialization vectors (IVs) and 128-bit authentication tags, preventing unauthorized decryption or tampering. Database connections utilize SSL/TLS 1.3 in transit.
            </p>
          </div>
        </section>

        {/* Section 4: Email Warmup Pool & Data Protection */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <EyeOff className="w-5 h-5 text-indigo-400" />
            4. Account Warmup Pool Privacy
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            When you enable the Warmup Pool feature for an Account Group, participating inboxes exchange simulated business communications with other verified inboxes in your designated warmup pool to build sender domain reputation.
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Warmup messages use synthetic business discussion templates generated by AI and do not contain proprietary company secrets or customer contact details. Warmup emails are clearly identified with system tracking headers and do not interfere with standard inbound customer leads.
          </p>
        </section>

        {/* Section 5: Data Retention & User Revocation Rights */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            5. User Rights, Token Revocation & Deletion
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            You retain 100% control over your connected accounts and stored data:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs text-slate-400">
            <li>
              <strong className="text-slate-200">Disconnect Anytime:</strong> You can disconnect any outreach inbox at any moment directly from the{' '}
              <Link href="/accounts" className="text-indigo-400 hover:text-indigo-300 underline">
                Inboxes & Account Groups
              </Link>{' '}
              dashboard. Disconnecting an inbox immediately wipes its stored tokens and halts all sending.
            </li>
            <li>
              <strong className="text-slate-200">Google Security Portal Revocation:</strong> You can revoke Antigravity AI&apos;s permissions directly from your Google Account management dashboard at{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline"
              >
                https://myaccount.google.com/permissions
              </a>.
            </li>
            <li>
              <strong className="text-slate-200">Complete Data Deletion:</strong> Upon account termination or written request to our privacy team, all associated campaign records, lead metadata, and encrypted tokens are permanently purged within 30 days.
            </li>
          </ul>
        </section>

        {/* Section 6: Contact Information */}
        <section className="space-y-3 pt-6 border-t border-slate-800">
          <h2 className="text-lg font-semibold text-white">6. Contact Our Privacy & Security Officer</h2>
          <p className="text-xs text-slate-400">
            If you have questions, inquiries, or requests regarding this Privacy Policy or our compliance with Google API Services requirements, please contact:
          </p>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1">
            <div className="font-semibold text-white">Antigravity AI Legal & Compliance Team</div>
            <div>Email: <a href="mailto:privacy@antigravity.ai" className="text-indigo-400 underline">privacy@antigravity.ai</a></div>
            <div>Platform: Autonomous B2B Cold Outreach & Deliverability Agent</div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-8 text-center text-xs text-slate-500 space-y-2 bg-slate-950">
        <div>© 2026 Antigravity AI. All rights reserved.</div>
        <div className="flex justify-center gap-4 text-slate-400">
          <Link href="/privacy" className="hover:text-white underline">Privacy Policy</Link>
          <span>•</span>
          <Link href="/tos" className="hover:text-white underline">Terms of Service</Link>
          <span>•</span>
          <Link href="/accounts" className="hover:text-white underline">Inboxes & Groups</Link>
        </div>
      </footer>
    </div>
  );
}
