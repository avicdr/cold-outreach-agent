import type { Metadata } from 'next';
import { SITE_CONFIG } from './config';

export interface ConstructMetadataOptions {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
  type?: 'website' | 'article';
  keywords?: string[];
  publishedTime?: string;
  modifiedTime?: string;
}

/**
 * Centralized Metadata Builder for Outreacher (Arenova Ecosystem)
 * Ensures 100% compliant canonicals, Open Graph, Twitter cards, and indexing controls.
 */
export function constructMetadata({
  title,
  description = SITE_CONFIG.description,
  path = '',
  image = SITE_CONFIG.ogImage,
  noIndex = false,
  type = 'website',
  keywords = [...SITE_CONFIG.defaultKeywords],
  publishedTime,
  modifiedTime,
}: ConstructMetadataOptions = {}): Metadata {
  const formattedTitle = title
    ? `${title} | ${SITE_CONFIG.name}`
    : `${SITE_CONFIG.name} — ${SITE_CONFIG.tagline} by ${SITE_CONFIG.parentBrand.name}`;

  // Ensure clean, single-slash path and absolute canonical URL on production domain
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  const canonicalUrl = `${SITE_CONFIG.url}${cleanPath}`;
  const ogImageUrl = image.startsWith('http') ? image : `${SITE_CONFIG.url}${image}`;

  // Google Search Console verification token from environment variable
  const googleVerification =
    process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
    process.env.GOOGLE_SITE_VERIFICATION;

  const metadata: Metadata = {
    metadataBase: new URL(SITE_CONFIG.url),
    title: formattedTitle,
    description,
    keywords,
    authors: [{ name: SITE_CONFIG.parentBrand.name, url: SITE_CONFIG.parentBrand.url }],
    creator: SITE_CONFIG.parentBrand.name,
    publisher: SITE_CONFIG.parentBrand.name,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
          googleBot: {
            index: false,
            follow: false,
            noimageindex: true,
            'max-video-preview': -1,
            'max-image-preview': 'none',
            'max-snippet': -1,
          },
        }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            'max-video-preview': -1,
            'max-image-preview': 'large',
            'max-snippet': -1,
          },
        },
    openGraph: {
      title: formattedTitle,
      description,
      url: canonicalUrl,
      siteName: SITE_CONFIG.name,
      locale: SITE_CONFIG.locale,
      type,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${SITE_CONFIG.name} — ${SITE_CONFIG.tagline}`,
        },
      ],
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: formattedTitle,
      description,
      images: [ogImageUrl],
      creator: '@arenova_ai',
      site: '@arenova_ai',
    },
    icons: {
      icon: [
        { url: '/arenova.ico' },
        { url: '/favicon.ico' },
      ],
      shortcut: '/arenova.ico',
      apple: '/arenova.png',
    },
    verification: googleVerification
      ? {
          google: googleVerification,
        }
      : undefined,
  };

  return metadata;
}

