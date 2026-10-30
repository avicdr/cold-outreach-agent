import { SITE_CONFIG } from './config';

/**
 * Validated Schema.org JSON-LD Structured Data Generators for Outreacher
 * Uses strict, accurate facts without fabricated claims or ratings.
 */

export function getOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_CONFIG.parentBrand.url}/#organization`,
    name: SITE_CONFIG.parentBrand.name,
    url: SITE_CONFIG.parentBrand.url,
    description: SITE_CONFIG.parentBrand.description,
    logo: `${SITE_CONFIG.url}/arenova.png`,
    email: SITE_CONFIG.supportEmail,
  };
}

export function getWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_CONFIG.url}/#website`,
    url: SITE_CONFIG.url,
    name: `${SITE_CONFIG.name} by ${SITE_CONFIG.parentBrand.name}`,
    description: SITE_CONFIG.description,
    publisher: {
      '@id': `${SITE_CONFIG.parentBrand.url}/#organization`,
    },
    inLanguage: 'en-US',
  };
}

export function getSoftwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${SITE_CONFIG.url}/#softwareapplication`,
    name: SITE_CONFIG.name,
    url: SITE_CONFIG.url,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web-based',
    description: SITE_CONFIG.description,
    brand: {
      '@type': 'Brand',
      name: SITE_CONFIG.name,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_CONFIG.parentBrand.name,
      url: SITE_CONFIG.parentBrand.url,
    },
    featureList: SITE_CONFIG.capabilities.map((c) => c.title),
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
  };
}

export interface BreadcrumbItem {
  name: string;
  item: string;
}

export function getBreadcrumbListSchema(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.item.startsWith('http') ? crumb.item : `${SITE_CONFIG.url}${crumb.item}`,
    })),
  };
}

export function getWebPageSchema({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  const pageUrl = `${SITE_CONFIG.url}${path.startsWith('/') ? path : `/${path}`}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${pageUrl}/#webpage`,
    url: pageUrl,
    name: title,
    description,
    isPartOf: {
      '@id': `${SITE_CONFIG.url}/#website`,
    },
    inLanguage: 'en-US',
  };
}

