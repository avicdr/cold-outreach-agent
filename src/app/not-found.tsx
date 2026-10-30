import Link from 'next/link';
import { ArrowLeft, Home, Compass } from 'lucide-react';
import { constructMetadata } from '@/lib/seo/metadata';

export const metadata = constructMetadata({
  title: 'Page Not Found (404)',
  description: 'The requested page could not be found on Outreacher.',
  noIndex: true,
});

export default function NotFound() {
  return (
    <div className="min-h-screen bg-obsidian text-text-primary flex items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Volcanic Ambient Dual-Radial Lighting */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 50% 20%, rgba(232, 75, 44, 0.12), transparent 50%),
            radial-gradient(ellipse at 85% 85%, rgba(200, 105, 56, 0.08), transparent 45%)
          `,
        }}
      />

      <div className="max-w-md w-full relative z-10 text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E84B2C]/10 border border-[#E84B2C]/30 text-[#E87A38] text-xs font-mono font-semibold uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E84B2C] shadow-[0_0_8px_#E84B2C]"></span>
          Error 404
        </div>

        <div className="space-y-2">
          <h1 className="font-syne font-extrabold text-4xl text-text-primary tracking-tight">
            Page Not Found
          </h1>
          <p className="text-sm text-text-muted">
            The page you are looking for has been moved, deleted, or does not exist.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#E84B2C] text-white font-medium text-xs shadow-[0_2px_10px_rgba(232,75,44,0.32)] hover:bg-[#D43E20] transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>Return Home</span>
          </Link>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-[10px] bg-surface-elevated border border-border-standard text-text-primary font-medium text-xs hover:bg-surface-hover transition-colors"
          >
            <Compass className="w-4 h-4" />
            <span>Go to Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

