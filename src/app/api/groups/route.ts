import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { z } from 'zod';

const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(100),
  description: z.string().optional().default(''),
  is_warmup_enabled: z.boolean().optional().default(false),
  warmup_daily_limit: z.number().int().min(1).max(50).optional().default(15),
  warmup_ramp_per_day: z.number().int().min(1).max(10).optional().default(2),
  warmup_reply_rate: z.number().int().min(10).max(100).optional().default(70),
});

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const groups = await dbService.getAccountGroups(user.id);
    return NextResponse.json(groups);
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
    const validated = createGroupSchema.parse(body);

    const group = await dbService.createAccountGroup(user.id, {
      name: validated.name.trim(),
      description: validated.description.trim(),
      is_warmup_enabled: validated.is_warmup_enabled,
      warmup_daily_limit: validated.warmup_daily_limit,
      warmup_ramp_per_day: validated.warmup_ramp_per_day,
      warmup_reply_rate: validated.warmup_reply_rate,
    });

    await dbService.logActivity(user.id, 'account_group_created', 'account_groups', group.id, {
      name: group.name,
      is_warmup_enabled: group.is_warmup_enabled,
    });

    return NextResponse.json({ success: true, group }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
