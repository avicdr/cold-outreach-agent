import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { z } from 'zod';

const updateDiscoveryJobSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  niche: z.string().min(1).max(100).optional(),
  location: z.string().min(1).max(100).optional(),
  target_count: z.number().int().min(1).max(100).optional(),
  min_qualification_score: z.number().int().min(0).max(100).optional(),
  auto_enroll_campaign_id: z.string().uuid().nullable().optional(),
  auto_enroll_enabled: z.boolean().optional(),
  schedule_frequency: z.enum(['once', 'daily', 'weekly']).optional(),
  status: z.enum(['queued', 'running', 'completed', 'paused', 'failed']).optional(),
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
    const job = await dbService.getDiscoveryJob(id);
    if (!job || job.user_id !== user.id) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

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
    const job = await dbService.getDiscoveryJob(id);
    if (!job || job.user_id !== user.id) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const body = await request.json();
    const validated = updateDiscoveryJobSchema.parse(body);

    const updated = await dbService.updateDiscoveryJob(id, validated);
    return NextResponse.json({ success: true, job: updated });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  try {
    const job = await dbService.getDiscoveryJob(id);
    if (!job || job.user_id !== user.id) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    await dbService.deleteDiscoveryJob(id);
    return NextResponse.json({ success: true, message: 'Job deleted' });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
