import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { z } from 'zod';

const updateLeadGroupSchema = z.object({
  name: z.string().min(1, 'Group name cannot be empty').max(100).optional(),
  description: z.string().max(500).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [group, leadsResult] = await Promise.all([
      dbService.getLeadGroup(id),
      dbService.getLeads(user.id, { groupId: id, limit: 100 }),
    ]);
    if (!group || group.user_id !== user.id) {
      return NextResponse.json({ error: 'Lead group not found' }, { status: 404 });
    }

    return NextResponse.json({ group, leads: leadsResult.leads });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await dbService.getLeadGroup(id);
    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Lead group not found' }, { status: 404 });
    }

    const body = await request.json();
    const validated = updateLeadGroupSchema.parse(body);

    const updated = await dbService.updateLeadGroup(id, validated);

    await dbService.logActivity(user.id, 'lead_group_updated', 'lead_groups', id, validated);

    return NextResponse.json({ success: true, group: updated });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.flatten().fieldErrors }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const group = await dbService.getLeadGroup(id);
    if (!group || group.user_id !== user.id) {
      return NextResponse.json({ error: 'Lead group not found' }, { status: 404 });
    }

    await dbService.deleteLeadGroup(id);

    await dbService.logActivity(user.id, 'lead_group_deleted', 'lead_groups', id, {
      name: group.name,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
