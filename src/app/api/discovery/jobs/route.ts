import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { z } from 'zod';

const createDiscoveryJobSchema = z.object({
  name: z.string().min(1, 'Job name is required').max(100),
  niche: z.string().min(1, 'Target niche is required').max(100),
  location: z.string().min(1, 'Target location is required').max(100),
  country: z.string().default('US'),
  radius_km: z.number().int().min(1).max(200).default(25),
  target_count: z.number().int().min(1).max(100).default(20),
  min_qualification_score: z.number().int().min(0).max(100).default(70),
  auto_enroll_campaign_id: z.string().uuid().nullable().optional(),
  auto_enroll_enabled: z.boolean().default(false),
  schedule_frequency: z.enum(['once', 'daily', 'weekly']).default('once'),
  run_immediately: z.boolean().default(true),
});

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const jobs = await dbService.getDiscoveryJobs(user.id);
    return NextResponse.json(jobs);
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
    const validated = createDiscoveryJobSchema.parse(body);

    const job = await dbService.createDiscoveryJob(user.id, {
      name: validated.name.trim(),
      niche: validated.niche.trim(),
      location: validated.location.trim(),
      country: validated.country,
      radius_km: validated.radius_km,
      target_count: validated.target_count,
      min_qualification_score: validated.min_qualification_score,
      auto_enroll_campaign_id: validated.auto_enroll_campaign_id || null,
      auto_enroll_enabled: validated.auto_enroll_enabled,
      schedule_frequency: validated.schedule_frequency,
      status: 'queued',
      last_run_at: null,
      next_run_at: validated.schedule_frequency !== 'once' ? new Date().toISOString() : null,
      discovered_count: 0,
      qualified_count: 0,
      high_priority_count: 0,
      enrolled_count: 0,
      error_message: null,
    });

    await dbService.logActivity(user.id, 'discovery_job_created', 'discovery_jobs', job.id, {
      name: job.name,
      niche: job.niche,
      location: job.location,
    });

    // Run immediately in background if requested
    if (validated.run_immediately) {
      const { executeDiscoveryJob } = await import('@/lib/discovery/service');
      executeDiscoveryJob(job.id).catch((err) => {
        console.error(`Background discovery job execution error for ${job.id}:`, err);
      });
    }

    return NextResponse.json({ success: true, job }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
