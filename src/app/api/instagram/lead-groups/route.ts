import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { instagramDb } from '@/lib/instagram/db';
import { z } from 'zod';

const groupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  description: z.string().optional().default(''),
});

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const groups = await instagramDb.getInstagramLeadGroups(user.id);
    return NextResponse.json(groups);
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const validated = groupSchema.parse(body);
    const group = await instagramDb.createInstagramLeadGroup(user.id, validated);
    return NextResponse.json(group, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
