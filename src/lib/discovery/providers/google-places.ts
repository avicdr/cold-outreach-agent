import { DiscoveryProvider, DiscoverySearchParams, DiscoveredBusinessRaw } from './types';

export class GooglePlacesProvider implements DiscoveryProvider {
  name = 'google_places';

  private getApiKey(): string | undefined {
    return process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  }

  isAvailable(): boolean {
    return Boolean(this.getApiKey());
  }

  async discover(params: DiscoverySearchParams): Promise<DiscoveredBusinessRaw[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Google Maps / Places API key is not configured.');
    }

    const targetCount = params.target_count || 20;
    const query = `${params.niche} in ${params.location}`;
    const results: DiscoveredBusinessRaw[] = [];

    try {
      // 1. Try Google Places New API (v1/places:searchText)
      const url = 'https://places.googleapis.com/v1/places:searchText';
      const body = {
        textQuery: query,
        pageSize: Math.min(targetCount, 20),
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryType,places.addressComponents',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const data = await response.json();
        const places = data.places || [];

        for (const place of places) {
          // Parse city, state, country from address components if available
          let city = '';
          let state = '';
          let country = params.country || '';

          if (Array.isArray(place.addressComponents)) {
            for (const comp of place.addressComponents) {
              if (comp.types?.includes('locality')) city = comp.longText || comp.shortText || '';
              if (comp.types?.includes('administrative_area_level_1')) state = comp.shortText || comp.longText || '';
              if (comp.types?.includes('country')) country = comp.shortText || comp.longText || country;
            }
          }

          results.push({
            name: place.displayName?.text || 'Unknown Business',
            category: params.niche,
            subcategory: place.primaryType || undefined,
            phone: place.internationalPhoneNumber || place.nationalPhoneNumber || undefined,
            website: place.websiteUri || undefined,
            address: place.formattedAddress || undefined,
            city: city || undefined,
            state: state || undefined,
            country: country || undefined,
            rating: typeof place.rating === 'number' ? place.rating : undefined,
            review_count: typeof place.userRatingCount === 'number' ? place.userRatingCount : undefined,
            place_id: place.id || undefined,
            google_maps_url: place.googleMapsUri || (place.id ? `https://www.google.com/maps/place/?q=place_id:${place.id}` : undefined),
            source: 'google_places',
            raw_data: place,
          });

          if (results.length >= targetCount) break;
        }

        return results;
      }

      // 2. Fallback to Google Places Legacy API if v1 is not enabled or returns 403
      const legacyUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
      legacyUrl.searchParams.set('query', query);
      legacyUrl.searchParams.set('key', apiKey);

      const legacyRes = await fetch(legacyUrl.toString(), {
        signal: AbortSignal.timeout(15000),
      });

      if (!legacyRes.ok) {
        const errText = await legacyRes.text();
        throw new Error(`Google Places API request failed: ${legacyRes.status} ${errText}`);
      }

      const legacyData = await legacyRes.json();
      if (legacyData.status !== 'OK' && legacyData.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API error status: ${legacyData.status} - ${legacyData.error_message || ''}`);
      }

      const legacyPlaces = legacyData.results || [];
      for (const place of legacyPlaces) {
        results.push({
          name: place.name,
          category: params.niche,
          address: place.formatted_address,
          rating: place.rating,
          review_count: place.user_ratings_total,
          place_id: place.place_id,
          google_maps_url: place.place_id ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}` : undefined,
          source: 'google_places',
          raw_data: place,
        });

        if (results.length >= targetCount) break;
      }

      return results;
    } catch (err: any) {
      console.error('[GooglePlacesProvider] Error discovering businesses:', err.message);
      throw err;
    }
  }
}
