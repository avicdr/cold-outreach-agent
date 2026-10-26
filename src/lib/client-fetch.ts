/**
 * Lightweight in-memory client-side fetch cache and request deduplicator.
 * Provides stale-while-revalidate semantics, in-flight request coalescing,
 * and cache invalidation without requiring heavy external dependencies.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const clientCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

// Default cache TTL: 30 seconds fresh
const DEFAULT_TTL_MS = 30_000;

export interface FetchOptions extends RequestInit {
  ttlMs?: number;
  skipCache?: boolean;
}

/**
 * Fetches JSON with in-flight deduplication and stale-while-revalidate caching.
 */
export async function cachedJsonFetch<T>(
  url: string,
  options?: FetchOptions
): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const ttl = options?.ttlMs ?? DEFAULT_TTL_MS;
  const skipCache = options?.skipCache || method !== 'GET';

  // For non-GET requests, execute directly without caching
  if (skipCache) {
    const res = await fetch(url, options);
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  const cacheKey = url;
  const cached = clientCache.get(cacheKey) as CacheEntry<T> | undefined;
  const now = Date.now();

  // If in-flight request already exists for this URL, coalesce to avoid duplicate network calls
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey) as Promise<T>;
  }

  // If cache is valid and fresh, return immediately
  if (cached && now - cached.timestamp < ttl) {
    return cached.data;
  }

  // If stale cache exists, trigger background revalidation and return stale data immediately (SWR)
  if (cached) {
    // Background revalidation
    fetchFresh(url, options, cacheKey).catch(() => {
      // Background revalidation error silently handled
    });
    return cached.data;
  }

  // No cache available; perform fresh fetch
  return fetchFresh<T>(url, options, cacheKey);
}

async function fetchFresh<T>(
  url: string,
  options: FetchOptions | undefined,
  cacheKey: string
): Promise<T> {
  const fetchPromise = (async () => {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const data = (await res.json()) as T;
      clientCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Invalidates cached items matching a prefix or pattern.
 * Call after mutations (POST/PATCH/DELETE).
 */
export function invalidateClientCache(urlPrefix?: string): void {
  if (!urlPrefix) {
    clientCache.clear();
    return;
  }
  for (const key of clientCache.keys()) {
    if (key.startsWith(urlPrefix)) {
      clientCache.delete(key);
    }
  }
}
