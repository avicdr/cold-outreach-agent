import { DiscoveredBusinessRaw } from './providers/types';
import { ObservedFrictionItem } from '@/types/database';

export interface WebsiteInspectionResult {
  email?: string;
  booking_url?: string;
  has_online_booking: boolean;
  contact_channels: string[];
  observed_friction: ObservedFrictionItem[];
  services: string[];
  practitioners_count_hint?: number;
  snippet_for_ai: string;
  evidence_urls: string[];
}

export interface EnrichedBusiness {
  name: string;
  category: string;
  subcategory?: string;
  phone?: string;
  normalized_phone?: string;
  email?: string;
  website?: string;
  canonical_domain?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  rating?: number;
  review_count?: number;
  place_id?: string;
  google_maps_url?: string;
  booking_url?: string;
  has_online_booking?: boolean;
  contact_channels: string[];
  observed_friction: ObservedFrictionItem[];
  evidence_urls: string[];
  snippet_for_ai: string;
  discovery_source: string;
  last_enriched_at: string;
}

/**
 * Normalizes a URL to a canonical domain (e.g. "https://www.Clinic.com/about" -> "clinic.com")
 */
export function normalizeDomain(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  try {
    let clean = rawUrl.trim().toLowerCase();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    const parsed = new URL(clean);
    let hostname = parsed.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    return hostname || null;
  } catch {
    // Basic regex fallback
    const match = rawUrl.toLowerCase().match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i);
    return match ? match[1] : null;
  }
}

/**
 * Normalizes phone numbers to standard E.164 format
 */
export function normalizePhone(rawPhone?: string, defaultCountry = 'US'): string | null {
  if (!rawPhone) return null;
  const digitsOnly = rawPhone.replace(/\D/g, '');
  if (!digitsOnly || digitsOnly.length < 7) return null;

  // Handle US / Canada 10-digit
  if (defaultCountry.toUpperCase() === 'US' || defaultCountry.toUpperCase() === 'CA') {
    if (digitsOnly.length === 10) {
      return `+1${digitsOnly}`;
    }
    if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
      return `+${digitsOnly}`;
    }
  }

  // Handle UK 10-11 digit
  if (defaultCountry.toUpperCase() === 'GB' || defaultCountry.toUpperCase() === 'UK') {
    if (digitsOnly.startsWith('0') && digitsOnly.length === 11) {
      return `+44${digitsOnly.slice(1)}`;
    }
  }

  // Already prefixed with '+' in raw
  if (rawPhone.trim().startsWith('+')) {
    return `+${digitsOnly}`;
  }

  // Fallback to formatted digits
  return `+${digitsOnly}`;
}

/**
 * Inspects a business website for booking links, contact methods, and friction indicators.
 * Respects timeouts and treats retrieved content as untrusted input.
 */
export async function inspectWebsite(
  websiteUrl?: string,
  businessPhone?: string
): Promise<WebsiteInspectionResult> {
  const result: WebsiteInspectionResult = {
    has_online_booking: false,
    contact_channels: businessPhone ? ['phone'] : [],
    observed_friction: [],
    services: [],
    evidence_urls: websiteUrl ? [websiteUrl] : [],
    snippet_for_ai: '',
  };

  if (!websiteUrl) {
    if (businessPhone) {
      result.observed_friction.push({
        finding: 'No website listed; contact and appointments are exclusively phone-based',
        evidence_type: 'observed',
        source_url: 'directory_listing',
        confidence: 'high',
      });
    }
    return result;
  }

  let formattedUrl = websiteUrl.trim();
  if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
    formattedUrl = 'https://' + formattedUrl;
  }

  try {
    const res = await fetch(formattedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(6000),
      redirect: 'follow',
    });

    if (!res.ok) {
      result.snippet_for_ai = `Website reachable status: HTTP ${res.status}`;
      return result;
    }

    const html = await res.text();
    const lowerHtml = html.toLowerCase();

    // 1. Detect public email
    const mailtoMatch = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (mailtoMatch) {
      const emailCandidate = mailtoMatch[1].toLowerCase();
      if (!emailCandidate.includes('wixpress') && !emailCandidate.includes('sentry') && !emailCandidate.includes('example.com')) {
        result.email = emailCandidate;
        if (!result.contact_channels.includes('email')) result.contact_channels.push('email');
      }
    } else {
      // General email regex
      const emailMatches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi);
      if (emailMatches) {
        for (const cand of emailMatches) {
          const lower = cand.toLowerCase();
          if (!lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.includes('domain.com') && !lower.includes('sentry') && !lower.includes('wixpress')) {
            result.email = lower;
            if (!result.contact_channels.includes('email')) result.contact_channels.push('email');
            break;
          }
        }
      }
    }

    // 2. Detect WhatsApp
    if (lowerHtml.includes('wa.me/') || lowerHtml.includes('api.whatsapp.com') || lowerHtml.includes('whatsapp.com')) {
      if (!result.contact_channels.includes('whatsapp')) result.contact_channels.push('whatsapp');
    }

    // 3. Detect Contact Form
    if (lowerHtml.includes('<form') && (lowerHtml.includes('contact') || lowerHtml.includes('message') || lowerHtml.includes('inquiry') || lowerHtml.includes('enquiry'))) {
      if (!result.contact_channels.includes('web_form')) result.contact_channels.push('web_form');
    }

    // 4. Detect Online Booking systems
    const bookingDomains = [
      'calendly.com',
      'acuityscheduling.com',
      'zocdoc.com',
      'jane.app',
      'fresha.com',
      'vagaro.com',
      'mindbodyonline.com',
      'booksy.com',
      'setmore.com',
      'simplybook.me',
    ];

    let foundBookingLink: string | undefined;
    for (const bDomain of bookingDomains) {
      if (lowerHtml.includes(bDomain)) {
        const regex = new RegExp(`https?://[a-zA-Z0-9.-]*${bDomain.replace('.', '\\.')}[^"'>\\s]*`, 'i');
        const match = html.match(regex);
        if (match) {
          foundBookingLink = match[0];
          break;
        }
      }
    }

    if (!foundBookingLink) {
      // Check internal booking URLs
      const internalBookingMatch = html.match(/href=["'](\/(?:book(?:ing|-online)?|schedule|appointment|book-an-appointment)[^"']*)["']/i);
      if (internalBookingMatch) {
        try {
          foundBookingLink = new URL(internalBookingMatch[1], formattedUrl).toString();
        } catch {
          foundBookingLink = internalBookingMatch[1];
        }
      }
    }

    if (foundBookingLink) {
      result.booking_url = foundBookingLink;
      result.has_online_booking = true;
      if (!result.contact_channels.includes('online_booking')) result.contact_channels.push('online_booking');
      result.observed_friction.push({
        finding: 'Online booking link or widget detected',
        evidence_type: 'observed',
        source_url: foundBookingLink,
        confidence: 'high',
      });
    } else {
      result.has_online_booking = false;
      // No self-serve booking found -> Friction finding!
      result.observed_friction.push({
        finding: 'No self-serve online booking widget found; enquiries & bookings routed through phone call or contact form',
        evidence_type: 'observed',
        source_url: formattedUrl,
        confidence: 'high',
      });
    }

    // 5. Detect multiple practitioners or locations
    const drMatches = html.match(/\b(Dr\.|Doctor|Physician|Dentist|Surgeon|Therapist)\s+[A-Z][a-z]+/g) || [];
    const uniqueDrs = Array.from(new Set(drMatches));
    if (uniqueDrs.length > 1) {
      result.practitioners_count_hint = uniqueDrs.length;
      result.observed_friction.push({
        finding: `Multiple practitioners or providers mentioned on website (${uniqueDrs.length} identified)`,
        evidence_type: 'observed',
        source_url: formattedUrl,
        confidence: 'medium',
      });
    }

    // Extract clean visible text snippet for AI prompt (max 800 chars)
    const strippedText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    result.snippet_for_ai = strippedText.slice(0, 800);
  } catch (err: any) {
    result.snippet_for_ai = `Website check failed: ${err.message}`;
  }

  return result;
}

/**
 * Combines raw discovered data with website inspection and normalization
 */
export async function enrichDiscoveredBusiness(
  raw: DiscoveredBusinessRaw,
  inspectSite = true
): Promise<EnrichedBusiness> {
  const canonical_domain = normalizeDomain(raw.website);
  const normalized_phone = normalizePhone(raw.phone, raw.country || 'US');

  let inspection: WebsiteInspectionResult = {
    has_online_booking: false,
    contact_channels: raw.phone ? ['phone'] : [],
    observed_friction: [],
    services: [],
    evidence_urls: raw.website ? [raw.website] : [],
    snippet_for_ai: '',
  };

  if (inspectSite && raw.website) {
    try {
      inspection = await inspectWebsite(raw.website, raw.phone);
    } catch (err: any) {
      console.warn(`[Enrichment] Website inspection failed for ${raw.name}:`, err.message);
    }
  }

  // Consolidate contact channels
  const channels = new Set<string>(inspection.contact_channels);
  if (raw.phone) channels.add('phone');
  if (raw.google_maps_url) channels.add('google_maps');

  const evidenceUrls = [...(inspection.evidence_urls || [])];
  if (raw.google_maps_url && !evidenceUrls.includes(raw.google_maps_url)) {
    evidenceUrls.push(raw.google_maps_url);
  }

  return {
    name: raw.name,
    category: raw.category,
    subcategory: raw.subcategory,
    phone: raw.phone,
    normalized_phone: normalized_phone || undefined,
    email: inspection.email,
    website: raw.website,
    canonical_domain: canonical_domain || undefined,
    address: raw.address,
    city: raw.city,
    state: raw.state,
    country: raw.country || 'US',
    rating: raw.rating,
    review_count: raw.review_count,
    place_id: raw.place_id,
    google_maps_url: raw.google_maps_url,
    booking_url: inspection.booking_url,
    has_online_booking: inspection.has_online_booking,
    contact_channels: Array.from(channels),
    observed_friction: inspection.observed_friction,
    evidence_urls: evidenceUrls,
    snippet_for_ai: inspection.snippet_for_ai,
    discovery_source: raw.source || 'places_api',
    last_enriched_at: new Date().toISOString(),
  };
}
