import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { validateDraft } from '@/lib/gemini';
import { z } from 'zod';

const updateDraftSchema = z.object({
  subject: z.string().min(1, 'Subject cannot be empty'),
  body_text: z.string().min(1, 'Body cannot be empty'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const message = await dbService.getMessage(id);
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const validation = validateDraft(message.body_text, message.subject);

    return NextResponse.json({
      message,
      validation,
    });
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
    const message = await dbService.getMessage(id);
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (message.status === 'sent') {
      return NextResponse.json({ error: 'Cannot edit an already sent email' }, { status: 400 });
    }

    const body = await request.json();
    const validated = updateDraftSchema.parse(body);

    const draftCheck = validateDraft(validated.body_text, validated.subject);

    const updated = await dbService.createOrUpdateMessage({
      ...message,
      subject: validated.subject,
      body_text: validated.body_text,
      unsupported_claims: draftCheck.unsupported_claims,
    });

    return NextResponse.json({
      message: updated,
      validation: draftCheck,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.flatten().fieldErrors }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
