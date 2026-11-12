/**
 * Utilities for normalizing, extracting, and validating Instagram handles and profile URLs.
 */

const IG_RESERVED_PATHS = new Set([
  'p',
  'reel',
  'reels',
  'stories',
  'explore',
  'direct',
  'accounts',
  'tv',
  'about',
  'developer',
  'legal',
  'privacy',
  'terms',
  'directory',
]);

/**
 * Extracts and normalizes an Instagram username from raw handle text or Instagram URL.
 * Examples:
 *  - "@John.Doe " -> "john.doe"
 *  - "https://www.instagram.com/john.doe/?igsh=abc" -> "john.doe"
 *  - "instagram.com/john_doe/" -> "john_doe"
 */
export function normalizeInstagramHandle(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  let val = raw.trim();
  if (!val) return '';

  // Handle URL forms
  if (/instagram\.com/i.test(val) || /^https?:\/\//i.test(val)) {
    try {
      const urlStr = /^https?:\/\//i.test(val) ? val : `https://${val}`;
      const parsed = new URL(urlStr);
      if (parsed.hostname.toLowerCase().includes('instagram.com')) {
        const segments = parsed.pathname.split('/').filter(Boolean);
        if (segments.length > 0 && !IG_RESERVED_PATHS.has(segments[0].toLowerCase())) {
          val = segments[0];
        } else {
          return '';
        }
      }
    } catch {
      // Fallback regex extraction if URL constructor fails
      const match = val.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
      if (match && !IG_RESERVED_PATHS.has(match[1].toLowerCase())) {
        val = match[1];
      }
    }
  }

  // Strip leading @, trailing slashes, and whitespace
  val = val.replace(/^@+/, '').replace(/\/+$/, '').trim().toLowerCase();

  // Strip query or fragment if still attached
  val = val.split(/[?#]/)[0].trim();

  return val;
}

/**
 * Validates Instagram handle syntax: 1-30 chars of letters, numbers, periods, underscores.
 * Cannot start/end with period or contain consecutive periods.
 */
export function isValidInstagramHandle(handle?: string | null): boolean {
  const normalized = normalizeInstagramHandle(handle);
  if (!normalized) return false;
  if (normalized.length < 1 || normalized.length > 30) return false;
  if (!/^[a-z0-9._]+$/.test(normalized)) return false;
  if (normalized.startsWith('.') || normalized.endsWith('.') || normalized.includes('..')) return false;
  if (IG_RESERVED_PATHS.has(normalized)) return false;
  return true;
}

/**
 * Formats a normalized handle with a leading '@' for display.
 */
export function formatInstagramHandle(handle?: string | null): string {
  const normalized = normalizeInstagramHandle(handle);
  return normalized ? `@${normalized}` : '';
}

/**
 * Builds canonical Instagram profile URL from a handle.
 */
export function buildInstagramUrl(handle?: string | null): string {
  const normalized = normalizeInstagramHandle(handle);
  return normalized ? `https://www.instagram.com/${normalized}/` : '';
}
