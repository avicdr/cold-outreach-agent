import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { env } from './env';
import { Lead, Campaign, ReplyClassification } from '@/types/database';
import { callOpenAIWithFallback, isOpenAIConfigured, cleanJsonText } from './openai';

export function hasAiKeyConfigured(): boolean {
  const geminiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
  return Boolean((geminiKey && geminiKey.trim()) || isOpenAIConfigured());
}

export const GeneratedEmailSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
  personalization_basis: z.array(z.string()),
  unsupported_claims: z.array(z.string()),
  needs_review: z.boolean(),
});

export type GeneratedEmail = z.infer<typeof GeneratedEmailSchema>;

export const ReplyClassificationResultSchema = z.object({
  classification: z.enum(['positive', 'neutral', 'objection', 'out_of_office', 'unsubscribe', 'other']),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  is_explicit_unsubscribe: z.boolean(),
});

export type ReplyClassificationResult = z.infer<typeof ReplyClassificationResultSchema>;

export const DraftValidationSchema = z.object({
  unsupported_claims: z.array(z.string()),
  unresolved_placeholders: z.array(z.string()),
  word_count: z.number(),
  char_count: z.number(),
  needs_review: z.boolean(),
  notes: z.string(),
});

export type DraftValidation = z.infer<typeof DraftValidationSchema>;

/**
 * Detects common unresolved placeholders like {{name}}, [Company], <title>, etc.
 */
export function detectUnresolvedPlaceholders(text: string, allowedPlaceholders: string[] = []): string[] {
  const matches = text.match(/(\{\{[^}]+\}\}|\[[A-Za-z\s]+\](?!\()|<[A-Za-z\s]+>)/g) || [];
  return Array.from(new Set(matches)).filter((p) => !allowedPlaceholders.includes(p));
}

/**
 * Scans email text for claims not supported by the lead data or campaign context.
 */
export function detectSuspiciousClaims(body: string): string[] {
  const suspiciousKeywords = [
    'guarantee 10x',
    'saw your recent funding',
    'as discussed yesterday',
    'loved your recent post on linkedin',
    'talked with your colleague',
    '100% free forever with no catch',
  ];
  const detected: string[] = [];
  const lower = body.toLowerCase();
  for (const phrase of suspiciousKeywords) {
    if (lower.includes(phrase)) {
      detected.push(`Potentially unverified claim or fake familiarity: "${phrase}"`);
    }
  }
  return detected;
}

export interface GenerateInitialEmailParams {
  lead: Lead;
  campaign: Pick<Campaign, 'name' | 'business_context' | 'ideal_customer_profile' | 'offer' | 'tone' | 'call_to_action' | 'initial_email_instructions'> & {
    resume_url?: string | null;
  };
  senderName?: string;
  maxWords?: number;
}

export interface GenerateFollowupEmailParams {
  lead: Lead;
  campaign: Pick<Campaign, 'name' | 'business_context' | 'offer' | 'tone' | 'call_to_action'>;
  stepNumber: number;
  stepInstructions: string;
  previousSubject: string;
  previousBody: string;
  senderName?: string;
}

/**
 * Clean and escape untrusted user notes to avoid prompt injection.
 */
/**
 * Clean and escape untrusted user notes to avoid prompt injection.
 */
function sanitizePromptInput(input: string): string {
  if (!input) return '';
  return input.replace(/[\r\n]+/g, ' ').slice(0, 1000);
}

export interface ExtractedLeadProfile {
  businessName: string;
  recipientSalutation: string;
  categoryNiche: string;
  cityArea: string;
  country: string;
  phoneNumber: string;
  websiteUrl: string;
  targetColdEmail: string;
  emailSourceType: string;
  googleRating: string | number;
  googleReviewCount: string | number;
  footfallTier: string;
  currentBookingSetup: string;
  aiChatWidgetStatus: string;
  automatedBookingStatus: string;
  qualificationScore: string | number;
  personalizationHook: string;
  leadId: string | number;
  // Tech founder & Job/Internship fields
  targetRoles?: string;
  techStack?: string;
  startupDetails?: string;
  outreachHook?: string;
  cohort?: string;
  degreePolicy?: string;
}

/**
 * Normalizes and extracts core business identifiers, contact channels,
 * and qualification fields from the lead and custom_fields.
 */
export function extractLeadEnrichment(lead: Lead): ExtractedLeadProfile {
  const cf = lead.custom_fields || {};

  const getField = (...keys: string[]): string => {
    for (const k of keys) {
      if (cf[k] !== undefined && cf[k] !== null && String(cf[k]).trim()) {
        return String(cf[k]).trim();
      }
      const normalizedK = k.toLowerCase().replace(/[-_ ]/g, '');
      for (const [cfKey, cfVal] of Object.entries(cf)) {
        if (
          cfKey.toLowerCase().replace(/[-_ ]/g, '') === normalizedK &&
          cfVal !== undefined &&
          cfVal !== null &&
          String(cfVal).trim()
        ) {
          return String(cfVal).trim();
        }
      }
    }
    return '';
  };

  const businessName =
    lead.company ||
    getField('Startup_Name', 'StartupName', 'Business_Name', 'BusinessName', 'company_name', 'business', 'Company') ||
    'your team';

  const categoryNiche =
    lead.category ||
    getField('Category_Niche', 'CategoryNiche', 'category', 'niche', 'industry') ||
    'practice';

  const cityArea =
    lead.city ||
    getField('City_Area', 'CityArea', 'city', 'area', 'location', 'Remote_Scope', 'RemoteScope') ||
    '';

  const country = lead.country || getField('Country', 'country') || '';
  const phoneNumber = lead.phone || getField('Phone_Number', 'PhoneNumber', 'phone', 'tel') || '';
  const websiteUrl = lead.website || getField('Website_URL', 'WebsiteURL', 'website', 'domain') || '';
  const targetColdEmail = lead.email || getField('Target_Cold_Email', 'TargetColdEmail', 'email') || '';
  const emailSourceType = getField('Email_Source_Type', 'EmailSourceType', 'source_type');

  const rawRating = lead.rating ?? getField('Google_Rating', 'GoogleRating', 'rating');
  const googleRating = rawRating !== '' && !isNaN(Number(rawRating)) ? Number(rawRating) : rawRating;

  const rawReviews = lead.review_count ?? getField('Google_Review_Count', 'GoogleReviewCount', 'review_count', 'reviews');
  const googleReviewCount = rawReviews !== '' && !isNaN(Number(rawReviews)) ? Number(rawReviews) : rawReviews;

  const footfallTier = getField('Footfall_Tier', 'FootfallTier', 'footfall');
  const currentBookingSetup = getField('Current_Booking_Setup', 'CurrentBookingSetup', 'booking_setup');
  const aiChatWidgetStatus = getField('AI_Chat_Widget_Status', 'AIChatWidgetStatus', 'chat_widget_status', 'chat_widget');
  const automatedBookingStatus = getField('Automated_Booking_Status', 'AutomatedBookingStatus', 'automated_booking');
  
  const rawScore = lead.qualification_score ?? getField('Lead_Qualification_Score', 'LeadQualificationScore', 'qualification_score');
  const qualificationScore = rawScore !== '' && !isNaN(Number(rawScore)) ? Number(rawScore) : rawScore;
  
  const personalizationHook =
    lead.suggested_opening ||
    lead.sales_angle ||
    getField('Outreach_Hook', 'OutreachHook', 'Cold_Email_Personalization_Hook', 'ColdEmailPersonalizationHook', 'personalization_hook', 'hook');

  const leadId = getField('Lead_ID', 'LeadID', 'id');

  // Tech founder and Job / Internship fields
  const targetRoles = getField('Target_Remote_Roles', 'TargetRemoteRoles', 'target_roles') || (lead.job_title && /engineer|developer|intern|ai|systems|software|applied/i.test(lead.job_title) ? lead.job_title : '');
  const techStack = getField('Tech_Stack', 'TechStack', 'tech_stack', 'stack') || '';
  const startupDetails = lead.notes || getField('Startup_Details', 'StartupDetails', 'details', 'summary') || '';
  const outreachHook = personalizationHook || getField('Outreach_Hook', 'OutreachHook', 'hook') || '';
  const cohort = getField('Cohort', 'cohort') || '';
  const degreePolicy = getField('Degree_Policy', 'DegreePolicy') || '';

  // Smart salutation: handle explicit profile emails (info@clinic, contact@...) vs individual person
  const genericPrefixes = ['info', 'contact', 'hello', 'admin', 'office', 'support', 'sales', 'frontdesk', 'reception', 'help', 'team', 'dental', 'clinic'];
  let rawFirst = (lead.first_name || '').trim();
  const rawLast = (lead.last_name || '').trim();

  // If first_name is empty, check if Founder_Names exists in custom fields
  if (!rawFirst) {
    const rawFounders = getField('Founder_Names', 'FounderNames', 'founders', 'founder_name');
    if (rawFounders && !/founders|team|partners/i.test(rawFounders)) {
      const firstPerson = rawFounders.split(/[,\&]/)[0].trim();
      rawFirst = firstPerson.split(/\s+/)[0] || '';
    }
  }

  const emailUserPart = (targetColdEmail.split('@')[0] || '').toLowerCase();
  const isGeneric = !rawFirst || genericPrefixes.includes(rawFirst.toLowerCase()) || genericPrefixes.includes(emailUserPart);

  let recipientSalutation = '';
  if (!isGeneric) {
    const isMedical = /dental|med\s*spa|chiropractic|veterinary|dermatology|eye|lasik|podiatry|ent|clinic|orthopedic/i.test(categoryNiche);
    if (isMedical && rawLast) {
      recipientSalutation = `Dr. ${rawLast}`;
    } else {
      recipientSalutation = rawFirst;
    }
  } else if (businessName && businessName !== 'your team') {
    recipientSalutation = `${businessName} Team`;
  } else {
    recipientSalutation = 'Team';
  }

  return {
    businessName,
    recipientSalutation,
    categoryNiche,
    cityArea,
    country,
    phoneNumber,
    websiteUrl,
    targetColdEmail,
    emailSourceType,
    googleRating,
    googleReviewCount,
    footfallTier,
    currentBookingSetup,
    aiChatWidgetStatus,
    automatedBookingStatus,
    qualificationScore,
    personalizationHook,
    leadId,
    targetRoles,
    techStack,
    startupDetails,
    outreachHook,
    cohort,
    degreePolicy,
  };
}

async function callGeminiWithFallback(
  ai: GoogleGenAI,
  request: { contents: string; config?: any }
) {
  const candidateModels = [
    process.env.GEMINI_MODEL || env.GEMINI_MODEL || 'gemini-3.5-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
  ];
  const uniqueModels = Array.from(new Set(candidateModels.filter(Boolean)));

  let lastError: any = null;
  for (const model of uniqueModels) {
    try {
      const response = await ai.models.generateContent({
        ...request,
        model,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || String(err);
      const isUnavailable =
        err?.status === 404 ||
        err?.status === 429 ||
        err?.status === 503 ||
        msg.includes('not found') ||
        msg.includes('no longer available') ||
        msg.includes('high demand') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('Quota exceeded') ||
        msg.includes('RESOURCE_EXHAUSTED');

      if (!isUnavailable) {
        throw err;
      }
      console.warn(`Gemini model ${model} unavailable or quota reached (${msg}), attempting fallback model...`);
    }
  }
  throw lastError;
}

/**
 * Calls Gemini with internal candidate model fallback, and seamlessly falls back
 * to OpenAI if Gemini is unavailable, rate-limited, quota-exhausted, or not configured.
 */
export async function callAiWithFallback({
  prompt,
  systemInstruction,
}: {
  prompt: string;
  systemInstruction?: string;
}): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
  let geminiError: any = null;

  if (geminiKey && geminiKey.trim()) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey.trim() });
      const response = await callGeminiWithFallback(ai, {
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        },
      });
      if (response && response.text) {
        return cleanJsonText(response.text);
      }
    } catch (err: any) {
      geminiError = err;
      const msg = err?.message || String(err);
      console.warn(`[AI Engine] Gemini API call failed (${msg}).`);
    }
  }

  // Fallback to OpenAI if configured
  if (isOpenAIConfigured()) {
    if (geminiError) {
      console.warn('[AI Engine] Falling back to OpenAI API...');
    }
    try {
      const openAiText = await callOpenAIWithFallback({
        prompt,
        systemInstruction,
        responseMimeType: 'application/json',
      });
      return cleanJsonText(openAiText);
    } catch (openAiErr: any) {
      const openAiMsg = openAiErr?.message || String(openAiErr);
      console.error(`[AI Engine] OpenAI fallback failed (${openAiMsg}).`);
      if (geminiError) {
        throw new Error(`Both AI providers failed. Gemini: ${geminiError.message || geminiError}. OpenAI: ${openAiMsg}`);
      }
      throw openAiErr;
    }
  }

  if (geminiError) {
    throw geminiError;
  }

  throw new Error('No AI provider configured (neither GEMINI_API_KEY nor OPENAI_API_KEY is available)');
}

/**
 * Naturalizes raw CSV outreach notes or research hooks into conversational sentences
 * written from a real student/builder perspective.
 */
export function naturalizeOutreachHook(rawHook?: string, companyName?: string): string {
  const company = companyName && companyName !== 'your team' ? companyName : 'your company';
  if (!rawHook || !rawHook.trim()) {
    return `I've been following what you and the team are building at ${company}, especially your engineering focus.`;
  }

  let text = rawHook.trim().replace(/\.+$/, '');

  // Specific community and bespoke patterns
  if (/email.*directly mentioning hn/i.test(text) || /hacker news/i.test(text)) {
    return `I've been following ${company} on Hacker News and really admire your work around distributed execution and task queues.`;
  }
  if (/who's hiring|whos hiring/i.test(text)) {
    return `I came across your journey on Hacker News and have been closely following what you're building at ${company}.`;
  }
  if (/founded by self-directed builders/i.test(text)) {
    return `I've been following what you're building at ${company}, particularly your serverless infrastructure and developer tooling.`;
  }

  // Action verbs converted to natural conversational interest
  const verbPatterns: Array<[RegExp, string]> = [
    [/^(?:reference|referencing)\s+/i, `I've been following what you're building at ${company}, particularly `],
    [/^(?:highlight|highlighting)\s+/i, `I've been following what you're building at ${company}, especially `],
    [/^(?:share|sharing)\s+/i, `I've been following what you're building at ${company}, particularly `],
    [/^(?:showcase|showcasing)\s+/i, `I've been following what you're building at ${company}, especially `],
    [/^(?:point\s+to|pointing\s+to)\s+/i, `I've been following what you're building at ${company}, particularly `],
    [/^(?:emphasize|emphasizing)\s+/i, `I've been following what you're building at ${company}, particularly `],
    [/^(?:send|sending)\s+/i, `I've been following what you're building at ${company}, particularly `],
    [/^(?:submit|submitting)\s+/i, `I've been following your open-source work at ${company}, particularly `],
    [/^(?:build\s+and\s+package|package)\s+/i, `I've been following what you're building at ${company}, particularly `],
    [/^(?:demonstrate|demonstrating)\s+/i, `I've been following what you're building at ${company}, particularly `],
    [/^(?:discuss|discussing)\s+/i, `I've been following what you're building at ${company}, especially `],
    [/^(?:mention|mentioning)\s+/i, `I've been following what you're building at ${company}, particularly `],
  ];

  for (const [regex, replacement] of verbPatterns) {
    if (regex.test(text)) {
      const rest = text.replace(regex, '').trim();
      const lowerFirst = rest.charAt(0).toLowerCase() + rest.slice(1);
      return `${replacement}${lowerFirst}.`;
    }
  }

  if (/^i (?:noticed|saw|read|admire|have|love)/i.test(text)) {
    return text.endsWith('.') ? text : `${text}.`;
  }

  return `I've been following what you're building at ${company}, particularly ${text.charAt(0).toLowerCase() + text.slice(1)}.`;
}

/**
 * Generates an initial cold email using Google Gemini or Mock mode fallback.
 */
export async function generateInitialEmail(params: GenerateInitialEmailParams): Promise<GeneratedEmail> {
  const { lead, campaign, senderName = 'The Team', maxWords = 100 } = params;
  const profile = extractLeadEnrichment(lead);

  const isJobOutreach = Boolean(
    /intern|internship|job|hiring|candidate|resume/i.test(campaign.offer) ||
    /intern|internship|job application|engineering role|founder outreach|job inquiry/i.test(campaign.name) ||
    (profile.techStack && profile.outreachHook && !profile.currentBookingSetup) ||
    (profile.targetRoles && (profile.techStack || profile.outreachHook))
  );

  // Use rich tailored response if no AI key or in mock mode
  if (!hasAiKeyConfigured() || env.MOCK_MODE || process.env.MOCK_MODE === 'true') {
    if (isJobOutreach) {
      const tech = profile.techStack || '';
      const stackLower = tech.toLowerCase();
      const hookLower = (profile.outreachHook || '').toLowerCase();
      const companyLower = profile.businessName.toLowerCase();
      const combined = `${stackLower} ${hookLower} ${companyLower}`;

      let relevantProject = '';
      if (/rust|distributed|database|crdt|concurrency|queue|temporal|workflow|transaction|clock|hatchet|inngest/i.test(combined)) {
        relevantProject = 'Conflict-Free OLTP, a distributed database engine in Rust using CRDTs and Hybrid Logical Clocks for concurrency correctness';
      } else if (/serving|inference|vllm|ollama|slm|runtime|quantiz|gpu|cuda|modal|llama\.cpp|baseten|together|fireworks|runpod/i.test(combined)) {
        relevantProject = 'Compact SLM, a local LLM serving platform in FastAPI and Qwen3 with modular backend architecture and automated testing';
      } else if (/search|rag|retrieval|collaboration|git|dev\s*tool|editor|code|langchain|llama|vector|semantic/i.test(combined)) {
        relevantProject = 'ResearchGit, a collaborative platform with semantic vector search and real-time synchronization';
      } else {
        relevantProject = 'practical agentic workflows and tool-calling backend pipelines in Python and FastAPI';
      }

      const openingSentence = naturalizeOutreachHook(profile.outreachHook, profile.businessName);

      const subject = profile.businessName && profile.businessName !== 'your team'
        ? `Engineering Internship at ${profile.businessName} — Om Nigam`
        : `Engineering Internship — Om Nigam`;

      const resumeLink = campaign.resume_url
        ? `[Resume](${campaign.resume_url})`
        : `[Resume]({{resume_url}})`;
      const githubLink = `[GitHub](https://github.com/avicdr)`;

      const body = `Hi ${profile.recipientSalutation},

${openingSentence}

My name is Om Nigam, and I am a CS student at BITS Pilani, Bengaluru. I focus on practical AI systems, backend reliability, and developer infrastructure. Recently, I built ${relevantProject}.

Alongside my studies, I build Arenova, an AI automation agency developing custom agents and workflow integrations. I also shipped production features with an early-stage team at AetherLabs using Python, TypeScript, and FastAPI.

I would love to contribute to ${profile.businessName} as an engineering intern. You can review my ${resumeLink} and ${githubLink} to see my code and past work.

Would you be open to a brief five-minute chat next week to see if I could be helpful to the team?

Best,
Om`;

      return {
        subject,
        body,
        personalization_basis: [
          profile.outreachHook ? `Outreach hook: ${profile.outreachHook}` : `Company focus: ${profile.businessName}`,
          `Relevant proof-of-work project: ${relevantProject}`,
          'BITS Pilani CS background, Arenova agentic AI, and systems engineering',
        ],
        unsupported_claims: [],
        needs_review: false,
      };
    }

    const openingSentence = profile.personalizationHook
      ? profile.personalizationHook
      : profile.googleReviewCount
      ? `I noticed ${profile.businessName}'s stellar ${profile.googleRating || '5.0'} rating across ${profile.googleReviewCount}+ reviews in ${profile.cityArea || 'your area'}.`
      : `I noticed ${profile.businessName}'s strong local reputation in ${profile.cityArea || 'your area'}.`;

    const frictionSentence = profile.currentBookingSetup
      ? `Looking at your intake flow, after-hours prospective clients are currently directed to ${profile.currentBookingSetup.toLowerCase()}, which means customers searching in the evenings or weekends often drop off before booking.`
      : `Looking at your online presence, prospective clients browsing after hours lack a direct 24/7 self-service scheduling assistant to capture them on the spot.`;

    const subject = profile.businessName !== 'your team'
      ? `${profile.businessName} after-hours intake`
      : `Quick question regarding after-hours intake`;

    const body = `Hi ${profile.recipientSalutation},

${openingSentence}

${frictionSentence}

At Arenova, we build AI WhatsApp receptionists and automated booking systems that answer customer enquiries, qualify leads, and schedule appointments directly into your calendar 24/7 without adding repetitive work for your front desk.

Would you be open to a quick 3-minute video showing how this works for ${profile.categoryNiche || 'businesses'} like yours?

Best,
${senderName}`;

    return {
      subject,
      body,
      personalization_basis: [
        profile.personalizationHook ? `Personalization hook: ${profile.personalizationHook}` : `Business reputation in ${profile.cityArea}`,
        profile.currentBookingSetup ? `Booking setup: ${profile.currentBookingSetup}` : 'After-hours inquiry intake gap',
      ],
      unsupported_claims: [],
      needs_review: false,
    };
  }

  const systemInstruction = isJobOutreach
    ? `You are an elite engineering talent copywriter writing authentic, ultra-personalized cold emails on behalf of Om Nigam to tech startup founders and CTOs for engineering and AI internships.

CANDIDATE DOSSIER: OM NIGAM
- Identity: Om Nigam, B.Sc. Computer Science student at BITS Pilani, Bengaluru (2025-2029).
- Core Focus: Agentic AI, autonomous AI systems, LLM-powered applications, practical backend architecture, system reliability, and AI infrastructure.
- Technical Toolkit: Python, FastAPI, Node.js, PostgreSQL, MongoDB, Docker, React, Next.js, TypeScript, Rust, local LLMs, llama.cpp.
- Proven Experience and Projects:
  1. Arenova: Building an AI automation and digital growth agency, developing custom AI agents, intelligent integrations, and automated customer assistants.
  2. AetherLabs: Shipped production features with an early-stage founding team in AI insurtech, focusing on practical AI tool use and system reliability.
  3. Compact SLM: Local LLM serving platform in FastAPI and Qwen3 with modular backend architecture and automated testing.
  4. Conflict-Free OLTP: Distributed database engine in Rust using CRDTs and Hybrid Logical Clocks for concurrency correctness.
  5. ResearchGit: Collaborative platform with semantic vector search and real-time synchronization.
- Verified Links:
  * GitHub: https://github.com/avicdr
  * Resume: {{resume_url}} (Always use [Resume]({{resume_url}}), or [Resume](${campaign.resume_url || '{{resume_url}}'})).

CRITICAL COPYWRITING RULES:
1. EMAIL LENGTH: Strict 100 to 160 words. Zero fluff, high density of engineering signal.
2. PARAGRAPHS: Each paragraph must be 1 to 3 sentences.
3. PUNCTUATION: NEVER use em dashes or en dashes. Use commas, colons, or parentheses instead.
4. SALUTATION: Use "Hi ${profile.recipientSalutation},".
5. OPENING (THE HOOK):
   ${profile.outreachHook
     ? `MANDATORY: You MUST open or lead with this verified outreach hook: "${profile.outreachHook}". Adapt it naturally as your very first sentence.`
     : `Open with a crisp, authentic technical observation about ${profile.businessName} and what they are building.`}
6. TECHNICAL ALIGNMENT & PROOF OF WORK:
   - Introduce Om as a CS student at BITS Pilani, Bengaluru.
   - Connect Om's background and his most relevant project (Compact SLM, Conflict-Free OLTP in Rust, ResearchGit, Arenova, or AetherLabs) directly to ${profile.businessName}'s stack (${profile.techStack || 'AI and systems'}).
   - Mention his practical experience building Arenova or shipping at AetherLabs.
   - Position Om as a hands-on builder who wants to contribute directly to the founders, ship meaningful features, and solve real engineering problems.
7. RESUME & LINKS:
   - Include valid Markdown links: [Resume]({{resume_url}}) and [GitHub](https://github.com/avicdr).
8. CALL TO ACTION (CTA):
   - Low-friction, conversational, zero-pressure:
     e.g., "Would you be open to a brief five-minute chat next week to see if I could be helpful to the team?"
9. SIGN-OFF:
   - Use "Best,\nOm"
10. SUBJECT LINE:
   - Must be EXACTLY: "Engineering Internship at ${profile.businessName} — Om Nigam" (or "Engineering Internship — Om Nigam" if company is unknown).
11. Return valid JSON strictly adhering to schema:
   {
     "subject": "string",
     "body": "string",
     "personalization_basis": ["Specific verified facts used from lead and Om's project fit"],
     "unsupported_claims": [],
     "needs_review": boolean
   }`
    : `You are Arenova's business development and outreach assistant. Arenova is an AI automation and digital growth agency that helps businesses attract more customers, improve their online presence, and automate repetitive workflows.

CORE SERVICES:
- Website Development: Modern, premium, mobile-friendly websites that establish credibility and generate leads. (When a business has an outdated website, offer to share a sample website created for them).
- AI WhatsApp Receptionists: AI-powered WhatsApp assistants that answer customer enquiries, handle FAQs, qualify leads, and automate appointment bookings 24/7.
- AI Automation: Automating repetitive business workflows with AI agents and intelligent integrations.
- Digital Marketing and Google Ads: Improving online visibility and attracting high-intent local customers.

TARGET CUSTOMERS:
Salons and beauty businesses, dental clinics and healthcare providers, restaurants and cafes, gyms and fitness studios, real estate, and local service businesses.

CRITICAL OUTREACH RULES:
1. EMAIL LENGTH: Strict 100 to 160 words. Short, natural, respectful, and conversational.
2. PARAGRAPHS: Each paragraph must be 1 to 3 sentences.
3. PUNCTUATION: NEVER use em dashes or en dashes. Use commas, colons, or parentheses instead.
4. SALUTATION: Use "Hi ${profile.recipientSalutation},". Never use generic "Dear Sir/Madam" or "Hi info".
5. OPENING (THE HOOK):
   ${profile.personalizationHook
     ? `Lead with a genuine observation based on: "${profile.personalizationHook}".`
     : `Open by acknowledging their reputation in ${profile.cityArea || 'their market'}${profile.googleReviewCount ? ` and their rating across ${profile.googleReviewCount}+ reviews` : ''}.`}
6. GENUINE OPPORTUNITY & BUSINESS OUTCOME:
   - Zero in on their booking bottleneck:
     * Current Booking Setup: ${profile.currentBookingSetup || 'Manual intake / phone-only / contact form'}
     * After-hours inquiry loss: local customers browsing in the evenings or weekends drop off if they cannot get instant answers or book on the spot.
   - Explain how Arenova helps in terms of real business outcomes: capturing more enquiries, responding faster, improving credibility, or saving front-desk staff hours of repetitive phone calls.
   - Never guarantee results or invent research, customer numbers, case studies, or achievements.
7. CALL TO ACTION (CTA):
   - Low-pressure question that makes replying easy (e.g., "Open to a quick 3-minute video showing how this works for practices like yours?" or "Would you be interested in taking a look at a sample website preview?").
8. COMMUNICATION STYLE:
   - Sound like a real person, not a corporate sales bot. Friendly and professional. No AI clichés (never say "I hope this email finds you well", "In today's fast-paced digital world", "revolutionary", "game-changing").
9. SUBJECT LINE:
   - Natural, conversational, all lowercase, 3 to 7 words. Never use corporate jargon, artificial urgency, or long hyphens.
   - Use high-converting conversational patterns such as:
     * "this might be useful for your clinic" (or practice)
     * "what happens after your clinic closes?"
     * "i had an idea for ${profile.businessName}"
     * "a thought about your front desk"
     * "what happens to missed calls?"
     * "this might make things easier"
     * "who's answering calls after hours?"
     * "a small idea for your clinic"
10. Return valid JSON strictly adhering to schema:
   {
     "subject": "string",
     "body": "string",
     "personalization_basis": ["Specific verified facts used from lead"],
     "unsupported_claims": [],
     "needs_review": boolean
   }`;

  const prompt = isJobOutreach
    ? `Lead Context (Startup & Founder):
- Startup / Business Name: ${sanitizePromptInput(profile.businessName)}
- Founder / Contact: ${sanitizePromptInput(profile.recipientSalutation)}
- Target Email: ${sanitizePromptInput(profile.targetColdEmail)}
- Website: ${sanitizePromptInput(profile.websiteUrl)}
- Startup Details & Mission: ${sanitizePromptInput(profile.startupDetails || profile.categoryNiche)}
- Tech Stack: ${sanitizePromptInput(profile.techStack || 'Python, TypeScript, AI APIs')}
- Target Roles: ${sanitizePromptInput(profile.targetRoles || 'Applied AI / Software Engineer')}
- Outreach Hook / Reference: ${sanitizePromptInput(profile.outreachHook || profile.personalizationHook || 'None')}
- Cohort: ${sanitizePromptInput(profile.cohort || 'Tech')}
- Degree Policy: ${sanitizePromptInput(profile.degreePolicy || 'No degree required')}

Campaign Context:
- Goal / Offer: ${campaign.offer}
- Tone: ${campaign.tone}
- Target Audience: ${campaign.ideal_customer_profile}
- Call to Action: ${campaign.call_to_action}
- Candidate / Sender Name: ${senderName}
- Instructions: ${campaign.initial_email_instructions}

Write an exceptional, highly personalized cold email to the founder for a job/internship inquiry following all rules.`
    : `Lead Context & Verified Fields:
- Business Name: ${sanitizePromptInput(profile.businessName)}
- Category / Niche: ${sanitizePromptInput(profile.categoryNiche)}
- City / Area: ${sanitizePromptInput(profile.cityArea)}
- Country: ${sanitizePromptInput(profile.country)}
- Target Email: ${sanitizePromptInput(profile.targetColdEmail)}
- Email Source Type: ${sanitizePromptInput(profile.emailSourceType || 'Direct Profile')}
- Google Rating: ${profile.googleRating || 'N/A'}
- Google Review Count: ${profile.googleReviewCount || 'N/A'}
- Footfall Tier: ${sanitizePromptInput(profile.footfallTier || 'N/A')}
- Current Booking Setup: ${sanitizePromptInput(profile.currentBookingSetup || 'Phone call & contact form')}
- AI Chat Widget Status: ${sanitizePromptInput(profile.aiChatWidgetStatus || 'None')}
- Automated Booking Status: ${sanitizePromptInput(profile.automatedBookingStatus || 'Manual intake')}
- Qualification Score: ${profile.qualificationScore || 'High'}
- Cold Email Personalization Hook: ${sanitizePromptInput(profile.personalizationHook || 'None')}

Campaign Context:
- Offer: ${campaign.offer}
- Tone: ${campaign.tone}
- Target Audience: ${campaign.ideal_customer_profile}
- Call to Action: ${campaign.call_to_action}
- Sender Name: ${senderName}

Write an exceptional, personalized cold email for this lead following all rules.`;

  try {
    const responseText = await callAiWithFallback({
      prompt,
      systemInstruction,
    });

    const parsed = JSON.parse(responseText || '{}');
    const validated = GeneratedEmailSchema.parse(parsed);

    if (isJobOutreach) {
      validated.subject = profile.businessName && profile.businessName !== 'your team'
        ? `Engineering Internship at ${profile.businessName} — Om Nigam`
        : `Engineering Internship — Om Nigam`;
    }

    // Complement with code-level checks
    const allowed = isJobOutreach ? ['{{resume_url}}'] : [];
    const placeholders = detectUnresolvedPlaceholders(validated.body, allowed);
    const suspicious = detectSuspiciousClaims(validated.body);
    if (placeholders.length > 0 || suspicious.length > 0) {
      validated.unsupported_claims = Array.from(new Set([...validated.unsupported_claims, ...suspicious, ...placeholders]));
      validated.needs_review = true;
    }

    return validated;
  } catch (error: unknown) {
    console.error('AI generateInitialEmail error:', error);
    throw new Error(`AI generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generates a follow-up email in an existing thread.
 */
export async function generateFollowupEmail(params: GenerateFollowupEmailParams): Promise<GeneratedEmail> {
  const { lead, campaign, stepNumber, stepInstructions, previousSubject, previousBody, senderName = 'The Team' } = params;
  const profile = extractLeadEnrichment(lead);

  const isJobOutreach = Boolean(
    /intern|internship|job|hiring|candidate|resume/i.test(campaign.offer) ||
    /intern|internship|job application|engineering role|founder outreach|job inquiry/i.test(campaign.name) ||
    (profile.techStack && profile.outreachHook && !profile.currentBookingSetup) ||
    (profile.targetRoles && (profile.techStack || profile.outreachHook))
  );

  if (!hasAiKeyConfigured() || env.MOCK_MODE || process.env.MOCK_MODE === 'true') {
    const isThreaded = previousSubject.toLowerCase().startsWith('re:') ? previousSubject : `Re: ${previousSubject}`;
    
    let body = '';
    if (isJobOutreach) {
      if (stepNumber === 1) {
        const resumeUrl = (campaign as any).resume_url || '{{resume_url}}';
        body = `Hi ${profile.recipientSalutation},\n\nFollowing up briefly on my note regarding an engineering internship at ${profile.businessName}.\n\nI've been working on practical AI and systems implementations (including local LLM serving with Compact SLM and distributed storage in Rust), and would love to share a short code walkthrough or project demo.\n\nYou can review my resume here: ${resumeUrl} (and GitHub: https://github.com/avicdr).\n\nWould you have 5 minutes this Thursday or Friday?\n\nBest,\nOm`;
      } else {
        body = `Hi ${profile.recipientSalutation},\n\nClosing the loop here, as I know you're busy building ${profile.businessName}.\n\nIf you aren't currently bringing on interns or junior engineers, no problem at all. Feel free to keep my details and [GitHub](https://github.com/avicdr) on file for future opportunities. Keep building!\n\nBest,\nOm`;
      }
    } else {
      if (stepNumber === 1) {
        body = `Hi ${profile.recipientSalutation},\n\nFollowing up briefly on my previous note. Most ${profile.categoryNiche || 'practices'} in ${profile.cityArea || 'your area'} lose 20-30% of their new appointment inquiries simply because patients search in the evenings when the front desk is closed.\n\nOur AI intake agent bridges that gap automatically.\n\nWould you have 5 minutes this Thursday or Friday for a quick look?\n\nBest,\n${senderName}`;
      } else {
        body = `Hi ${profile.recipientSalutation},\n\nClosing the loop here, as I know you're busy running ${profile.businessName}.\n\nIf capturing after-hours inquiries isn't a priority right now, no problem at all. Should things change down the road, feel free to reach back out.\n\nBest regards,\n${senderName}`;
      }
    }

    return {
      subject: isThreaded,
      body,
      personalization_basis: [`Follow-up step #${stepNumber} for ${profile.businessName}`],
      unsupported_claims: [],
      needs_review: false,
    };
  }

  const systemInstruction = isJobOutreach
    ? `You are an expert follow-up copywriter for career and job inquiries to startup founders.
CRITICAL RULES:
1. Write a polite, concise follow-up email (under 60 words for Step 1, under 40 words for Step 2).
2. The subject MUST start with "Re: " followed by the original subject (or reuse it).
3. Do not guilt-trip the recipient (never say "I haven't heard back from you").
4. Salutation: Use "Hi ${profile.recipientSalutation},".
5. Step 1 (First Follow-up): Add a gentle new project insight or code benchmark relevant to ${profile.techStack || 'their engineering stack'}.
6. Step 2 (Final Follow-up): Clean, polite breakup email closing the loop and offering to keep resume on file.
7. Return valid JSON strictly adhering to schema:
   {
     "subject": "Re: original subject",
     "body": "Email body",
     "personalization_basis": ["Reasoning"],
     "unsupported_claims": [],
     "needs_review": boolean
   }`
    : `You are an expert B2B follow-up email copywriter.
CRITICAL RULES:
1. Write a polite, concise follow-up email (under 60 words for Step 1, under 40 words for Step 2).
2. The subject MUST start with "Re: " followed by the original subject (or reuse it).
3. Do not guilt-trip the recipient (never say "I haven't heard back from you" or "Since you ignored my last email").
4. Salutation: Use "${profile.recipientSalutation}".
5. Step 1 (First Follow-up): Add a gentle new insight regarding after-hours inquiry loss for ${profile.categoryNiche} in ${profile.cityArea || 'their market'}.
6. Step 2 (Final Follow-up): Clean, polite breakup email closing the loop with zero pressure.
7. Return valid JSON strictly adhering to schema:
   {
     "subject": "Re: original subject",
     "body": "Email body",
     "personalization_basis": ["Reasoning"],
     "unsupported_claims": [],
     "needs_review": boolean
   }`;

  const prompt = isJobOutreach
    ? `Context:
Campaign Offer: ${campaign.offer}
Tone: ${campaign.tone}
Follow-up Step Number: ${stepNumber}
Step Instructions: ${stepInstructions}
Previous Subject: ${previousSubject}
Previous Body: ${previousBody}
Sender Name: ${senderName}

Lead Details (Startup & Founder):
Business / Startup: ${sanitizePromptInput(profile.businessName)}
Founder: ${sanitizePromptInput(profile.recipientSalutation)}
Tech Stack: ${sanitizePromptInput(profile.techStack || '')}
Target Roles: ${sanitizePromptInput(profile.targetRoles || '')}
Outreach Hook: ${sanitizePromptInput(profile.outreachHook || profile.personalizationHook || '')}

Write follow-up email #${stepNumber}.`
    : `Context:
Campaign Offer: ${campaign.offer}
Tone: ${campaign.tone}
Follow-up Step Number: ${stepNumber}
Step Instructions: ${stepInstructions}
Previous Subject: ${previousSubject}
Previous Body: ${previousBody}
Sender Name: ${senderName}

Lead Details:
Business Name: ${sanitizePromptInput(profile.businessName)}
Category / Niche: ${sanitizePromptInput(profile.categoryNiche)}
City: ${sanitizePromptInput(profile.cityArea)}
Booking Setup: ${sanitizePromptInput(profile.currentBookingSetup)}
Personalization Hook: ${sanitizePromptInput(profile.personalizationHook)}

Write follow-up email #${stepNumber}.`;

  try {
    const responseText = await callAiWithFallback({
      prompt,
      systemInstruction,
    });

    const parsed = JSON.parse(responseText || '{}');
    return GeneratedEmailSchema.parse(parsed);
  } catch (error: unknown) {
    console.error('AI generateFollowupEmail error:', error);
    throw new Error(`AI follow-up generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validates an email draft for unsupported claims, placeholders, and length.
 */
export function validateDraft(body: string, subject: string, allowedPlaceholders: string[] = []): DraftValidation {
  const placeholders = detectUnresolvedPlaceholders(`${subject} ${body}`, allowedPlaceholders);
  const suspicious = detectSuspiciousClaims(body);
  const words = body.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const charCount = body.length;

  const unsupportedClaims = [...suspicious];
  const needsReview = placeholders.length > 0 || suspicious.length > 0 || wordCount > 200;

  return {
    unsupported_claims: unsupportedClaims,
    unresolved_placeholders: placeholders,
    word_count: wordCount,
    char_count: charCount,
    needs_review: needsReview,
    notes: needsReview
      ? `Flagged: ${placeholders.length} placeholder(s), ${suspicious.length} claim warning(s), ${wordCount} words.`
      : 'Draft looks clean, concise, and ready.',
  };
}

/**
 * Classifies an inbound email reply to determine sentiment and whether follow-ups should stop.
 */
export async function classifyReply(replyBody: string): Promise<ReplyClassificationResult> {
  const lower = replyBody.toLowerCase();

  // Explicit hard-coded unsubscribe trigger check
  const unsubscribePhrases = [
    'unsubscribe',
    'remove me',
    'stop emailing',
    'take me off',
    'do not email',
    'not interested and please remove',
    'opt out',
    'please delete my details',
  ];

  const hasExplicitUnsubscribe = unsubscribePhrases.some((phrase) => lower.includes(phrase));
  if (hasExplicitUnsubscribe) {
    return {
      classification: 'unsubscribe',
      summary: 'Recipient explicitly asked to unsubscribe or be removed from outreach.',
      confidence: 1.0,
      is_explicit_unsubscribe: true,
    };
  }

  // Auto out-of-office check
  if (
    lower.includes('out of the office') ||
    lower.includes('auto-reply') ||
    lower.includes('on annual leave') ||
    lower.includes('returning on')
  ) {
    return {
      classification: 'out_of_office',
      summary: 'Automated out of office auto-reply.',
      confidence: 0.95,
      is_explicit_unsubscribe: false,
    };
  }

  if (!hasAiKeyConfigured() || env.MOCK_MODE) {
    // Basic heuristic mock classification
    if (lower.includes('not interested') || lower.includes('no thanks') || lower.includes('bad timing') || lower.includes('stop')) {
      return {
        classification: 'objection',
        summary: 'Recipient declined or noted poor timing.',
        confidence: 0.85,
        is_explicit_unsubscribe: false,
      };
    }
    if (
      (lower.includes('interested') && !lower.includes('not interested')) ||
      lower.includes("let's talk") ||
      lower.includes('calendar') ||
      lower.includes('send info') ||
      lower.includes('schedule a call') ||
      lower.includes('would love to') ||
      lower.includes('love to see') ||
      lower.includes('book a time')
    ) {
      return {
        classification: 'positive',
        summary: 'Recipient expressed interest or agreed to connect.',
        confidence: 0.85,
        is_explicit_unsubscribe: false,
      };
    }
    return {
      classification: 'neutral',
      summary: 'Standard inquiry or neutral response.',
      confidence: 0.7,
      is_explicit_unsubscribe: false,
    };
  }

  const systemInstruction = `You are an email reply classifier.
Classify the inbound email into one of these categories:
- positive: recipient wants to chat, meet, or learn more
- neutral: recipient asked a clarification question or forwarded
- objection: recipient is not interested, no budget, wrong person
- out_of_office: automated vacation or away message
- unsubscribe: recipient asked to stop contacting them or be removed
- other: unclear or spam

Return JSON strictly adhering to schema:
{
  "classification": "positive" | "neutral" | "objection" | "out_of_office" | "unsubscribe" | "other",
  "summary": "1 sentence explanation",
  "confidence": 0.0 to 1.0,
  "is_explicit_unsubscribe": boolean
}`;

  try {
    const responseText = await callAiWithFallback({
      prompt: `Reply text:\n${replyBody.slice(0, 2000)}`,
      systemInstruction,
    });

    const parsed = JSON.parse(responseText || '{}');
    const validated = ReplyClassificationResultSchema.parse(parsed);

    // Safeguard: never let model override explicit unsubscribe words
    if (hasExplicitUnsubscribe) {
      validated.classification = 'unsubscribe';
      validated.is_explicit_unsubscribe = true;
    }

    return validated;
  } catch (error: unknown) {
    console.error('AI classifyReply error:', error);
    return {
      classification: 'other',
      summary: 'Failed to classify with AI, marked for review.',
      confidence: 0.5,
      is_explicit_unsubscribe: false,
    };
  }
}
