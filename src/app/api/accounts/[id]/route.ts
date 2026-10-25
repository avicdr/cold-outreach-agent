import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { encryptToken } from '@/lib/crypto';
import { z } from 'zod';

const updateAccountSchema = z.object({
  sender_name: z.string().optional(),
  group_id: z.string().uuid().nullable().optional(),
  daily_limit: z.number().int().min(1).max(18).optional(),
  min_interval_minutes: z.number().int().min(5).max(60).optional(),
  status: z.enum(['active', 'paused', 'error']).optional(),
  warmup_enabled: z.boolean().optional(),
  warmup_status: z.enum(['inactive', 'warming', 'warm', 'paused']).optional(),
  smtp_host: z.string().optional().nullable(),
  smtp_port: z.number().int().min(1).max(65535).optional().nullable(),
  smtp_secure: z.boolean().optional().nullable(),
  smtp_username: z.string().optional().nullable(),
  smtp_password: z.string().optional().nullable(),
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
    const account = await dbService.getEmailAccount(id);
    if (!account || (account.user_id !== user.id && !user.isOwner)) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json(account);
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
    const account = await dbService.getEmailAccount(id);
    if (!account || (account.user_id !== user.id && !user.isOwner)) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const body = await request.json();
    const validated = updateAccountSchema.parse(body);

    const updated = await dbService.updateEmailAccount(id, {
      ...(validated.sender_name !== undefined ? { sender_name: validated.sender_name.trim() } : {}),
      ...(validated.group_id !== undefined ? { group_id: validated.group_id } : {}),
      ...(validated.daily_limit !== undefined ? { daily_limit: Math.min(18, Math.max(1, validated.daily_limit)) } : {}),
      ...(validated.min_interval_minutes !== undefined ? { min_interval_minutes: validated.min_interval_minutes } : {}),
      ...(validated.status !== undefined ? { status: validated.status } : {}),
      ...(validated.warmup_enabled !== undefined ? { warmup_enabled: validated.warmup_enabled } : {}),
      ...(validated.warmup_status !== undefined ? { warmup_status: validated.warmup_status } : {}),
      ...(validated.smtp_host !== undefined ? { smtp_host: validated.smtp_host } : {}),
      ...(validated.smtp_port !== undefined ? { smtp_port: validated.smtp_port } : {}),
      ...(validated.smtp_secure !== undefined ? { smtp_secure: validated.smtp_secure } : {}),
      ...(validated.smtp_username !== undefined ? { smtp_username: validated.smtp_username } : {}),
      ...(validated.smtp_password
        ? {
            encrypted_smtp_password: encryptToken(validated.smtp_password),
            encrypted_access_token: encryptToken(validated.smtp_password),
          }
        : {}),
    });

    await dbService.logActivity(user.id, 'account_updated', 'email_accounts', id, validated);

    return NextResponse.json({ success: true, account: updated });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const account = await dbService.getEmailAccount(id);
    if (!account || (account.user_id !== user.id && !user.isOwner)) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    await dbService.deleteEmailAccount(user.id, id);
    await dbService.logActivity(user.id, 'account_deleted', 'email_accounts', id, { email: account.email_address });

    return NextResponse.json({ success: true, id });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
