import { describe, it, expect } from 'vitest';
import {
  generateInitialEmail,
  generateFollowupEmail,
  validateDraft,
  classifyReply,
  detectUnresolvedPlaceholders,
  detectSuspiciousClaims,
  GeneratedEmailSchema,
} from './gemini';
import { Lead } from '@/types/database';

describe('Gemini AI Writing Engine & Safety', () => {
  const mockLead: Lead = {
    id: 'lead-1',
    user_id: 'user-1',
    email: 'elon@tesla.com',
    normalized_email: 'elon@tesla.com',
    first_name: 'Elon',
    last_name: 'Musk',
    company: 'Tesla',
    job_title: 'CEO',
    website: 'https://tesla.com',
    notes: 'Interested in automation pipelines.',
    custom_fields: {},
    status: 'active',
    source_import: 'import-1.csv',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockCampaign = {
    name: 'Q4 Outreach',
    business_context: 'We provide AI agents for sales workflows.',
    ideal_customer_profile: 'Founders and CEOs of fast-growing technology companies.',
    offer: 'Automating high-conversion cold outbound messages.',
    tone: 'Concise and direct',
    call_to_action: '10-minute discovery call',
    initial_email_instructions: 'Keep it friendly and respectful.',
  };

  it('generates a valid initial email matching schema in mock mode', async () => {
    const draft = await generateInitialEmail({
      lead: mockLead,
      campaign: mockCampaign,
      senderName: 'Avi',
    });

    expect(draft.subject).toContain('Tesla');
    expect(draft.body).toContain('Elon');
    expect(draft.body).toContain('Avi');
    expect(GeneratedEmailSchema.safeParse(draft).success).toBe(true);
  });

  it('generates a valid follow-up email matching schema in mock mode', async () => {
    const followup = await generateFollowupEmail({
      lead: mockLead,
      campaign: mockCampaign,
      stepNumber: 1,
      stepInstructions: 'Polite reminder with low friction CTA',
      previousSubject: 'Quick question regarding Tesla',
      previousBody: 'Original message text',
      senderName: 'Avi',
    });

    expect(followup.subject).toContain('Re: Quick question regarding Tesla');
    expect(followup.body).toContain('Elon');
    expect(GeneratedEmailSchema.safeParse(followup).success).toBe(true);
  });

  it('detects unresolved placeholders and flags draft for review', () => {
    const cleanDraft = 'Hi John, wanted to see if your team was looking into automation.';
    const dirtyDraft = 'Hi {{first_name}}, loved what you are doing at [Company Name] and <Industry>!';

    expect(detectUnresolvedPlaceholders(cleanDraft)).toEqual([]);
    expect(detectUnresolvedPlaceholders(dirtyDraft)).toEqual(['{{first_name}}', '[Company Name]', '<Industry>']);

    const validation = validateDraft(dirtyDraft, 'Hello {{first_name}}');
    expect(validation.needs_review).toBe(true);
    expect(validation.unresolved_placeholders.length).toBeGreaterThan(0);
  });

  it('detects suspicious claims and fake familiarity', () => {
    const suspiciousText = 'As discussed yesterday, we guarantee 10x ROI on all outbound emails!';
    const claims = detectSuspiciousClaims(suspiciousText);

    expect(claims.length).toBe(2);
    expect(claims[0]).toContain('guarantee 10x');
    expect(claims[1]).toContain('as discussed yesterday');
  });

  it('classifies explicit unsubscribe requests with 100% confidence', async () => {
    const replies = [
      'Please unsubscribe me from this list immediately.',
      'Stop emailing me!',
      'Take me off your mailing list, not interested.',
      'Please delete my details from your database.',
    ];

    for (const reply of replies) {
      const res = await classifyReply(reply);
      expect(res.classification).toBe('unsubscribe');
      expect(res.is_explicit_unsubscribe).toBe(true);
    }
  });

  it('classifies positive and objection replies correctly', async () => {
    const positiveReply = 'Thanks for reaching out, let\'s talk next Tuesday. Send over your calendar.';
    const positiveResult = await classifyReply(positiveReply);
    expect(positiveResult.classification).toBe('positive');

    const objectionReply = 'No thanks, we have an internal solution and are not interested.';
    const objectionResult = await classifyReply(objectionReply);
    expect(objectionResult.classification).toBe('objection');

    const oooReply = 'I am currently out of the office on annual leave returning next Monday.';
    const oooResult = await classifyReply(oooReply);
    expect(oooResult.classification).toBe('out_of_office');
  });

  it('extracts all core identifiers, contact channels, and qualification fields correctly', async () => {
    const { extractLeadEnrichment } = await import('./gemini');
    const clinicLead: Lead = {
      id: 'lead-clinic-1',
      user_id: 'user-1',
      email: 'info@studiobsmiles.com',
      normalized_email: 'info@studiobsmiles.com',
      first_name: '',
      last_name: '',
      company: 'Studio B Smiles',
      job_title: '',
      website: 'https://studiobsmiles.com',
      notes: '',
      custom_fields: {
        'Category_Niche': 'Dental',
        'City_Area': 'Scottsdale',
        'Country': 'United States',
        'Phone_Number': '(480) 860-0092',
        'Email_Source_Type': 'Explicit Profile Email',
        'Google_Rating': 4.9,
        'Google_Review_Count': 285,
        'Footfall_Tier': 'High Footfall',
        'Current_Booking_Setup': 'Phone call and static contact form',
        'AI_Chat_Widget_Status': 'None',
        'Automated_Booking_Status': 'Manual receptionist intake',
        'Lead_Qualification_Score': 97,
        'Cold_Email_Personalization_Hook': 'Saw your 4.9-star reputation across 285+ patient reviews in Scottsdale.',
      },
      status: 'active',
      source_import: 'leads.csv',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const profile = extractLeadEnrichment(clinicLead);
    expect(profile.businessName).toBe('Studio B Smiles');
    expect(profile.recipientSalutation).toBe('Studio B Smiles Team');
    expect(profile.categoryNiche).toBe('Dental');
    expect(profile.cityArea).toBe('Scottsdale');
    expect(profile.googleRating).toBe(4.9);
    expect(profile.googleReviewCount).toBe(285);
    expect(profile.currentBookingSetup).toBe('Phone call and static contact form');
    expect(profile.personalizationHook).toContain('285+ patient reviews in Scottsdale');

    const draft = await generateInitialEmail({
      lead: clinicLead,
      campaign: {
        name: 'Dental Intake AI',
        business_context: 'We install autonomous 24/7 AI booking agents for private dental and med spa practices.',
        ideal_customer_profile: 'High-volume private dental practices in premier metro areas.',
        offer: '24/7 autonomous new-patient intake and calendar booking agent',
        tone: 'Executive, respectful, direct',
        call_to_action: '3-minute video walkthrough',
        initial_email_instructions: 'Lead with their reputation and address after-hours intake loss.',
      },
      senderName: 'Avi',
    });

    expect(draft.subject).toContain('Studio B Smiles');
    expect(draft.body).toContain('Studio B Smiles Team');
    expect(draft.body).toContain('Scottsdale');
    expect(draft.body).toContain('24/7');
  });
});

