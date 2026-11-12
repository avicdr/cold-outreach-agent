import { RawLeadRow } from '@/lib/csv-excel';
import {
  normalizeInstagramHandle,
  isValidInstagramHandle,
  formatInstagramHandle,
  buildInstagramUrl,
} from './handles';

export interface InstagramColumnMapping {
  instagram_handle?: string;
  instagram_url?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  niche?: string;
  bio?: string;
  followers_count?: string;
  website?: string;
  city?: string;
  country?: string;
  email?: string;
  phone?: string;
  personalization_hook?: string;
  notes?: string;
}

export interface ParsedInstagramLead {
  instagram_handle: string;
  normalized_handle: string;
  instagram_url: string;
  full_name: string;
  first_name: string;
  last_name: string;
  company: string;
  niche: string;
  bio: string;
  followers_count: number | null;
  website: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  personalization_hook: string;
  notes: string;
  group_id?: string | null;
  custom_fields: Record<string, string | number | boolean>;
}

export interface InstagramImportResult {
  validLeads: ParsedInstagramLead[];
  duplicatesInFile: number;
  invalidRows: { rowNumber: number; raw: RawLeadRow; reason: string }[];
  totalRows: number;
}

export function autoDetectInstagramColumnMapping(headers: string[]): InstagramColumnMapping {
  const mapping: InstagramColumnMapping = {};
  const normalizedHeaders = headers.map((h) => ({
    original: h,
    clean: h.toLowerCase().trim().replace(/[-_ ]/g, ''),
  }));

  for (const { original, clean } of normalizedHeaders) {
    if (
      !mapping.instagram_handle &&
      ['instagramhandle', 'ighandle', 'handle', 'instagram', 'ig', 'instagramusername', 'igusername', 'username', 'account'].includes(clean)
    ) {
      mapping.instagram_handle = original;
    } else if (
      !mapping.instagram_url &&
      ['instagramurl', 'igurl', 'instagramlink', 'iglink', 'profileurl', 'instagramprofile'].includes(clean)
    ) {
      mapping.instagram_url = original;
    } else if (!mapping.first_name && ['firstname', 'fname', 'givenname'].includes(clean)) {
      mapping.first_name = original;
    } else if (!mapping.last_name && ['lastname', 'lname', 'surname'].includes(clean)) {
      mapping.last_name = original;
    } else if (!mapping.full_name && ['fullname', 'name', 'contactname', 'creatorname', 'foundername'].includes(clean)) {
      mapping.full_name = original;
    } else if (!mapping.company && ['company', 'companyname', 'business', 'businessname', 'brand', 'brandname', 'org'].includes(clean)) {
      mapping.company = original;
    } else if (!mapping.niche && ['niche', 'category', 'industry', 'vertical', 'categoryniche'].includes(clean)) {
      mapping.niche = original;
    } else if (!mapping.bio && ['bio', 'biography', 'igbio', 'instagrambio', 'description', 'about'].includes(clean)) {
      mapping.bio = original;
    } else if (!mapping.followers_count && ['followers', 'followerscount', 'followercount', 'igfollowers'].includes(clean)) {
      mapping.followers_count = original;
    } else if (!mapping.website && ['website', 'websiteurl', 'url', 'domain', 'site', 'linkinbio'].includes(clean)) {
      mapping.website = original;
    } else if (!mapping.city && ['city', 'cityarea', 'location', 'area'].includes(clean)) {
      mapping.city = original;
    } else if (!mapping.country && ['country'].includes(clean)) {
      mapping.country = original;
    } else if (!mapping.email && ['email', 'emailaddress', 'contactemail'].includes(clean)) {
      mapping.email = original;
    } else if (!mapping.phone && ['phone', 'phonenumber', 'mobile', 'tel'].includes(clean)) {
      mapping.phone = original;
    } else if (
      !mapping.personalization_hook &&
      ['personalizationhook', 'hook', 'dmhook', 'outreachhook', 'suggestedopening', 'icebreaker'].includes(clean)
    ) {
      mapping.personalization_hook = original;
    } else if (!mapping.notes && ['notes', 'note', 'summary', 'context', 'details'].includes(clean)) {
      mapping.notes = original;
    }
  }

  return mapping;
}

function parseFollowersNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim().toLowerCase().replace(/,/g, '');
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*([km])?$/i);
  if (m) {
    const num = parseFloat(m[1]);
    if (isNaN(num)) return null;
    if (m[2]?.toLowerCase() === 'k') return Math.round(num * 1000);
    if (m[2]?.toLowerCase() === 'm') return Math.round(num * 1000000);
    return Math.round(num);
  }
  const parsed = parseInt(s, 10);
  return isNaN(parsed) ? null : parsed;
}

export function processInstagramImportRows(
  rows: RawLeadRow[],
  mapping: InstagramColumnMapping,
  existingNormalizedHandles: Set<string> = new Set(),
  defaultGroupId?: string | null,
  options?: { allowMissingHandle?: boolean }
): InstagramImportResult {
  const validLeads: ParsedInstagramLead[] = [];
  const seenHandles = new Set<string>();
  const invalidRows: { rowNumber: number; raw: RawLeadRow; reason: string }[] = [];
  let duplicatesInFile = 0;
  const allowMissingHandle = Boolean(options?.allowMissingHandle);

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const rawHandle = mapping.instagram_handle ? String(row[mapping.instagram_handle] ?? '').trim() : '';
    const rawUrl = mapping.instagram_url ? String(row[mapping.instagram_url] ?? '').trim() : '';

    const normalized = normalizeInstagramHandle(rawHandle || rawUrl);

    if (!normalized) {
      if (!allowMissingHandle) {
        invalidRows.push({ rowNumber, raw: row, reason: 'Missing Instagram handle or profile URL' });
        return;
      }
    } else {
      if (!isValidInstagramHandle(normalized)) {
        invalidRows.push({
          rowNumber,
          raw: row,
          reason: `Invalid Instagram handle format: "${rawHandle || rawUrl}"`,
        });
        return;
      }

      if (seenHandles.has(normalized)) {
        duplicatesInFile++;
        invalidRows.push({ rowNumber, raw: row, reason: `Duplicate handle in file: "@${normalized}"` });
        return;
      }
      seenHandles.add(normalized);

      if (existingNormalizedHandles.has(normalized)) {
        invalidRows.push({ rowNumber, raw: row, reason: `Handle already exists in Instagram Leads: "@${normalized}"` });
        return;
      }
    }

    let firstName = mapping.first_name ? String(row[mapping.first_name] ?? '').trim() : '';
    let lastName = mapping.last_name ? String(row[mapping.last_name] ?? '').trim() : '';
    const fullNameRaw = mapping.full_name ? String(row[mapping.full_name] ?? '').trim() : '';

    if (!firstName && fullNameRaw) {
      const parts = fullNameRaw.split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }
    const fullName = fullNameRaw || [firstName, lastName].filter(Boolean).join(' ');

    const company = mapping.company ? String(row[mapping.company] ?? '').trim() : '';
    const niche = mapping.niche ? String(row[mapping.niche] ?? '').trim() : '';
    const bio = mapping.bio ? String(row[mapping.bio] ?? '').trim() : '';
    const followersCount = mapping.followers_count ? parseFollowersNumber(row[mapping.followers_count]) : null;
    const website = mapping.website ? String(row[mapping.website] ?? '').trim() : '';
    const city = mapping.city ? String(row[mapping.city] ?? '').trim() : '';
    const country = mapping.country ? String(row[mapping.country] ?? '').trim() : '';
    const email = mapping.email ? String(row[mapping.email] ?? '').trim() : '';
    const phone = mapping.phone ? String(row[mapping.phone] ?? '').trim() : '';
    const hook = mapping.personalization_hook ? String(row[mapping.personalization_hook] ?? '').trim() : '';
    const notes = mapping.notes ? String(row[mapping.notes] ?? '').trim() : '';

    // Ensure at least a handle or identifying name/company exists if allowMissingHandle is true
    if (allowMissingHandle && !normalized && !fullName && !company && !email) {
      invalidRows.push({ rowNumber, raw: row, reason: 'Empty row (missing handle, name, company, and email)' });
      return;
    }

    const mappedKeys = new Set(
      Object.values(mapping).filter((v): v is string => typeof v === 'string' && v.length > 0)
    );

    const customFields: Record<string, string | number | boolean> = {};
    for (const [key, val] of Object.entries(row)) {
      if (val !== undefined && val !== null && val !== '') {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        if (!mappedKeys.has(key)) {
          customFields[key] = typeof val === 'object' ? JSON.stringify(val) : val;
        }
      }
    }

    validLeads.push({
      instagram_handle: normalized ? formatInstagramHandle(normalized) : '',
      normalized_handle: normalized,
      instagram_url: rawUrl || (normalized ? buildInstagramUrl(normalized) : ''),
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      company,
      niche,
      bio,
      followers_count: followersCount,
      website,
      city,
      country,
      email,
      phone,
      personalization_hook: hook,
      notes,
      group_id: defaultGroupId || null,
      custom_fields: customFields,
    });
  });

  return {
    validLeads,
    duplicatesInFile,
    invalidRows,
    totalRows: rows.length,
  };
}
