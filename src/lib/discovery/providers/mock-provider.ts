import { DiscoveryProvider, DiscoverySearchParams, DiscoveredBusinessRaw } from './types';

export class MockDiscoveryProvider implements DiscoveryProvider {
  name = 'mock';

  isAvailable(): boolean {
    return true;
  }

  async discover(params: DiscoverySearchParams): Promise<DiscoveredBusinessRaw[]> {
    const targetCount = params.target_count || 10;
    const niche = params.niche.toLowerCase();
    const location = params.location || 'Austin, TX';

    // Generates realistic appointment-based businesses based on niche
    const samples: DiscoveredBusinessRaw[] = [];

    if (niche.includes('dent') || niche.includes('orthodont')) {
      samples.push(
        {
          name: `${location.split(',')[0]} Family & Cosmetic Dentistry`,
          category: 'Dentistry',
          subcategory: 'Cosmetic Dentistry',
          phone: '+1 (512) 555-0143',
          website: 'https://austinfamilycosmeticdental.com',
          address: `1044 Medical Park Blvd, ${location}`,
          city: location.split(',')[0].trim(),
          country: params.country || 'US',
          rating: 4.8,
          review_count: 142,
          place_id: 'mock-place-dent-1',
          google_maps_url: 'https://maps.google.com/?cid=1001',
          source: 'mock',
        },
        {
          name: `Premier Orthodontics & Dental Care`,
          category: 'Orthodontics',
          phone: '+1 (512) 555-0199',
          website: 'https://premierorthotx.com',
          address: `450 South Congress Ave, ${location}`,
          city: location.split(',')[0].trim(),
          country: params.country || 'US',
          rating: 4.6,
          review_count: 88,
          place_id: 'mock-place-dent-2',
          google_maps_url: 'https://maps.google.com/?cid=1002',
          source: 'mock',
        }
      );
    } else if (niche.includes('derma') || niche.includes('aesthetic') || niche.includes('skin')) {
      samples.push(
        {
          name: `Elysium Aesthetic & Dermatology Institute`,
          category: 'Dermatology & Aesthetics',
          subcategory: 'Medical Spa',
          phone: '+1 (512) 555-0211',
          website: 'https://elysiumaesthetics.com',
          address: `780 West 6th Street, ${location}`,
          city: location.split(',')[0].trim(),
          country: params.country || 'US',
          rating: 4.9,
          review_count: 215,
          place_id: 'mock-place-derm-1',
          google_maps_url: 'https://maps.google.com/?cid=1003',
          source: 'mock',
        },
        {
          name: `ClearSkin Dermatology Clinic`,
          category: 'Dermatology',
          phone: '+1 (512) 555-0288',
          website: 'https://clearskindermclinic.com',
          address: `1200 Barton Springs Rd, ${location}`,
          city: location.split(',')[0].trim(),
          country: params.country || 'US',
          rating: 4.5,
          review_count: 67,
          place_id: 'mock-place-derm-2',
          google_maps_url: 'https://maps.google.com/?cid=1004',
          source: 'mock',
        }
      );
    } else if (niche.includes('physio') || niche.includes('rehab')) {
      samples.push(
        {
          name: `Apex Physical Therapy & Spine Center`,
          category: 'Physiotherapy',
          phone: '+1 (512) 555-0322',
          website: 'https://apexphysiotherapy.com',
          address: `3300 North Lamar Blvd, ${location}`,
          city: location.split(',')[0].trim(),
          country: params.country || 'US',
          rating: 4.7,
          review_count: 94,
          place_id: 'mock-place-phys-1',
          google_maps_url: 'https://maps.google.com/?cid=1005',
          source: 'mock',
        }
      );
    } else {
      // General appointment-based clinic
      samples.push(
        {
          name: `${location.split(',')[0]} Wellness & Specialty Clinic`,
          category: params.niche,
          phone: '+1 (512) 555-0455',
          website: `https://${params.niche.toLowerCase().replace(/[^a-z0-9]/g, '')}-clinic.com`,
          address: `500 Downtown Blvd, ${location}`,
          city: location.split(',')[0].trim(),
          country: params.country || 'US',
          rating: 4.6,
          review_count: 110,
          place_id: `mock-place-${Date.now()}-1`,
          google_maps_url: 'https://maps.google.com/?cid=1006',
          source: 'mock',
        },
        {
          name: `Elite Care ${params.niche} Group`,
          category: params.niche,
          phone: '+1 (512) 555-0488',
          website: `https://elitecare-${params.niche.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
          address: `8200 Research Blvd, ${location}`,
          city: location.split(',')[0].trim(),
          country: params.country || 'US',
          rating: 4.4,
          review_count: 53,
          place_id: `mock-place-${Date.now()}-2`,
          google_maps_url: 'https://maps.google.com/?cid=1007',
          source: 'mock',
        }
      );
    }

    return samples.slice(0, targetCount);
  }
}
