import type { Metadata, Viewport } from 'next';
import './globals.css';
import { NavigationProvider } from '@/components/NavigationContext';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: 'ARENOVA | Autonomous Cold Outreach Agent',
  description:
    'High-velocity cinematic enterprise cold email automation, multi-inbox deliverability scaling, and lead discovery engine.',
  icons: {
    icon: [
      { url: '/arenova.ico' },
      { url: '/favicon.ico' },
    ],
    shortcut: '/arenova.ico',
    apple: '/arenova.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <NavigationProvider>{children}</NavigationProvider>
      </body>
    </html>
  );
}
