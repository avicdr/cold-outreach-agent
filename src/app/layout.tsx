import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Antigravity AI | Cold Outreach Automation Agent',
  description:
    'Autonomous B2B cold email personalization, follow-up sequencing, Gmail integration, and reply sentiment classification powered by Google Gemini.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full bg-slate-950 text-slate-100 flex flex-col font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
