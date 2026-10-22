import { DiscoveryProvider, DiscoverySearchParams, DiscoveredBusinessRaw } from './types';

export class OpenStreetMapProvider implements DiscoveryProvider {
  name = 'osm';

  isAvailable(): boolean {
    return true; // Always available as a free, public directory
  }

  private mapNicheToOsmTags(niche: string): { key: string; value: string }[] {
    const lower = niche.toLowerCase();
    if (lower.includes('dentist') || lower.includes('dental') || lower.includes('orthodont')) {
      return [{ key: 'amenity', value: 'dentist' }];
    }
    if (lower.includes('physio') || lower.includes('rehab')) {
      return [
        { key: 'healthcare', value: 'physiotherapist' },
        { key: 'amenity', value: 'clinic' },
      ];
    }
    if (lower.includes('derma') || lower.includes('aesthetic') || lower.includes('skin')) {
      return [
        { key: 'healthcare', value: 'clinic' },
        { key: 'amenity', value: 'clinic' },
        { key: 'shop', value: 'beauty' },
      ];
    }
    if (lower.includes('eye') || lower.includes('optom')) {
      return [{ key: 'shop', value: 'optician' }];
    }
    if (lower.includes('vet') || lower.includes('animal')) {
      return [{ key: 'amenity', value: 'veterinary' }];
    }
    if (lower.includes('salon') || lower.includes('spa') || lower.includes('hair') || lower.includes('beauty')) {
      return [
        { key: 'shop', value: 'beauty' },
        { key: 'shop', value: 'hairdresser' },
      ];
    }
    if (lower.includes('lawyer') || lower.includes('legal') || lower.includes('attorney')) {
      return [{ key: 'office', value: 'lawyer' }];
    }
    // Default medical/clinic
    return [
      { key: 'amenity', value: 'clinic' },
      { key: 'amenity', value: 'doctors' },
    ];
  }

  async discover(params: DiscoverySearchParams): Promise<DiscoveredBusinessRaw[]> {
    const targetCount = params.target_count || 20;
    const tags = this.mapNicheToOsmTags(params.niche);
    const cleanedLocation = params.location.replace(/[^a-zA-Z0-9\s,.-]/g, '').trim();

    // Query OSM Overpass API
    // Using geocode search or area name
    const tagFilters = tags
      .map((t) => `node["${t.key}"="${t.value}"](area.searchArea); way["${t.key}"="${t.value}"](area.searchArea);`)
      .join('\n');

    // Overpass QL query
    const query = `
      [out:json][timeout:25];
      area[name="${cleanedLocation}"]->.searchArea;
      (
        ${tagFilters}
      );
      out center tags ${targetCount * 2};
    `;

    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'ColdOutreachAgent/1.0',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        throw new Error(`OSM Overpass returned ${response.status}`);
      }

      const data = await response.json();
      const elements = data.elements || [];
      const results: DiscoveredBusinessRaw[] = [];

      for (const el of elements) {
        const t = el.tags || {};
        const name = t.name || t['name:en'] || t['brand'];
        if (!name) continue;

        const phone = t.phone || t['contact:phone'] || t['contact:mobile'] || undefined;
        const website = t.website || t['contact:website'] || undefined;
        const street = t['addr:street'] ? `${t['addr:housenumber'] || ''} ${t['addr:street']}`.trim() : undefined;
        const city = t['addr:city'] || params.location;
        const country = t['addr:country'] || params.country;

        results.push({
          name,
          category: params.niche,
          subcategory: t.amenity || t.healthcare || t.shop || undefined,
          phone,
          website,
          address: street ? `${street}, ${city}` : city,
          city,
          country,
          place_id: `osm-${el.type}-${el.id}`,
          source: 'osm',
          raw_data: t,
        });

        if (results.length >= targetCount) break;
      }

      return results;
    } catch (err: any) {
      console.warn('[OpenStreetMapProvider] Overpass query failed or timed out:', err.message);
      return [];
    }
  }
}
