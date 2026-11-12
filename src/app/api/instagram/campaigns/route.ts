import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { env } from '@/lib/env';
import { sanitizeInstagramAccountForClient } from '@/lib/security';
import { instagramDb } from '@/lib/instagram/db';
import { z } from 'zod';

const campaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  instagram_account_id: z.string().uuid().nullable().optional(),
  business_context: z.string().optional().default(''),
  ideal_customer_profile: z.string().optional().default(''),
  offer: z.string().optional().default(''),
  tone: z.string().optional().default('Casual, warm, conversational, zero fluff'),
  call_to_action: z.string().optional().default('Quick chat or 10-minute intro call'),
  initial_dm_instructions: z
    .string()
    .optional()
    .default('Keep under 60 words. Sound like a real human DM, not an email.'),
  sending_config: z
    .object({
      days: z.array(z.number()).default([1, 2, 3, 4, 5]),
      start_hour: z.number().min(0).max(23).default(9),
      end_hour: z.number().min(0).max(23).default(20),
      timezone: z.string().default(env.DEFAULT_TIMEZONE),
      daily_limit: z.number().positive().default(25),
      hourly_limit: z.number().positive().default(6),
    })
    .optional(),
  followup_config: z
    .object({
      max_followups: z.number().min(0).max(4).default(2),
      steps: z.array(
        z.object({
          step: z.number(),
          delay_days: z.number().positive(),
          instructions: z.string(),
        })
      ),
    })
    .optional(),
});

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const campaigns = await instagramDb.getInstagramCampaigns(user.id);
    const sanitized = campaigns.map((c) => ({
      ...c,
      instagram_account: c.instagram_account
        ? sanitizeInstagramAccountForClient(c.instagram_account)
        : null,
    }));
    return NextResponse.json(sanitized);
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const validated = campaignSchema.parse(body);

    const campaign = await instagramDb.createInstagramCampaign(user.id, validated);
    await dbService.logActivity(user.id, 'instagram_campaign_created', 'instagram_campaigns', campaign.id, {
      name: campaign.name,
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
