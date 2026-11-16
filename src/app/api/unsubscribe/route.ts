import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-token';
import { handleProcessUnsubscribeJob } from '@/lib/queue/worker';

export async function GET(request: NextRequest) {
  const url = request.nextUrl ?? new URL(request.url);
  const token = url.searchParams.get('token');
  const redirectUrl = new URL('/unsubscribe', request.url);
  if (token) {
    redirectUrl.searchParams.set('token', token);
  }
  return NextResponse.redirect(redirectUrl);
}

export async function POST(request: NextRequest) {
  try {
    const url = request.nextUrl ?? new URL(request.url);
    let token: string | null = url.searchParams.get('token');

    if (!token) {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          const body = await request.json();
          if (body && typeof body.token === 'string') {
            token = body.token;
          }
        } catch {
          // JSON parsing failed
        }
      } else if (
        contentType.includes('application/x-www-form-urlencoded') ||
        contentType.includes('multipart/form-data')
      ) {
        try {
          const formData = await request.formData();
          const formToken = formData.get('token');
          if (typeof formToken === 'string') {
            token = formToken;
          }
        } catch {
          // Form parsing failed
        }
      }
    }

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

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

