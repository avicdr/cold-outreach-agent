import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { cleanJsonText, isOpenAIConfigured, callOpenAIWithFallback } from '@/lib/openai';
import { callAiWithFallback, hasAiKeyConfigured, generateInitialEmail, generateFollowupEmail, classifyReply } from '@/lib/gemini';
import { Lead } from '@/types/database';

const { mockOpenAiCreate, mockGeminiGenerate } = vi.hoisted(() => ({
  mockOpenAiCreate: vi.fn(),
  mockGeminiGenerate: vi.fn(),
}));

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockOpenAiCreate,
        },
      };
    },
  };
});

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: mockGeminiGenerate,
      };
    },
  };
});

describe('OpenAI Fallback Engine', () => {
  const originalEnv = { ...process.env };

  const mockLead: Lead = {
    id: 'lead-test-1',
    user_id: 'user-1',
    email: 'drsmith@scottsdaleclinic.com',
    normalized_email: 'drsmith@scottsdaleclinic.com',
    first_name: 'John',
    last_name: 'Smith',
    company: 'Scottsdale Clinic',
    job_title: 'Medical Director',
    website: 'https://scottsdaleclinic.com',
    notes: '',
    custom_fields: {
      Category_Niche: 'Dermatology',
      City_Area: 'Scottsdale',
      Google_Rating: 4.9,
      Google_Review_Count: 150,
      Current_Booking_Setup: 'Phone call only',
    },
    status: 'active',
    source_import: 'import.csv',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockCampaign = {
    name: 'Clinic AI Intake',
    business_context: 'AI receptionist for healthcare clinics.',
    ideal_customer_profile: 'High volume medical clinics',
    offer: '24/7 AI appointment booking agent',
    tone: 'Executive, respectful',
    call_to_action: '3-minute video overview',
    initial_email_instructions: 'Highlight after-hours intake loss.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('correctly detects whether OpenAI is configured', () => {
    process.env.OPENAI_API_KEY = '';
    expect(isOpenAIConfigured()).toBe(false);

    process.env.OPENAI_API_KEY = '   ';
    expect(isOpenAIConfigured()).toBe(false);

    process.env.OPENAI_API_KEY = 'sk-proj-test-123456';
    expect(isOpenAIConfigured()).toBe(true);
  });

  it('cleans markdown code fences and whitespace from raw JSON strings', () => {
    const rawFenced = '```json\n{"subject": "Hello", "body": "World"}\n```';
    expect(cleanJsonText(rawFenced)).toBe('{"subject": "Hello", "body": "World"}');

    const genericFenced = '```\n{"classification": "positive"}\n```';
    expect(cleanJsonText(genericFenced)).toBe('{"classification": "positive"}');

    const clean = '{"clean": true}';
    expect(cleanJsonText(clean)).toBe('{"clean": true}');
  });

  it('hasAiKeyConfigured returns true if either Gemini or OpenAI is configured', () => {
    process.env.GEMINI_API_KEY = '';
    process.env.OPENAI_API_KEY = '';
    expect(hasAiKeyConfigured()).toBe(false);

    process.env.GEMINI_API_KEY = 'gemini-key-123';
    process.env.OPENAI_API_KEY = '';
    expect(hasAiKeyConfigured()).toBe(true);

    process.env.GEMINI_API_KEY = '';
    process.env.OPENAI_API_KEY = 'openai-key-456';
    expect(hasAiKeyConfigured()).toBe(true);
  });

  it('routes to OpenAI fallback when Gemini API fails with quota exceeded', async () => {
    process.env.GEMINI_API_KEY = 'active-gemini-key';
    process.env.OPENAI_API_KEY = 'active-openai-key';

    mockGeminiGenerate.mockRejectedValue(new Error('Quota exceeded: 429 RESOURCE_EXHAUSTED'));
    mockOpenAiCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              subject: 'Scottsdale Clinic after-hours intake',
              body: 'Hi Dr. Smith,\n\nNoticed Scottsdale Clinic reputation.\n\nBest,\nAvi',
              personalization_basis: ['Reputation in Scottsdale'],
              unsupported_claims: [],
              needs_review: false,
            }),
          },
        },
      ],
    });

    const result = await callAiWithFallback({
      prompt: 'Draft email prompt',
      systemInstruction: 'Respond in JSON',
    });

    const parsed = JSON.parse(result);
    expect(parsed.subject).toBe('Scottsdale Clinic after-hours intake');
    expect(mockGeminiGenerate).toHaveBeenCalled();
    expect(mockOpenAiCreate).toHaveBeenCalled();
  });

  it('generates cold email successfully via OpenAI fallback when Gemini fails', async () => {
    process.env.GEMINI_API_KEY = 'active-gemini-key';
    process.env.OPENAI_API_KEY = 'active-openai-key';

    mockGeminiGenerate.mockRejectedValue(new Error('Gemini 503 Service Unavailable'));
    mockOpenAiCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              subject: 'Scottsdale Clinic booking gap',
              body: 'Hi Dr. Smith,\n\nNoticed Scottsdale Clinic loses after-hours bookings.\n\nBest,\nAvi',
              personalization_basis: ['Verified Scottsdale clinic profile'],
              unsupported_claims: [],
              needs_review: false,
            }),
          },
        },
      ],
    });

    const email = await generateInitialEmail({
      lead: mockLead,
      campaign: mockCampaign,
      senderName: 'Avi',
    });

    expect(email.subject).toBe('Scottsdale Clinic booking gap');
    expect(email.body).toContain('Scottsdale Clinic');
    expect(mockOpenAiCreate).toHaveBeenCalled();
  });

  it('routes directly to OpenAI when GEMINI_API_KEY is not configured', async () => {
    process.env.GEMINI_API_KEY = '';
    process.env.OPENAI_API_KEY = 'sk-test-openai-only';

    mockOpenAiCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              classification: 'positive',
              summary: 'Prospect requested meeting link.',
              confidence: 0.95,
              is_explicit_unsubscribe: false,
            }),
          },
        },
      ],
    });

    const reply = await classifyReply('Can you send over your calendar? Let us talk next Monday.');
    expect(reply.classification).toBe('positive');
    expect(mockGeminiGenerate).not.toHaveBeenCalled();
    expect(mockOpenAiCreate).toHaveBeenCalled();
  });

  it('generates follow-up email via OpenAI fallback', async () => {
    process.env.GEMINI_API_KEY = 'gemini-key';
    process.env.OPENAI_API_KEY = 'openai-key';

    mockGeminiGenerate.mockRejectedValue(new Error('404 model not found'));
    mockOpenAiCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              subject: 'Re: Scottsdale Clinic intake',
              body: 'Hi Dr. Smith,\n\nFollowing up briefly.\n\nBest,\nAvi',
              personalization_basis: ['Step 1 follow up'],
              unsupported_claims: [],
              needs_review: false,
            }),
          },
        },
      ],
    });

    const followup = await generateFollowupEmail({
      lead: mockLead,
      campaign: mockCampaign,
      stepNumber: 1,
      stepInstructions: 'Gentle bump',
      previousSubject: 'Scottsdale Clinic intake',
      previousBody: 'Original email body',
      senderName: 'Avi',
    });

    expect(followup.subject).toBe('Re: Scottsdale Clinic intake');
    expect(mockOpenAiCreate).toHaveBeenCalled();
  });

  it('throws descriptive combined error when both Gemini and OpenAI fail', async () => {
    process.env.GEMINI_API_KEY = 'failing-gemini';
    process.env.OPENAI_API_KEY = 'failing-openai';

    mockGeminiGenerate.mockRejectedValue(new Error('Gemini 503 Overloaded'));
    mockOpenAiCreate.mockRejectedValue(new Error('OpenAI 429 Rate Limit'));

    await expect(
      callAiWithFallback({
        prompt: 'Generate email',
        systemInstruction: 'JSON instructions',
      })
    ).rejects.toThrow(/Both AI providers failed/i);
  });
});
