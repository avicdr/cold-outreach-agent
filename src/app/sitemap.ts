import type { MetadataRoute } from 'next';
import { SITE_CONFIG } from '@/lib/seo/config';

/**
 * Native Next.js Dynamic XML Sitemap Generator
 * Includes only valid, canonical, indexable public URLs on https://outreacher.arenova.in
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_CONFIG.url;
  const buildDate = new Date();

  return [
    {
      url: `${baseUrl}`,
      lastModified: buildDate,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/features/email-outreach-automation`,
      lastModified: buildDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/features/lead-discovery`,
      lastModified: buildDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: buildDate,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/tos`,
      lastModified: buildDate,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}

