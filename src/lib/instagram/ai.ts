import { z } from 'zod';
import { env } from '@/lib/env';
import {
  callAiWithFallback,
  hasAiKeyConfigured,
  detectUnresolvedPlaceholders,
  detectSuspiciousClaims,
} from '@/lib/gemini';
import { InstagramCampaign, InstagramLead } from '@/types/database';
import { formatInstagramHandle } from './handles';

export const GeneratedInstagramDmSchema = z.object({
  body: z.string().min(1).max(1000),
  personalization_basis: z.array(z.string()),
  unsupported_claims: z.array(z.string()),
  needs_review: z.boolean(),
});

export type GeneratedInstagramDm = z.infer<typeof GeneratedInstagramDmSchema>;

function sanitizePromptText(input?: string | null): string {
  if (!input) return '';
  return String(input).replace(/[\r\n]+/g, ' ').slice(0, 1000);
}

function buildLeadContextSummary(lead: InstagramLead): string {
  const parts: string[] = [];
  const handle = formatInstagramHandle(lead.instagram_handle || lead.normalized_handle);
  if (handle) parts.push(`Instagram Handle: ${handle}`);
  if (lead.full_name) parts.push(`Full Name: ${sanitizePromptText(lead.full_name)}`);
  if (lead.first_name) parts.push(`First Name: ${sanitizePromptText(lead.first_name)}`);
  if (lead.company) parts.push(`Company / Brand: ${sanitizePromptText(lead.company)}`);
  if (lead.niche) parts.push(`Niche / Category: ${sanitizePromptText(lead.niche)}`);
  if (lead.bio) parts.push(`Instagram Bio: ${sanitizePromptText(lead.bio)}`);
  if (typeof lead.followers_count === 'number') parts.push(`Followers: ${lead.followers_count}`);
  if (lead.city || lead.country) {
    parts.push(`Location: ${[lead.city, lead.country].filter(Boolean).join(', ')}`);
  }
  if (lead.website) parts.push(`Website: ${sanitizePromptText(lead.website)}`);
  if (lead.personalization_hook) parts.push(`Personalization Hook: ${sanitizePromptText(lead.personalization_hook)}`);
  if (lead.notes) parts.push(`Notes: ${sanitizePromptText(lead.notes)}`);

  if (lead.custom_fields && Object.keys(lead.custom_fields).length > 0) {
    const extra = Object.entries(lead.custom_fields)
      .slice(0, 12)
      .map(([k, v]) => `${k}: ${sanitizePromptText(String(v))}`)
      .join(' | ');
    parts.push(`Custom Attributes: ${extra}`);
  }

  return parts.join('\n');
}

export async function generateInitialInstagramDM(params: {
  lead: InstagramLead;
  campaign: Pick<
    InstagramCampaign,
    'name' | 'business_context' | 'ideal_customer_profile' | 'offer' | 'tone' | 'call_to_action' | 'initial_dm_instructions'
  >;
  senderDisplayName?: string;
}): Promise<GeneratedInstagramDm> {
  const { lead, campaign, senderDisplayName } = params;
  const recipientName =
    lead.first_name?.trim() ||
    lead.full_name?.trim().split(/\s+/)[0] ||
    lead.company?.trim() ||
    'there';

  const handle = formatInstagramHandle(lead.instagram_handle || lead.normalized_handle);

  if (env.MOCK_MODE || !hasAiKeyConfigured()) {
    const contextBit = lead.niche
      ? `saw your work in ${lead.niche}`
      : lead.company
        ? `came across ${lead.company}`
        : `came across your page ${handle}`;
    const body = `Hey ${recipientName}! Quick note — ${contextBit} and loved the vibe. ${
      campaign.offer ? `${campaign.offer} — ` : ''
    }open to a ${campaign.call_to_action || 'quick chat'}?`;

    return {
      body: body.slice(0, 950),
      personalization_basis: [
        lead.niche ? `Niche: ${lead.niche}` : '',
        lead.company ? `Brand: ${lead.company}` : '',
        handle ? `Handle: ${handle}` : '',
      ].filter(Boolean),
      unsupported_claims: [],
      needs_review: false,
    };
  }

  const systemInstruction = `You are writing a high-converting, human-sounding cold Instagram DM.
CRITICAL INSTAGRAM DM RULES:
1. Write ONLY like a natural Instagram Direct Message — short, conversational, no email subject lines, no "Dear...", no formal email sign-offs ("Best regards", "Sincerely").
2. Keep it concise: 25 to 65 words max, 2-3 short conversational sentences or short line breaks.
3. Ground every personalization detail strictly in the provided Lead Profile. NEVER invent fake compliments about posts/reels you did not see unless stated in their bio/hook/notes.
4. NEVER output unresolved template placeholders like {{name}} or [Company].
5. Include a soft, low-friction call to action.
6. Return valid JSON ONLY matching: { "body": string, "personalization_basis": string[], "unsupported_claims": string[], "needs_review": boolean }`;

  const prompt = `CAMPAIGN CONTEXT:
- Campaign: ${sanitizePromptText(campaign.name)}
- Sender Name: ${sanitizePromptText(senderDisplayName || 'Sender')}
- Business Context: ${sanitizePromptText(campaign.business_context)}
- Ideal Customer Profile: ${sanitizePromptText(campaign.ideal_customer_profile)}
- Offer: ${sanitizePromptText(campaign.offer)}
- Tone: ${sanitizePromptText(campaign.tone)}
- Call to Action: ${sanitizePromptText(campaign.call_to_action)}
- DM Instructions: ${sanitizePromptText(campaign.initial_dm_instructions)}

LEAD PROFILE:
${buildLeadContextSummary(lead)}

Generate the initial Instagram DM as JSON.`;

  const rawText = await callAiWithFallback({ prompt, systemInstruction });
  const parsed = GeneratedInstagramDmSchema.parse(JSON.parse(rawText));

  const unresolved = detectUnresolvedPlaceholders(parsed.body);
  const suspicious = detectSuspiciousClaims(parsed.body);
  const combinedUnsupported = Array.from(new Set([...parsed.unsupported_claims, ...unresolved, ...suspicious]));

  return {
    ...parsed,
    unsupported_claims: combinedUnsupported,
    needs_review: parsed.needs_review || combinedUnsupported.length > 0,
  };
}

export async function generateFollowupInstagramDM(params: {
  lead: InstagramLead;
  campaign: Pick<InstagramCampaign, 'name' | 'business_context' | 'offer' | 'tone' | 'call_to_action'>;
  stepNumber: number;
  stepInstructions: string;
  previousBody: string;
}): Promise<GeneratedInstagramDm> {
  const { lead, campaign, stepNumber, stepInstructions, previousBody } = params;
  const recipientName =
    lead.first_name?.trim() ||
    lead.full_name?.trim().split(/\s+/)[0] ||
    'there';

  if (env.MOCK_MODE || !hasAiKeyConfigured()) {
    const body =
      stepNumber === 1
        ? `Hey ${recipientName}, just bumping this up in case it got buried in message requests — happy to share a quick idea for ${lead.company || 'your page'} if you're open!`
        : `Hey ${recipientName}, last quick check-in here so I don't clutter your DMs. Should I circle back another time?`;

    return {
      body,
      personalization_basis: [lead.company ? `Brand: ${lead.company}` : 'Follow-up bump'].filter(Boolean),
      unsupported_claims: [],
      needs_review: false,
    };
  }

  const systemInstruction = `You are writing a short, natural Instagram DM follow-up (#${stepNumber}).
RULES:
1. Sound casual, friendly, and respectful — 15 to 45 words max.
2. Reference that this is a quick follow-up to your previous DM without sounding robotic or pushy.
3. No email formatting, no subject line, no unresolved placeholders.
4. Return valid JSON ONLY: { "body": string, "personalization_basis": string[], "unsupported_claims": string[], "needs_review": boolean }`;

  const prompt = `CAMPAIGN:
- Offer: ${sanitizePromptText(campaign.offer)}
- Tone: ${sanitizePromptText(campaign.tone)}
- CTA: ${sanitizePromptText(campaign.call_to_action)}
- Follow-up #${stepNumber} Instructions: ${sanitizePromptText(stepInstructions)}

PREVIOUS DM SENT:
"${sanitizePromptText(previousBody)}"

LEAD PROFILE:
${buildLeadContextSummary(lead)}

Generate the follow-up Instagram DM as JSON.`;

  const rawText = await callAiWithFallback({ prompt, systemInstruction });
  const parsed = GeneratedInstagramDmSchema.parse(JSON.parse(rawText));

  const unresolved = detectUnresolvedPlaceholders(parsed.body);
  const suspicious = detectSuspiciousClaims(parsed.body);
  const combinedUnsupported = Array.from(new Set([...parsed.unsupported_claims, ...unresolved, ...suspicious]));

  return {
    ...parsed,
    unsupported_claims: combinedUnsupported,
    needs_review: parsed.needs_review || combinedUnsupported.length > 0,
  };
}
