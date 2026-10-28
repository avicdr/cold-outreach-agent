import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { env } from '@/lib/env';
import { z } from 'zod';

const campaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  business_context: z.string().optional().default(''),
  ideal_customer_profile: z.string().optional().default(''),
  offer: z.string().optional().default(''),
  tone: z.string().optional().default('Professional and concise'),
  call_to_action: z.string().optional().default('15-minute quick discovery call'),
  initial_email_instructions: z.string().optional().default(''),
  account_group_id: z.string().uuid().nullable().optional(),
  email_account_id: z.string().uuid().nullable().optional(),
  resume_url: z.string().nullable().optional(),
  sending_config: z
    .object({
      days: z.array(z.number()).default([1, 2, 3, 4, 5]),
      start_hour: z.number().min(0).max(23).default(9),
      end_hour: z.number().min(0).max(23).default(17),
      timezone: z.string().default(env.DEFAULT_TIMEZONE),
      daily_limit: z.number().positive().default(env.DEFAULT_DAILY_SEND_LIMIT),
      hourly_limit: z.number().positive().default(3),
    })
    .optional()
    .default({
      days: [1, 2, 3, 4, 5],
      start_hour: 9,
      end_hour: 17,
      timezone: env.DEFAULT_TIMEZONE,
      daily_limit: env.DEFAULT_DAILY_SEND_LIMIT,
      hourly_limit: 3,
    }),
  followup_config: z
    .object({
      max_followups: z.number().min(0).max(5).default(env.DEFAULT_MAX_FOLLOWUPS),
      steps: z
        .array(
          z.object({
            step: z.number(),
            delay_days: z.number().positive(),
            instructions: z.string(),
          })
        )
        .default([
          { step: 1, delay_days: 4, instructions: 'Gentle follow-up sharing a concise insight or case study.' },
          { step: 2, delay_days: 9, instructions: 'Final friendly breakup email with low friction question.' },
        ]),
    })
    .optional()
    .default({
      max_followups: env.DEFAULT_MAX_FOLLOWUPS,
      steps: [
        { step: 1, delay_days: 4, instructions: 'Gentle follow-up sharing a concise insight or case study.' },
        { step: 2, delay_days: 9, instructions: 'Final friendly breakup email with low friction question.' },
      ],
    }),
});

export async function GET(request?: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [campaigns, groups, accounts] = await Promise.all([
      dbService.getCampaigns(user.id),
      dbService.getAccountGroups(user.id),
      dbService.getEmailAccounts(user.id),
    ]);
    const groupMap = new Map(groups.map((g) => [g.id, g]));
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    const enrichedCampaigns = campaigns.map((c) => ({
      ...c,
      account_group: c.account_group_id ? groupMap.get(c.account_group_id) || null : null,
      email_account: c.email_account_id ? accountMap.get(c.email_account_id) || null : null,
    }));

    return NextResponse.json(enrichedCampaigns, {
      headers: {
        'Cache-Control': 'private, no-cache, stale-while-revalidate=15',
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = campaignSchema.parse(body);

    const campaign = await dbService.createCampaign(user.id, {
      ...validated,
      status: 'draft',
      activated_at: null,
    });

    await dbService.logActivity(user.id, 'campaign_created', 'campaign', campaign.id, { name: campaign.name });

    return NextResponse.json(campaign, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.flatten().fieldErrors }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
