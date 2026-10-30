/**
 * Automated SEO Infrastructure Validator for Outreacher (Arenova Ecosystem)
 * Verifies metadata, canonical URLs, robots directives, sitemaps, structured data, and security invariants.
 * 
 * Usage:
 *   npx tsx scripts/validate-seo.ts
 */

import fs from 'fs';
import path from 'path';
import { SITE_CONFIG } from '../src/lib/seo/config';
import { constructMetadata } from '../src/lib/seo/metadata';
import robots from '../src/app/robots';
import sitemap from '../src/app/sitemap';
import {
  getSoftwareApplicationSchema,
  getWebSiteSchema,
  getOrganizationSchema,
  getBreadcrumbListSchema,
} from '../src/lib/seo/schema';

let passedChecks = 0;
let warningChecks = 0;
let failedChecks = 0;

function pass(name: string, detail?: string) {
  passedChecks++;
  console.log(`  ✅ [PASS] ${name}${detail ? ` (${detail})` : ''}`);
}

function warn(name: string, detail: string) {
  warningChecks++;
  console.log(`  ⚠️ [WARN] ${name}: ${detail}`);
}

function fail(name: string, detail: string) {
  failedChecks++;
  console.error(`  ❌ [FAIL] ${name}: ${detail}`);
}

async function validateSEO() {
  console.log('====================================================');
  console.log('🔍 Outreacher Technical SEO & Infrastructure Audit');
  console.log(`📍 Canonical Domain : ${SITE_CONFIG.url}`);
  console.log(`🏢 Ecosystem Brand  : ${SITE_CONFIG.brandName}`);
  console.log('====================================================\n');

  // 1. Site Configuration Validation
  console.log('1. Validating Core Brand & Domain Configuration...');
  if (SITE_CONFIG.url === 'https://outreacher.arenova.in') {
    pass('Production domain is configured correctly', SITE_CONFIG.url);
  } else {
    fail('Invalid production domain', SITE_CONFIG.url);
  }

  if (SITE_CONFIG.parentBrand.url === 'https://arenova.in') {
    pass('Parent agency domain is correctly set to Arenova', SITE_CONFIG.parentBrand.url);
  } else {
    fail('Parent agency domain mismatch', SITE_CONFIG.parentBrand.url);
  }

  // 2. Metadata Builder Validation
  console.log('\n2. Validating Centralized Metadata Engine...');
  const defaultMeta = constructMetadata();
  const pageMeta = constructMetadata({
    title: 'Cold Email Outreach',
    description: 'Automate outbound sequences with multi-inbox rotation.',
    path: '/features/email-outreach-automation',
  });

  if (defaultMeta.metadataBase?.toString() === 'https://outreacher.arenova.in/') {
    pass('metadataBase is configured with HTTPS production URL');
  } else {
    fail('metadataBase missing or invalid', String(defaultMeta.metadataBase));
  }

  if (typeof pageMeta.title === 'string' && pageMeta.title.includes(SITE_CONFIG.name)) {
    pass('Title template correctly appends site brand', pageMeta.title);
  } else {
    fail('Page title missing brand name', String(pageMeta.title));
  }

  if (pageMeta.alternates?.canonical === 'https://outreacher.arenova.in/features/email-outreach-automation') {
    pass('Canonical URL is strictly formatted without trailing slash', pageMeta.alternates.canonical);
  } else {
    fail('Canonical URL incorrect', String(pageMeta.alternates?.canonical));
  }

  if (pageMeta.openGraph?.title && pageMeta.openGraph.url && pageMeta.openGraph.siteName === 'Outreacher') {
    pass('Open Graph metadata is complete and branded');
  } else {
    fail('Open Graph metadata incomplete');
  }

  // 3. Robots.txt Validation
  console.log('\n3. Validating Robots.txt Rules & Indexing Controls...');
  const robotsConfig = robots();
  const rules = Array.isArray(robotsConfig.rules) ? robotsConfig.rules[0] : robotsConfig.rules;

  if (robotsConfig.sitemap === `${SITE_CONFIG.url}/sitemap.xml`) {
    pass('Robots.txt references correct production sitemap endpoint');
  } else {
    fail('Robots.txt sitemap reference incorrect', String(robotsConfig.sitemap));
  }

  const disallowed = Array.isArray(rules?.disallow) ? rules.disallow : [];
  const privatePaths = ['/api/', '/dashboard', '/accounts', '/campaigns', '/leads', '/jobs', '/settings', '/login', '/unsubscribe'];
  const missingDisallows = privatePaths.filter((p) => !disallowed.some((d) => d.startsWith(p)));

  if (missingDisallows.length === 0) {
    pass('All private, admin, and utility routes are disallowed in robots.txt');
  } else {
    fail('Missing robots disallow rules for sensitive paths', missingDisallows.join(', '));
  }

  // 4. Sitemap Validation
  console.log('\n4. Validating XML Sitemap Entries...');
  const sitemapEntries = sitemap();

  if (sitemapEntries.length > 0) {
    pass(`Sitemap contains ${sitemapEntries.length} public canonical routes`);
  } else {
    fail('Sitemap is empty');
  }

  const invalidSitemapUrls = sitemapEntries.filter((e) => !e.url.startsWith(SITE_CONFIG.url));
  if (invalidSitemapUrls.length === 0) {
    pass('All sitemap entries belong to https://outreacher.arenova.in (no staging URLs)');
  } else {
    fail('Sitemap contains foreign or staging URLs', invalidSitemapUrls.map((u) => u.url).join(', '));
  }

  const disallowedInSitemap = sitemapEntries.filter((e) =>
    disallowed.some((d) => e.url.replace(SITE_CONFIG.url, '').startsWith(d))
  );
  if (disallowedInSitemap.length === 0) {
    pass('Zero noindex or disallowed paths are present in sitemap');
  } else {
    fail('Sitemap mistakenly includes disallowed paths', disallowedInSitemap.map((u) => u.url).join(', '));
  }

  // 5. JSON-LD Structured Data Validation
  console.log('\n5. Validating JSON-LD Structured Data Schemas...');
  try {
    const appSchema = getSoftwareApplicationSchema();
    const siteSchema = getWebSiteSchema();
    const orgSchema = getOrganizationSchema();
    const breadcrumbSchema = getBreadcrumbListSchema([
      { name: 'Home', item: '/' },
      { name: 'Features', item: '/features' },
    ]);

    if (appSchema['@type'] === 'SoftwareApplication' && appSchema.name === 'Outreacher') {
      pass('SoftwareApplication schema is valid and branded');
    } else {
      fail('SoftwareApplication schema invalid');
    }

    if (siteSchema['@type'] === 'WebSite' && siteSchema.url === SITE_CONFIG.url) {
      pass('WebSite schema is valid');
    } else {
      fail('WebSite schema invalid');
    }

    if (orgSchema['@type'] === 'Organization' && orgSchema.name === 'Arenova') {
      pass('Organization schema correctly links parent agency Arenova');
    } else {
      fail('Organization schema invalid');
    }

    if (breadcrumbSchema['@type'] === 'BreadcrumbList' && breadcrumbSchema.itemListElement.length === 2) {
      pass('BreadcrumbList schema generated with valid hierarchy');
    } else {
      fail('BreadcrumbList schema invalid');
    }
  } catch (err: any) {
    fail('Structured data generation crashed', err.message);
  }

  // 6. Public Assets & Files Validation
  console.log('\n6. Validating Static SEO Discovery Assets...');
  const publicDir = path.join(process.cwd(), 'public');
  const requiredFiles = ['arenova.png', 'arenova.ico', 'llms.txt', 'llms-full.txt'];
  for (const file of requiredFiles) {
    if (fs.existsSync(path.join(publicDir, file))) {
      pass(`Static asset exists: public/${file}`);
    } else {
      fail(`Missing public asset: public/${file}`, 'File does not exist');
    }
  }

  // 7. Proxy Middleware Security Invariant
  console.log('\n7. Validating Proxy / Middleware Routing Safeguards...');
  const proxyCode = fs.readFileSync(path.join(process.cwd(), 'src/proxy.ts'), 'utf8');
  if (proxyCode.includes('X-Robots-Tag') && proxyCode.includes('noindex, nofollow')) {
    pass('Proxy middleware enforces X-Robots-Tag: noindex, nofollow on private routes');
  } else {
    fail('Proxy middleware missing X-Robots-Tag protection', 'Private routes may be crawled');
  }

  if (proxyCode.includes("pathname === '/'")) {
    pass('Proxy middleware allows crawlable public root landing page');
  } else {
    fail('Root landing page is not permitted in proxy');
  }

  // Summary
  console.log('\n====================================================');
  console.log(`🏁 SEO Validation Results: ${passedChecks} Passed, ${warningChecks} Warnings, ${failedChecks} Failed`);
  console.log('====================================================\n');

  if (failedChecks > 0) {
    process.exit(1);
  }
}

validateSEO().catch((err) => {
  console.error('Fatal validator error:', err);
  process.exit(1);
});
