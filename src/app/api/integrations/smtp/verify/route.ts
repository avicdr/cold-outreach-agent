import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { verifySmtp } from '@/lib/smtp/client';
import { isSafeHost, checkRateLimit, getClientIp } from '@/lib/security';
import { z } from 'zod';

const verifySmtpSchema = z.object({
  host: z.string().min(1, 'SMTP host is required'),
  port: z.number().int().min(1).max(65535).default(465),
  secure: z.boolean().optional(),
  user: z.string().min(1, 'SMTP username is required'),
  pass: z.string().min(1, 'SMTP password is required'),
});

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`smtp-verify:${user.id}:${clientIp}`, 5, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many verification attempts. Please wait.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter || 60) } }
    );
  }

  try {
    const body = await request.json();
    const validated = verifySmtpSchema.parse(body);

    const hostCheck = isSafeHost(validated.host.trim());
    if (!hostCheck.safe) {
      return NextResponse.json(
        { success: false, error: `Invalid or forbidden SMTP host: ${hostCheck.reason}` },
        { status: 400 }
      );
    }

    const result = await verifySmtp({
      host: validated.host.trim(),
      port: validated.port,
      secure: validated.secure ?? (validated.port === 465),
      user: validated.user.trim(),
      pass: validated.pass,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message || 'SMTP authentication failed' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'SMTP credentials verified successfully!',
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
