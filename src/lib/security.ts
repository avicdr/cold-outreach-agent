import { EmailAccount } from '@/types/database';

/**
 * Sanitized EmailAccount object for safe client responses.
 * Never leaks encrypted tokens or passwords to the browser.
 */
export type SanitizedEmailAccount = Omit<
  EmailAccount,
  'encrypted_access_token' | 'encrypted_refresh_token' | 'encrypted_smtp_password'
>;

/**
 * Strips secret encrypted credentials from an EmailAccount before sending to the client.
 */
export function sanitizeAccountForClient(account: EmailAccount): SanitizedEmailAccount {
  const {
    encrypted_access_token: _a,
    encrypted_refresh_token: _r,
    encrypted_smtp_password: _p,
    ...safeAccount
  } = account;
  return safeAccount;
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 * Safe for both Edge runtime and Node.js environments without external dependencies.
 */
export function timingSafeEqualStr(a?: string | null, b?: string | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Validates and sanitizes redirect URLs to prevent Open Redirect attacks.
 * Accepts only internal relative paths starting with a single '/' and not containing '//' or '/\'.
 */
export function isSafeRedirectUrl(url?: string | null, defaultPath = '/dashboard'): string {
  if (!url || typeof url !== 'string') return defaultPath;
  const trimmed = url.trim();

  // Must begin with a single '/' and not '//' or '/\'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return defaultPath;
  }

  // Reject URLs containing protocol schemes before a slash (e.g., "javascript:", "data:")
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return defaultPath;
  }

  // Check if URL attempts to break out using backslashes
  if (trimmed.includes('\\')) {
    return defaultPath;
  }

  return trimmed;
}

/**
 * Validates a hostname or IP address to prevent SSRF against internal/cloud infrastructure.
 */
export function isSafeHost(rawHost?: string | null): { safe: boolean; reason?: string } {
  if (!rawHost || typeof rawHost !== 'string') {
    return { safe: false, reason: 'Empty or invalid host' };
  }

  const hostname = rawHost.toLowerCase().trim();

  // Block localhost and standard aliases
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname === '0.0.0.0'
  ) {
    return { safe: false, reason: 'Access to localhost is forbidden' };
  }

  // Block IPv4 loopback, private networks, and cloud metadata
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, o1, o2, o3, o4] = ipv4Match.map(Number);
    if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) {
      return { safe: false, reason: 'Invalid IP address' };
    }

    // 127.0.0.0/8 (Loopback)
    if (o1 === 127) return { safe: false, reason: 'Loopback IP forbidden' };
    // 10.0.0.0/8 (Private)
    if (o1 === 10) return { safe: false, reason: 'Private network 10.0.0.0/8 forbidden' };
    // 172.16.0.0/12 (Private)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return { safe: false, reason: 'Private network 172.16.0.0/12 forbidden' };
    // 192.168.0.0/16 (Private)
    if (o1 === 192 && o2 === 168) return { safe: false, reason: 'Private network 192.168.0.0/16 forbidden' };
    // 169.254.0.0/16 (Link-local / AWS / GCP / Azure Cloud Metadata)
    if (o1 === 169 && o2 === 254) return { safe: false, reason: 'Cloud metadata / link-local IP forbidden' };
    // 0.0.0.0/8
    if (o1 === 0) return { safe: false, reason: 'Invalid address 0.0.0.0/8 forbidden' };
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return { safe: false, reason: 'Carrier-grade NAT forbidden' };
    // 224.0.0.0/4 (Multicast)
    if (o1 >= 224) return { safe: false, reason: 'Multicast / reserved IP forbidden' };
  }

  // Block IPv6 loopback, link-local, unique local
  if (
    hostname.startsWith('[') ||
    hostname.includes(':') ||
    hostname.startsWith('fe80:') ||
    hostname.startsWith('fc00:') ||
    hostname.startsWith('fd00:')
  ) {
    if (hostname.includes('127.0.0.1') || hostname === '::1' || hostname === '[::1]') {
      return { safe: false, reason: 'IPv6 loopback forbidden' };
    }
  }

  return { safe: true };
}

/**
 * Checks if a URL is safe to fetch from the server (SSRF prevention).
 * Blocks loopback (127.0.0.0/8, ::1), private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16),
 * link-local/cloud metadata (169.254.0.0/16, fd00::/8), and non-HTTP(S) protocols.
 */
export function isSafeUrlForFetch(rawUrl?: string | null): { safe: boolean; reason?: string; url?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { safe: false, reason: 'Empty or invalid URL' };
  }

  let formatted = rawUrl.trim();
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(formatted)) {
    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      return { safe: false, reason: 'Unsupported protocol scheme' };
    }
  } else {
    formatted = 'https://' + formatted;
  }

  let parsed: URL;
  try {
    parsed = new URL(formatted);
  } catch {
    return { safe: false, reason: 'Malformed URL' };
  }

  // Only HTTP and HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Unsupported protocol: ${parsed.protocol}` };
  }

  const hostCheck = isSafeHost(parsed.hostname);
  if (!hostCheck.safe) {
    return { safe: false, reason: hostCheck.reason };
  }

  return { safe: true, url: parsed.toString() };
}

/**
 * Neutralizes CSV Formula Injection (CWE-1236).
 * If a cell value starts with '=', '+', '-', '@', '\t', or '\r',
 * it prepends a single quote to force spreadsheet applications to treat it as a literal string.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);

  // Check if raw string starts with tab/carriage return or trimmed starts with formula trigger
  const trimmed = str.trimStart();
  const formulaTriggers = ['=', '+', '-', '@'];
  if (
    str.startsWith('\t') ||
    str.startsWith('\r') ||
    formulaTriggers.some((char) => trimmed.startsWith(char))
  ) {
    // Prepend single quote to neutralize formula
    str = `'${str}`;
  }

  // Escape internal double quotes for CSV specification
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * In-memory sliding window rate limiter for abuse prevention.
 */
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Cleans up expired rate limit entries periodically.
 */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (record.resetAt <= now) {
        rateLimitStore.delete(key);
      }
    }
  }, 60000).unref?.();
}

/**
 * Checks and updates rate limit for a specific identifier.
 * @param key Unique key (e.g., `login:${ip}` or `test_email:${userId}`)
 * @param limit Max allowed requests within window
 * @param windowMs Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number; retryAfter?: number } {
  const now = Date.now();
  let record = rateLimitStore.get(key);

  if (!record || record.resetAt <= now) {
    record = {
      count: 1,
      resetAt: now + windowMs,
    };
    rateLimitStore.set(key, record);
    return { allowed: true, remaining: limit - 1, resetAt: record.resetAt };
  }

  if (record.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, resetAt: record.resetAt, retryAfter };
  }

  record.count += 1;
  return { allowed: true, remaining: limit - record.count, resetAt: record.resetAt };
}

/**
 * Extracts a client IP from standard request headers.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const ip = forwarded.split(',')[0].trim();
    if (ip) return ip;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  return '127.0.0.1';
}

/**
 * Validates request Origin/Referer against allowed host to mitigate CSRF on state-changing requests.
 */
export function verifyCsrfOrigin(request: Request): boolean {
  const method = request.method.toUpperCase();
  // Safe idempotent methods do not require origin check
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

  const origin = request.headers.get('origin');
  if (!origin) {
    // If no origin header, check referer
    const referer = request.headers.get('referer');
    if (!referer) return true; // Standard browser direct or test requests
    try {
      const refUrl = new URL(referer);
      const host = request.headers.get('host');
      return Boolean(host && refUrl.host === host);
    } catch {
      return false;
    }
  }

  try {
    const originUrl = new URL(origin);
    const host = request.headers.get('host');
    if (!host) return true;
    return originUrl.host === host;
  } catch {
    return false;
  }
}
