export interface DiscoveredBusinessRaw {
  name: string;
  category: string;
  subcategory?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  rating?: number;
  review_count?: number;
  place_id?: string;
  google_maps_url?: string;
  source: 'google_places' | 'osm' | 'mock' | string;
  raw_data?: Record<string, unknown>;
}

export interface DiscoverySearchParams {
  niche: string;
  location: string;
  country?: string;
  radius_km?: number;
  target_count?: number;
}

export interface DiscoveryProvider {
  name: string;
  isAvailable(): boolean;
  discover(params: DiscoverySearchParams): Promise<DiscoveredBusinessRaw[]>;
}
