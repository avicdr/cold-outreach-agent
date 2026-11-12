import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { instagramDb } from '@/lib/instagram/db';
import { isValidInstagramHandle, normalizeInstagramHandle } from '@/lib/instagram/handles';
import { z } from 'zod';

const updateLeadSchema = z.object({
  instagram_handle: z.string().optional(),
  instagram_url: z.string().optional(),
  full_name: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
  niche: z.string().optional(),
  bio: z.string().optional(),
  followers_count: z.number().int().nonnegative().nullable().optional(),
  website: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  personalization_hook: z.string().optional(),
  notes: z.string().optional(),
  group_id: z.string().nullable().optional(),
  status: z.enum(['active', 'contacted', 'replied', 'do_not_contact', 'invalid']).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const lead = await instagramDb.getInstagramLead(id);
  if (!lead || lead.user_id !== user.id) {
    return NextResponse.json({ error: 'Instagram lead not found' }, { status: 404 });
  }
  return NextResponse.json(lead);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await instagramDb.getInstagramLead(id);
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Instagram lead not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const validated = updateLeadSchema.parse(body);

    if (validated.instagram_handle !== undefined) {
      const trimmed = validated.instagram_handle.trim();
      if (trimmed) {
        const norm = normalizeInstagramHandle(trimmed);
        if (!isValidInstagramHandle(norm)) {
          return NextResponse.json({ error: `Invalid Instagram handle: "${trimmed}"` }, { status: 400 });
        }
      }
    }

    const updated = await instagramDb.updateInstagramLead(id, validated);
    return NextResponse.json({ success: true, lead: updated });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await instagramDb.getInstagramLead(id);
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Instagram lead not found' }, { status: 404 });
  }

  try {
    await instagramDb.deleteInstagramLead(id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
