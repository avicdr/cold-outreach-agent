import type { Viewport } from 'next';
import './globals.css';
import { NavigationProvider } from '@/components/NavigationContext';
import { constructMetadata } from '@/lib/seo/metadata';
import { GoogleAnalytics } from '@/components/seo/GoogleAnalytics';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#E84B2C',
};

export const metadata = constructMetadata();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Preconnect to Google Fonts for Core Web Vitals (LCP / FCP) optimization */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <GoogleAnalytics />
        <NavigationProvider>{children}</NavigationProvider>
      </body>
    </html>
  );
}
