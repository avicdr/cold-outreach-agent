import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeDomain, normalizePhone, enrichDiscoveredBusiness } from '@/lib/discovery/enrichment';
import {
  evaluateHeuristicQualification,
  LeadQualificationResultSchema,
  DEFAULT_RUBRIC_CONFIG,
} from '@/lib/discovery/qualification';
import { MockDiscoveryProvider, getDiscoveryProvider } from '@/lib/discovery/providers';
import { dbService } from '@/lib/db-service';
import { mockDb } from '@/lib/supabase/mock-db';
import { executeDiscoveryJob } from '@/lib/discovery/service';
import { GET as jobsGet, POST as jobsPost } from '@/app/api/discovery/jobs/route';
import { GET as leadsGet } from '@/app/api/discovery/leads/route';
import { POST as enrollPost } from '@/app/api/discovery/leads/enroll/route';
import { GET as exportGet } from '@/app/api/discovery/export/route';

describe('AI Lead Discovery, Enrichment & Qualification System', () => {
  const testUserId = '5f9832c0-d340-4e0f-b2d8-b3f44a294697';

  beforeEach(() => {
    // Reset mock database state
    mockDb.discoveryJobs.clear();
    mockDb.leads.clear();
    mockDb.campaigns.clear();
    mockDb.campaignLeads.clear();
  });

  describe('1. Data Normalization', () => {
    it('normalizes domains accurately to canonical format', () => {
      expect(normalizeDomain('https://www.AustinFamilyDental.com/contact/')).toBe('austinfamilydental.com');
      expect(normalizeDomain('http://clinic.org/team?id=5')).toBe('clinic.org');
      expect(normalizeDomain('WWW.CLEARSKIN.CO.UK')).toBe('clearskin.co.uk');
      expect(normalizeDomain(undefined)).toBeNull();
      expect(normalizeDomain('')).toBeNull();
    });

    it('normalizes telephone numbers to standard E.164-compatible format', () => {
      expect(normalizePhone('(512) 555-0143', 'US')).toBe('+15125550143');
      expect(normalizePhone('+1 (512) 555-0199', 'US')).toBe('+15125550199');
      expect(normalizePhone('020 7946 0991', 'GB')).toBe('+442079460991');
      expect(normalizePhone(undefined)).toBeNull();
    });
  });

  describe('2. Modular Discovery Providers', () => {
    it('returns available discovery provider with mock fallback in test mode', () => {
      const provider = getDiscoveryProvider('mock');
      expect(provider.name).toBe('mock');
      expect(provider.isAvailable()).toBe(true);
    });

    it('discovers appointment-based businesses based on niche and location', async () => {
      const provider = new MockDiscoveryProvider();
      const businesses = await provider.discover({
        niche: 'Dentist',
        location: 'Austin, TX',
        target_count: 5,
      });

      expect(businesses.length).toBeGreaterThan(0);
      expect(businesses[0].name).toContain('Dentistry');
      expect(businesses[0].phone).toBeDefined();
      expect(businesses[0].website).toBeDefined();
      expect(businesses[0].place_id).toBeDefined();
    });
  });

  describe('3. Enrichment & Inspection', () => {
    it('enriches raw business record and prepares AI-ready data', async () => {
      const raw = {
        name: 'Apex Orthodontics & Dental Care',
        category: 'Dentistry',
        phone: '+1 (512) 555-0199',
        website: 'https://apexorthotx.com',
        city: 'Austin',
        country: 'US',
        source: 'places_api',
      };

      const enriched = await enrichDiscoveredBusiness(raw, false);
      expect(enriched.canonical_domain).toBe('apexorthotx.com');
      expect(enriched.normalized_phone).toBe('+15125550199');
      expect(enriched.contact_channels).toContain('phone');
      expect(enriched.discovery_source).toBe('places_api');
    });
  });

  describe('4. Gemini Qualification & Scoring Rubric', () => {
    it('accurately scores appointment-based business with booking friction', () => {
      const enrichedBusiness = {
        name: 'Hill Country Cosmetic Dentistry',
        category: 'Dentist',
        phone: '+1 (512) 555-0143',
        normalized_phone: '+15125550143',
        website: 'https://hillcountrydental.com',
        canonical_domain: 'hillcountrydental.com',
        city: 'Austin',
        country: 'US',
        rating: 4.8,
        review_count: 95,
        has_online_booking: false,
        contact_channels: ['phone'],
        observed_friction: [
          {
            finding: 'Appointments appear to be requested by phone',
            evidence_type: 'observed' as const,
            source_url: 'https://hillcountrydental.com',
            confidence: 'high' as const,
          },
        ],
        evidence_urls: ['https://hillcountrydental.com'],
        snippet_for_ai: 'Call us to book an appointment with our doctors.',
        discovery_source: 'places_api',
        last_enriched_at: new Date().toISOString(),
      };

      const qualification = evaluateHeuristicQualification(enrichedBusiness, DEFAULT_RUBRIC_CONFIG);

      // Score should be high due to: appointment niche (25) + friction (20) + phone (15) + multiple reviews (10) + website (10) = 80
      expect(qualification.lead_score).toBeGreaterThanOrEqual(80);
      expect(qualification.priority).toBe('high');
      expect(qualification.ideal_customer_fit).toBe(true);
      expect(qualification.recommended_sales_angle).toContain('AI');
      expect(qualification.suggested_opening).toContain('Hill Country Cosmetic Dentistry');
      // Must not invent claims if no review problem evidence
      expect(qualification.unknowns.some((u) => u.includes('missed-call frequency'))).toBe(true);
    });

    it('validates structured qualification output matches schema', () => {
      const sampleOutput = {
        business_category: 'dermatology clinic',
        ideal_customer_fit: true,
        lead_score: 85,
        priority: 'high',
        confidence: 'medium',
        qualification_summary: 'Appointment-driven clinic with phone booking only.',
        observed_friction: [
          {
            finding: 'Appointments appear to be requested by phone',
            evidence_type: 'observed',
            source_url: 'https://example.com/contact',
            confidence: 'high',
          },
        ],
        unknowns: ['Actual missed-call frequency is unknown'],
        recommended_sales_angle: 'Offer after-hours enquiry handling and appointment assistance.',
        suggested_opening: 'I noticed your clinic handles appointments by phone.',
        disqualification_reasons: [],
      };

      const parsed = LeadQualificationResultSchema.safeParse(sampleOutput);
      expect(parsed.success).toBe(true);
    });
  });

  describe('5. Multi-Signal Deduplication & Storage', () => {
    it('deduplicates existing leads by Place ID', async () => {
      // 1. Create first lead
      const res1 = await dbService.saveOrUpdateDiscoveredLead(testUserId, {
        company: 'Austin Dental Center',
        place_id: 'place_chij123',
        phone: '+1 (512) 555-0100',
        website: 'https://austindental.com',
        canonical_domain: 'austindental.com',
      });
      expect(res1.isNew).toBe(true);

      // 2. Discover same business with matching place_id
      const res2 = await dbService.saveOrUpdateDiscoveredLead(testUserId, {
        company: 'Austin Dental Center - Updated Name',
        place_id: 'place_chij123',
        qualification_score: 85,
        qualification_priority: 'high',
      });
      expect(res2.isNew).toBe(false);
      expect(res2.lead.id).toBe(res1.lead.id);
      expect(res2.lead.qualification_score).toBe(85);
    });

    it('deduplicates by canonical website domain and normalized phone', async () => {
      const res1 = await dbService.saveOrUpdateDiscoveredLead(testUserId, {
        company: 'ClearSkin Austin',
        website: 'https://www.clearskinaustin.com/book',
        canonical_domain: 'clearskinaustin.com',
        phone: '(512) 555-0888',
        normalized_phone: '+15125550888',
      });
      expect(res1.isNew).toBe(true);

      // Discover without place_id but matching domain
      const res2 = await dbService.saveOrUpdateDiscoveredLead(testUserId, {
        company: 'ClearSkin Austin Clinic',
        canonical_domain: 'clearskinaustin.com',
      });
      expect(res2.isNew).toBe(false);
      expect(res2.lead.id).toBe(res1.lead.id);
    });

    it('preserves manually verified data from being overwritten by AI values', async () => {
      const initial = await dbService.saveOrUpdateDiscoveredLead(testUserId, {
        company: 'Verified Ortho LLC',
        phone: '+15125559999',
        normalized_phone: '+15125559999',
        canonical_domain: 'verifiedortho.com',
      });

      // Mark verified
      await dbService.updateLead(initial.lead.id, { is_verified: true, phone: '+15125559999' });

      // Run new discovery with different phone
      const resUpdated = await dbService.saveOrUpdateDiscoveredLead(testUserId, {
        company: 'Verified Ortho LLC',
        phone: '+15125550000',
        canonical_domain: 'verifiedortho.com',
      });

      expect(resUpdated.isNew).toBe(false);
      // Original verified phone must remain preserved
      expect(resUpdated.lead.phone).toBe('+15125559999');
    });
  });

  describe('6. End-to-End Orchestration & Campaign Auto-Enrollment', () => {
    it('executes discovery job, qualifies leads, and auto-enrolls into outreach campaign', async () => {
      // 1. Create a campaign
      const campaign = await dbService.createCampaign(testUserId, {
        name: 'Austin Clinics AI Receptionist Campaign',
        business_context: 'We provide AI phone agents for medical and dental clinics.',
        ideal_customer_profile: 'Appointment-based local clinics',
        offer: 'After-hours AI Front Desk',
        tone: 'Consultative and professional',
        call_to_action: 'Quick 10-minute demo call',
        initial_email_instructions: 'Highlight phone booking friction.',
        status: 'draft',
        activated_at: null,
        sending_config: {
          days: [1, 2, 3, 4, 5],
          start_hour: 9,
          end_hour: 17,
          timezone: 'America/Chicago',
          daily_limit: 50,
          hourly_limit: 10,
        },
        followup_config: { max_followups: 2, steps: [] },
      });

      // 2. Create discovery job with auto-enrollment enabled
      const job = await dbService.createDiscoveryJob(testUserId, {
        name: 'Austin Dental Discovery',
        niche: 'Dentist',
        location: 'Austin, TX',
        country: 'US',
        radius_km: 25,
        target_count: 5,
        min_qualification_score: 70,
        auto_enroll_campaign_id: campaign.id,
        auto_enroll_enabled: true,
        schedule_frequency: 'daily',
        status: 'queued',
        discovered_count: 0,
        qualified_count: 0,
        high_priority_count: 0,
        enrolled_count: 0,
      });

      // 3. Execute discovery job
      const stats = await executeDiscoveryJob(job.id, 'mock');

      expect(stats.discovered).toBeGreaterThan(0);
      expect(stats.qualified).toBeGreaterThan(0);
      expect(stats.enrolledInCampaign).toBeGreaterThan(0);

      // Verify job record updated
      const updatedJob = await dbService.getDiscoveryJob(job.id);
      expect(updatedJob?.status).toBe('completed');
      expect(updatedJob?.enrolled_count).toBeGreaterThan(0);
      expect(updatedJob?.next_run_at).toBeDefined();

      // Verify campaign leads enrollment
      const enrolled = await dbService.getCampaignLeads(campaign.id);
      expect(enrolled.length).toBe(stats.enrolledInCampaign);
    });
  });

  describe('7. API Endpoints Integration', () => {
    it('GET /api/discovery/jobs lists jobs', async () => {
      await dbService.createDiscoveryJob(testUserId, {
        name: 'API Test Job',
        niche: 'Dermatology',
        location: 'Miami, FL',
        country: 'US',
        radius_km: 25,
        target_count: 10,
        min_qualification_score: 75,
        auto_enroll_enabled: false,
        schedule_frequency: 'once',
        status: 'queued',
        discovered_count: 0,
        qualified_count: 0,
        high_priority_count: 0,
        enrolled_count: 0,
      });

      const res = await jobsGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.some((j: any) => j.name === 'API Test Job')).toBe(true);
    });

    it('POST /api/discovery/jobs validates payload and creates job', async () => {
      const req = new Request('http://localhost:3000/api/discovery/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Veterinary Clinics Dallas',
          niche: 'Veterinary Clinic',
          location: 'Dallas, TX',
          country: 'US',
          radius_km: 30,
          target_count: 15,
          min_qualification_score: 70,
          schedule_frequency: 'weekly',
          run_immediately: false,
        }),
      });

      const res = await jobsPost(req as any);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.job.name).toBe('Veterinary Clinics Dallas');
    });

    it('GET /api/discovery/export returns formatted CSV file with required columns', async () => {
      // Seed a qualified lead
      await dbService.saveOrUpdateDiscoveredLead(testUserId, {
        company: 'Export Test Dental',
        category: 'Dentistry',
        phone: '+15125550123',
        normalized_phone: '+15125550123',
        email: 'info@exporttestdental.com',
        website: 'https://exporttestdental.com',
        city: 'Austin',
        country: 'US',
        qualification_score: 85,
        qualification_priority: 'high',
        qualification_confidence: 'high',
        qualification_summary: 'Appointment-driven dental practice with verified phone booking.',
        sales_angle: 'Offer AI voice receptionist for after-hours booking.',
      });

      const req = new Request('http://localhost:3000/api/discovery/export');
      const res = await exportGet(req as any);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      const csv = await res.text();
      expect(csv).toContain('Business Name');
      expect(csv).toContain('Lead Score');
      expect(csv).toContain('Observed Friction');
      expect(csv).toContain('Export Test Dental');
      expect(csv).toContain('85');
    });
  });
});
