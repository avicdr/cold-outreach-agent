import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { normalizeEmail, isValidEmailSyntax } from '@/lib/csv-excel';
import { z } from 'zod';

const createLeadSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional().default(''),
  last_name: z.string().optional().default(''),
  company: z.string().optional().default(''),
  job_title: z.string().optional().default(''),
  website: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  group_id: z.string().nullable().optional(),
  custom_fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
});

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || undefined;
  const search = searchParams.get('search') || undefined;
  const groupId = searchParams.get('group_id') || searchParams.get('groupId') || undefined;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || searchParams.get('pageSize') || '25', 10);
  const offset = searchParams.get('offset') !== null ? parseInt(searchParams.get('offset')!, 10) : (page - 1) * limit;

  try {
    const data = await dbService.getLeads(user.id, { status, search, limit, offset, groupId });
    return NextResponse.json({
      ...data,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil((data.total || 0) / limit)),
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
    const validated = createLeadSchema.parse(body);
    const normalized = normalizeEmail(validated.email);

    if (!isValidEmailSyntax(normalized)) {
      return NextResponse.json({ error: 'Invalid email syntax' }, { status: 400 });
    }

    // Check suppression list
    const suppressions = await dbService.getSuppressedNormalizedEmails(user.id);
    if (suppressions.has(normalized)) {
      return NextResponse.json({ error: 'This email is on the global suppression list' }, { status: 400 });
    }

    const result = await dbService.insertLeads(user.id, [
      {
        ...validated,
        normalized_email: normalized,
        status: 'active',
        source_import: 'manual',
      },
    ]);

    if (result.errors.length > 0) {
      return NextResponse.json({ error: result.errors[0] }, { status: 400 });
    }

    return NextResponse.json({ success: true, count: result.inserted });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.flatten().fieldErrors }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
