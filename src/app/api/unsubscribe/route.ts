import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-token';
import { handleProcessUnsubscribeJob } from '@/lib/queue/worker';
import { z } from 'zod';

const unsubscribeSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = unsubscribeSchema.parse(body);

    const payload = verifyUnsubscribeToken(token);

    // Process unsubscribe immediately
    await handleProcessUnsubscribeJob({
      userId: payload.userId,
      normalizedEmail: payload.normalizedEmail,
    });

    return NextResponse.json({
      success: true,
      message: 'You have been successfully unsubscribed and suppressed from all future communications.',
      email: payload.normalizedEmail,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }
}
