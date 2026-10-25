import Link from 'next/link';
import { FileText, ShieldCheck, ArrowLeft, CheckCircle2, AlertTriangle, Scale, Lock, RefreshCw } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service | Antigravity AI Cold Outreach Agent',
  description: 'Terms of Service, acceptable use guidelines, and anti-spam compliance rules for Antigravity AI.',
};

export default function TermsOfServicePage() {
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
              href="/privacy"
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              Privacy Policy
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium">
            <Scale className="w-3.5 h-3.5" />
            <span>Standard B2B SaaS Agreement</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Terms of Service
          </h1>
          <p className="text-slate-400 text-sm">
            Last Updated: October 23, 2026 • Effective Immediately
          </p>
        </div>

        {/* Introduction */}
        <section className="space-y-3 text-sm text-slate-300 leading-relaxed">
          <p>
            Welcome to Antigravity AI. By accessing or using our website, APIs, or software services (collectively, the &quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, please do not use the Service.
          </p>
          <p className="text-xs text-slate-400">
            These Terms apply to all users, subscribers, and organizations utilizing Antigravity AI for B2B cold outreach, lead enrichment, inbox warmups, and automated follow-up sequences.
          </p>
        </section>

        {/* Section 1: Acceptable Use & Anti-Spam Compliance */}
        <section className="space-y-4 p-6 rounded-2xl bg-slate-900/40 border border-slate-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            1. Acceptable Use & Strict Anti-Spam Policy
          </h2>
          <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
            <p>
              Antigravity AI is engineered strictly for professional, legitimate business-to-business (B2B) communications. You explicitly agree and warrant that all email campaigns dispatched through our platform will comply with all applicable local, national, and international laws, including but not limited to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-400">
              <li>The United States CAN-SPAM Act of 2003 (15 U.S.C. § 7701 et seq.)</li>
              <li>The European Union General Data Protection Regulation (GDPR)</li>
              <li>Canada&apos;s Anti-Spam Legislation (CASL)</li>
              <li>RFC 8058 One-Click List-Unsubscribe Header standards</li>
            </ul>
            <div className="pt-2">
              <h4 className="text-xs font-semibold text-slate-200 mb-1">Prohibited Activities:</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                You may NOT use Antigravity AI to send unsolicited commercial emails to purchased, scraped, or unverified consumer lists; send deceptive or misleading email headers, subjects, or sender names; distribute malware, ransomware, or phishing campaigns; promote illegal goods, adult content, or predatory financial schemes; or attempt to bypass recipient mail servers&apos; security filters.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Daily Sending Safeguards & Multi-Inbox Limits */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            2. Daily Sending Quotas & Deliverability Safeguards
          </h2>
          <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
            <p>
              To protect domain reputation and maintain high deliverability standards across major mail service providers (Google, Microsoft, Yahoo), Antigravity AI enforces strict programmatic sending constraints:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <span className="font-semibold text-white text-xs">Per-Inbox Daily Limits</span>
                <p className="text-xs text-slate-400">
                  Each connected outreach inbox is governed by a strict maximum limit of 15–18 emails per day. Scaling outreach volume is achieved by connecting multiple inboxes into Account Groups rather than exceeding single-inbox limits.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <span className="font-semibold text-white text-xs">Dynamic Interval Pacing</span>
                <p className="text-xs text-slate-400">
                  Our background scheduler injects a minimum 15-minute randomized interval between consecutive sends from the same inbox to simulate authentic human behavior.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Warmup Pool Feature Terms */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-indigo-400" />
            3. Account Warmup Pool Terms
          </h2>
          <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
            <p>
              Antigravity AI includes a peer deliverability warmup feature that allows users to place new or existing email accounts into warmup pools. By activating the Warmup Pool on an Account Group, you acknowledge and agree that:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-slate-400">
              <li>
                Participating inboxes will automatically send and receive simulated business conversations to and from other accounts within your authorized pool.
              </li>
              <li>
                Receiving inboxes will automatically generate contextual replies according to the configured peer reply rate (default 70%) to maintain positive inbox metrics.
              </li>
              <li>
                Warmup messages are tracked via internal headers and are automatically archived or filtered so as not to pollute primary lead inboxes.
              </li>
              <li>
                Warmup volume ramps gradually (+2 emails/day up to the group limit) to establish natural sender reputation.
              </li>
            </ul>
          </div>
        </section>

        {/* Section 4: Google OAuth & Third-Party Integrations */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-indigo-400" />
            4. Third-Party Integrations & Google OAuth
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            When connecting inboxes via Google OAuth, you authorize Antigravity AI to access necessary API scopes (<code className="text-xs font-mono bg-slate-900 px-1 py-0.5 rounded text-indigo-300">gmail.send</code>, <code className="text-xs font-mono bg-slate-900 px-1 py-0.5 rounded text-indigo-300">gmail.readonly</code>, <code className="text-xs font-mono bg-slate-900 px-1 py-0.5 rounded text-indigo-300">userinfo.email</code>) solely to execute your configured outreach campaigns and warmup schedules.
          </p>
          <p className="text-xs text-slate-400">
            All token credentials are encrypted with AES-256-GCM. We adhere strictly to the Google API Services User Data Policy as outlined in our{' '}
            <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300 underline">
              Privacy Policy
            </Link>.
          </p>
        </section>

        {/* Section 5: Unsubscribe & Opt-Out Obligations */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            5. Mandatory Unsubscribe Handling
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Antigravity AI automatically embeds cryptographic unsubscribe URLs and RFC 8058 headers into outgoing outreach emails. You agree not to remove, obfuscate, or tamper with these unsubscribe mechanisms. When a recipient requests to be unsubscribed, Antigravity AI instantly adds them to the global suppression list, permanently preventing subsequent outreach from any of your campaigns.
          </p>
        </section>

        {/* Section 6: Limitation of Liability & Disclaimers */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Scale className="w-5 h-5 text-indigo-400" />
            6. Disclaimers & Limitation of Liability
          </h2>
          <div className="space-y-2 text-xs text-slate-400 leading-relaxed">
            <p>
              THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. ANTIGRAVITY AI DOES NOT GUARANTEE THAT COLD OUTREACH EMAILS WILL REACH RECIPIENT PRIMARY INBOXES, ACHIEVE SPECIFIC OPEN OR REPLY RATES, OR PREVENT MAIL PROVIDERS FROM FLAGGING ACCOUNTS SUBJECT TO AGGRESSIVE OUTREACH PRACTICES.
            </p>
            <p>
              IN NO EVENT SHALL ANTIGRAVITY AI, ITS DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE OR ANY SUSPENSION OF THIRD-PARTY EMAIL ACCOUNTS.
            </p>
          </div>
        </section>

        {/* Section 7: Modifications & Termination */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            7. Termination & Account Cancellation
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            You may terminate your account at any time by disconnecting your connected inboxes and notifying our support team. We reserve the right to suspend or terminate access immediately without prior notice if we determine that you have violated our Anti-Spam Policy or engaged in abusive email practices.
          </p>
        </section>

        {/* Section 8: Contact Information */}
        <section className="space-y-3 pt-6 border-t border-slate-800">
          <h2 className="text-lg font-semibold text-white">8. Contact Information</h2>
          <p className="text-xs text-slate-400">
            For legal inquiries, terms clarification, or compliance questions, please contact our legal counsel at:
          </p>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1">
            <div className="font-semibold text-white">Antigravity AI Legal & Compliance</div>
            <div>Email: <a href="mailto:legal@antigravity.ai" className="text-indigo-400 underline">legal@antigravity.ai</a></div>
            <div>Subject: Terms of Service Inquiry</div>
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
