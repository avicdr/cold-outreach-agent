import { DiscoveryProvider, DiscoverySearchParams, DiscoveredBusinessRaw } from './types';
import { GooglePlacesProvider } from './google-places';
import { OpenStreetMapProvider } from './osm-provider';
import { MockDiscoveryProvider } from './mock-provider';

export * from './types';
export * from './google-places';
export * from './osm-provider';
export * from './mock-provider';

export function getDiscoveryProvider(preference?: string): DiscoveryProvider {
  if (preference === 'mock') {
    return new MockDiscoveryProvider();
  }

  const google = new GooglePlacesProvider();
  if (preference === 'google_places') {
    if (google.isAvailable()) return google;
  }

  if (google.isAvailable()) {
    return google;
  }

  // Permitted open directory fallback
  return new OpenStreetMapProvider();
}

export async function discoverBusinesses(
  params: DiscoverySearchParams,
  preference?: string
): Promise<DiscoveredBusinessRaw[]> {
  const provider = getDiscoveryProvider(preference);
  
  try {
    const results = await provider.discover(params);
    if (results.length > 0) {
      return results;
    }
  } catch (err: any) {
    console.warn(`[Discovery] Provider ${provider.name} failed:`, err.message);
  }

  // If primary provider returned no results or failed, try OSM fallback if primary wasn't already OSM
  if (provider.name !== 'osm') {
    try {
      const osm = new OpenStreetMapProvider();
      const osmResults = await osm.discover(params);
      if (osmResults.length > 0) {
        return osmResults;
      }
    } catch (err: any) {
      console.warn('[Discovery] OSM fallback also failed:', err.message);
    }
  }

  // In test or development, fallback to mock if no live data found
  if (process.env.NODE_ENV === 'test' || !process.env.GOOGLE_MAPS_API_KEY) {
    const mock = new MockDiscoveryProvider();
    return mock.discover(params);
  }

  return [];
}
