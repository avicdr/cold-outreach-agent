import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { z } from 'zod';

const updateGroupSchema = z.object({
  name: z.string().min(1, 'Group name cannot be empty').max(100).optional(),
  description: z.string().optional(),
  is_warmup_enabled: z.boolean().optional(),
  warmup_daily_limit: z.number().int().min(1).max(50).optional(),
  warmup_ramp_per_day: z.number().int().min(1).max(10).optional(),
  warmup_reply_rate: z.number().int().min(10).max(100).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const group = await dbService.getAccountGroup(id);
    if (!group || (group.user_id !== user.id && !user.isOwner)) {
      return NextResponse.json({ error: 'Account group not found' }, { status: 404 });
    }

    const body = await request.json();
    const validated = updateGroupSchema.parse(body);

    const updatePayload: Record<string, unknown> = {};
    if (validated.name !== undefined) updatePayload.name = validated.name.trim();
    if (validated.description !== undefined) updatePayload.description = validated.description.trim();
    if (validated.is_warmup_enabled !== undefined) updatePayload.is_warmup_enabled = validated.is_warmup_enabled;
    if (validated.warmup_daily_limit !== undefined) updatePayload.warmup_daily_limit = validated.warmup_daily_limit;
    if (validated.warmup_ramp_per_day !== undefined) updatePayload.warmup_ramp_per_day = validated.warmup_ramp_per_day;
    if (validated.warmup_reply_rate !== undefined) updatePayload.warmup_reply_rate = validated.warmup_reply_rate;

    const updated = await dbService.updateAccountGroup(id, updatePayload);

    // If warmup was toggled for this group, also sync all member accounts
    if (validated.is_warmup_enabled !== undefined) {
      const accounts = await dbService.getEmailAccounts(user.id, { groupId: id });
      for (const acc of accounts) {
        await dbService.updateEmailAccount(acc.id, {
          warmup_enabled: validated.is_warmup_enabled,
          warmup_status: validated.is_warmup_enabled ? (acc.warmup_status === 'inactive' ? 'warming' : acc.warmup_status || 'warming') : 'inactive',
        });
      }
    }

    await dbService.logActivity(user.id, 'account_group_updated', 'account_groups', id, validated);

    return NextResponse.json({ success: true, group: updated });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const group = await dbService.getAccountGroup(id);
    if (!group || (group.user_id !== user.id && !user.isOwner)) {
      return NextResponse.json({ error: 'Account group not found' }, { status: 404 });
    }

    await dbService.deleteAccountGroup(id);
    await dbService.logActivity(user.id, 'account_group_deleted', 'account_groups', id, { name: group.name });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
