import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { z } from 'zod';

const updateGroupSchema = z.object({
  name: z.string().min(1, 'Group name cannot be empty').max(100).optional(),
  description: z.string().optional(),
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
    if (!group || group.user_id !== user.id) {
      return NextResponse.json({ error: 'Account group not found' }, { status: 404 });
    }

    const body = await request.json();
    const validated = updateGroupSchema.parse(body);

    const updated = await dbService.updateAccountGroup(id, {
      ...(validated.name !== undefined ? { name: validated.name.trim() } : {}),
      ...(validated.description !== undefined ? { description: validated.description.trim() } : {}),
    });

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
    if (!group || group.user_id !== user.id) {
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
