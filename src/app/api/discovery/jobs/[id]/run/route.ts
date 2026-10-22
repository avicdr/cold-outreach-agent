import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { executeDiscoveryJob } from '@/lib/discovery/service';

export async function POST(
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

    if (job.status === 'running') {
      return NextResponse.json({ error: 'Job is already running' }, { status: 409 });
    }

    const url = new URL(request.url);
    const provider = url.searchParams.get('provider') || undefined;

    // Execute discovery job
    const stats = await executeDiscoveryJob(id, provider);
    return NextResponse.json({ success: true, stats });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Manual discovery job trigger failed for ${id}:`, errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
