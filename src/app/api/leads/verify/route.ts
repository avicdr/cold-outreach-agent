import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { verifyEmail } from '@/lib/verification/reacher';
import { verifyLeadById, verifyLeadsBatch, verifyAllUnverifiedLeads } from '@/lib/verification/service';
import { z } from 'zod';

const verifyRequestSchema = z.object({
  email: z.string().optional(),
  leadId: z.string().optional(),
  leadIds: z.array(z.string()).optional(),
  verifyAll: z.boolean().optional(),
  groupId: z.string().optional(),
  campaignId: z.string().optional(),
});

/**
 * GET /api/leads/verify?email=user@example.com
 * Quickly verifies an email syntax, MX records, and deliverability.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  if (!email || !email.trim()) {
    return NextResponse.json({ error: 'Query parameter "email" is required' }, { status: 400 });
  }

  try {
    const result = await verifyEmail(email.trim());
    return NextResponse.json({ email: email.trim(), result });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

/**
 * POST /api/leads/verify
 * Triggers on-demand verification for:
 * - A single email address
 * - A single lead ID
 * - A list of lead IDs
 * - All unverified leads in the user's workspace (or within a group/campaign)
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const validated = verifyRequestSchema.parse(body);

    // 1. Single email direct verification
    if (validated.email) {
      const result = await verifyEmail(validated.email);
      return NextResponse.json({
        type: 'single_email',
        email: validated.email,
        result,
      });
    }

    // 2. Single lead ID verification
    if (validated.leadId) {
      const { lead, result } = await verifyLeadById(validated.leadId);
      return NextResponse.json({
        type: 'single_lead',
        lead,
        result,
      });
    }

    // 3. Batch lead IDs verification
    if (validated.leadIds && validated.leadIds.length > 0) {
      const summary = await verifyLeadsBatch(validated.leadIds);
      return NextResponse.json({
        type: 'batch_leads',
        ...summary,
      });
    }

    // 4. Verify all unverified leads (optionally filtered by groupId or campaignId)
    if (validated.verifyAll || validated.groupId || validated.campaignId) {
      const summary = await verifyAllUnverifiedLeads(user.id, {
        groupId: validated.groupId,
        campaignId: validated.campaignId,
      });
      return NextResponse.json({
        type: 'bulk_unverified',
        ...summary,
      });
    }

    return NextResponse.json(
      { error: 'Provide at least one of: email, leadId, leadIds, or verifyAll: true' },
      { status: 400 }
    );
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request body', details: err.flatten().fieldErrors }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

