/**
 * Centralized SEO & Brand Configuration for Outreacher
 * Ecosystem: Arenova (https://arenova.in)
 * Product: Outreacher (https://outreacher.arenova.in)
 */

export const SITE_CONFIG = {
  name: 'Outreacher',
  brandName: 'Outreacher by Arenova',
  parentBrand: {
    name: 'Arenova',
    url: 'https://arenova.in',
    description: 'AI Automation & Marketing Agency helping businesses scale operations and customer acquisition.',
  },
  domain: 'outreacher.arenova.in',
  url: 'https://outreacher.arenova.in',
  tagline: 'Email Outreach & Sales Automation Platform',
  description:
    'Enterprise cold email outreach and sales automation platform by Arenova. Scale outbound pipeline with multi-inbox deliverability rotation, AI-personalized sequencing, autonomous lead discovery, and automated warmup.',
  defaultKeywords: [
    'cold email outreach software',
    'email outreach automation',
    'sales outreach platform',
    'multi inbox rotation',
    'email deliverability warmup',
    'B2B sales automation',
    'AI cold email generator',
    'lead discovery engine',
    'email campaign management',
    'Arenova Outreacher',
  ],
  supportEmail: 'avi@arenova.in',
  ogImage: '/arenova.png',
  locale: 'en_US',
  themeColor: '#E84B2C',
  navLinks: [
    { label: 'Overview', href: '/#overview' },
    { label: 'Outreach & Deliverability', href: '/features/email-outreach-automation' },
    { label: 'Lead Discovery', href: '/features/lead-discovery' },
    { label: 'About Arenova', href: 'https://arenova.in', external: true },
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/tos' },
  ],
  capabilities: [
    {
      title: 'Multi-Inbox Deliverability & Rotation',
      description:
        'Connect multiple Google Workspace, Gmail, and custom SMTP/IMAP inboxes. Distribute outreach across accounts with strict daily send limits (15–18 emails/day) and randomized intervals.',
    },
    {
      title: 'AI Draft Personalization & Reasoning',
      description:
        'Dual-engine LLM copywriting powered by Google Gemini with automatic OpenAI fallback. Dynamically weaves real company hooks, tech stack details, and friction analysis into natural copy.',
    },
    {
      title: 'Follow-Up Sequencing & Thread Preservation',
      description:
        'Automated multi-step sequences that preserve RFC-compliant In-Reply-To and References headers, strictly enforcing same-inbox replies to prevent disconnects.',
    },
    {
      title: 'Autonomous B2B Lead Intelligence',
      description:
        'Integrated lead discovery via Google Places and OpenStreetMap Overpass directories with automated website friction checks, phone normalization, and 0–100 qualification scoring.',
    },
    {
      title: 'Automated Account Warmup & Health Ramp',
      description:
        'Progressive daily warmup ramp with simulated peer replies and deliverability health monitoring to keep inboxes out of spam folders.',
    },
    {
      title: 'Built-in Anti-Spam & Unsubscribe Compliance',
      description:
        'Cryptographically signed HMAC unsubscribe tokens, global suppression lists, and automated bounce/mailer-daemon cleanup.',
    },
  ],
} as const;

export type SiteConfig = typeof SITE_CONFIG;

