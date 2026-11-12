import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { instagramDb } from '@/lib/instagram/db';
import {
  normalizeInstagramHandle,
  isValidInstagramHandle,
  formatInstagramHandle,
  buildInstagramUrl,
} from '@/lib/instagram/handles';
import { z } from 'zod';

const singleLeadSchema = z.object({
  instagram_handle: z.string().optional().default(''),
  instagram_url: z.string().optional().default(''),
  full_name: z.string().optional().default(''),
  first_name: z.string().optional().default(''),
  last_name: z.string().optional().default(''),
  company: z.string().optional().default(''),
  niche: z.string().optional().default(''),
  bio: z.string().optional().default(''),
  followers_count: z.number().int().nonnegative().nullable().optional(),
  website: z.string().optional().default(''),
  city: z.string().optional().default(''),
  country: z.string().optional().default(''),
  email: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  personalization_hook: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  group_id: z.string().nullable().optional(),
  custom_fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
});

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || undefined;
  const search = searchParams.get('search') || undefined;
  const groupId = searchParams.get('group_id') || searchParams.get('groupId') || undefined;
  const handleState = (searchParams.get('handle_state') as 'all' | 'has_handle' | 'missing_handle') || undefined;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const offset = (page - 1) * limit;

  try {
    const data = await instagramDb.getInstagramLeads(user.id, {
      status,
      search,
      groupId,
      handleState,
      limit,
      offset,
    });
    return NextResponse.json({
      ...data,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil((data.total || 0) / limit)),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();

    // Support bulk handle paste: { handles: string[], group_id?: string, campaign_id?: string }
    if (Array.isArray(body?.handles)) {
      const existingHandles = await instagramDb.getExistingNormalizedHandles(user.id);
      const toInsert: any[] = [];
      const invalid: string[] = [];
      const seen = new Set<string>();

      for (const raw of body.handles) {
        const norm = normalizeInstagramHandle(String(raw || ''));
        if (!norm || !isValidInstagramHandle(norm)) {
          if (String(raw || '').trim()) invalid.push(String(raw));
          continue;
        }
        if (seen.has(norm) || existingHandles.has(norm)) continue;
        seen.add(norm);
        toInsert.push({
          normalized_handle: norm,
          instagram_handle: formatInstagramHandle(norm),
          instagram_url: buildInstagramUrl(norm),
          group_id: body.group_id || null,
          source_import: 'bulk_handles',
          status: 'active',
        });
      }

      const result = await instagramDb.insertInstagramLeads(user.id, toInsert);
      if (body.campaign_id && result.insertedLeads.length > 0) {
        await instagramDb.enrollInstagramLeads(
          body.campaign_id,
          result.insertedLeads.map((l) => l.id)
        );
      }

      return NextResponse.json(
        {
          success: true,
          inserted: result.inserted,
          leads: result.insertedLeads,
          invalid,
          errors: result.errors,
        },
        { status: 201 }
      );
    }

    const validated = singleLeadSchema.parse(body);
    const normalized = normalizeInstagramHandle(validated.instagram_handle || validated.instagram_url);

    if (normalized && !isValidInstagramHandle(normalized)) {
      return NextResponse.json({ error: 'Invalid Instagram handle format' }, { status: 400 });
    }

    if (!normalized && !validated.full_name && !validated.company) {
      return NextResponse.json(
        { error: 'Provide an Instagram handle, name, or company' },
        { status: 400 }
      );
    }

    const result = await instagramDb.insertInstagramLeads(user.id, [
      {
        ...validated,
        normalized_handle: normalized,
        instagram_handle: normalized ? formatInstagramHandle(normalized) : '',
        instagram_url: validated.instagram_url || (normalized ? buildInstagramUrl(normalized) : ''),
        status: 'active',
        source_import: 'manual',
      },
    ]);

    if (result.inserted === 0 && result.errors.length > 0) {
      return NextResponse.json({ error: result.errors[0] }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      count: result.inserted,
      lead: result.insertedLeads[0] || null,
    }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
