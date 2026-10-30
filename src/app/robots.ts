import type { MetadataRoute } from 'next';
import { SITE_CONFIG } from '@/lib/seo/config';

/**
 * Native Next.js Dynamic Robots.txt Generation
 * Controls search crawler indexing with strict environment awareness.
 */
export default function robots(): MetadataRoute.Robots {
  // If explicitly deployed on a Vercel preview or staging branch, block crawlers entirely
  const isVercelPreview =
    process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production';

  if (isVercelPreview) {
    return {
      rules: [
        {
          userAgent: '*',
          disallow: ['/'],
        },
      ],
      sitemap: `${SITE_CONFIG.url}/sitemap.xml`,
      host: SITE_CONFIG.url,
    };
  }

  // Production Rules:
  // Permit public marketing, legal, and feature documentation pages.
  // Strictly block private SaaS dashboards, authenticated workflows, admin APIs, and utility routes.
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/features/',
          '/privacy',
          '/tos',
          '/llms.txt',
          '/llms-full.txt',
        ],
        disallow: [
          '/api/',
          '/dashboard',
          '/dashboard/',
          '/accounts',
          '/accounts/',
          '/campaigns',
          '/campaigns/',
          '/discovery',
          '/discovery/',
          '/jobs',
          '/jobs/',
          '/leads',
          '/leads/',
          '/messages',
          '/messages/',
          '/replies',
          '/replies/',
          '/settings',
          '/settings/',
          '/login',
          '/unsubscribe',
          '/_next/',
        ],
      },
      // Special protection for AI scrapers targeting private endpoints
      {
        userAgent: ['GPTBot', 'ChatGPT-User', 'Google-Extended', 'CCBot', 'anthropic-ai', 'Claude-Web'],
        allow: [
          '/',
          '/features/',
          '/privacy',
          '/tos',
          '/llms.txt',
          '/llms-full.txt',
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/accounts/',
          '/campaigns/',
          '/discovery/',
          '/jobs/',
          '/leads/',
          '/messages/',
          '/replies/',
          '/settings/',
          '/login',
          '/unsubscribe',
        ],
      },
    ],
    sitemap: `${SITE_CONFIG.url}/sitemap.xml`,
    host: SITE_CONFIG.url,
  };
}
