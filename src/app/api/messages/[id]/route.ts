import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { validateDraft } from '@/lib/gemini';
import { sanitizeAccountForClient } from '@/lib/security';
import { EmailAccount } from '@/types/database';
import { z } from 'zod';

const updateDraftSchema = z.object({
  subject: z.string().min(1, 'Subject cannot be empty'),
  body_text: z.string().min(1, 'Body cannot be empty'),
  email_account_id: z.string().uuid().nullable().optional(),
});

async function resolveSenderDetails(userId: string, campaign: any, message: any) {
  let availableAccounts: EmailAccount[] = [];
  let group = null;

  if (campaign.account_group_id) {
    const allAccounts = await dbService.getEmailAccounts(userId, { status: 'active' });
    availableAccounts = allAccounts.filter((a) => a.group_id === campaign.account_group_id);
    if (availableAccounts.length === 0) availableAccounts = allAccounts;
    group = await dbService.getAccountGroup(campaign.account_group_id);
  } else if (campaign.email_account_id) {
    const specific = await dbService.getEmailAccount(campaign.email_account_id);
    if (specific) availableAccounts = [specific];
  } else {
    availableAccounts = await dbService.getEmailAccounts(userId, { status: 'active' });
  }

  let senderAccount: EmailAccount | null = null;
  if (message.email_account_id) {
    senderAccount = await dbService.getEmailAccount(message.email_account_id);
  }
  if (!senderAccount && availableAccounts.length > 0) {
    senderAccount = availableAccounts[0];
  }
  if (!senderAccount) {
    senderAccount = await dbService.getConnectedEmailAccount(userId);
  }

  return {
    sender_account: senderAccount ? sanitizeAccountForClient(senderAccount) : null,
    available_accounts: availableAccounts.map((a) => sanitizeAccountForClient(a)),
    campaign_group: group ? { id: group.id, name: group.name } : null,
  };
}

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

    const campaign = message.campaign_id ? await dbService.getCampaign(message.campaign_id) : null;
    if (!campaign || campaign.user_id !== user.id) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const isJob = Boolean(
      campaign && (
        /intern|internship|job|hiring|candidate|resume|engineering/i.test(campaign.name) ||
        /intern|internship|job|hiring|candidate|resume/i.test(campaign.offer)
      )
    );
    const allowed = isJob ? ['{{resume_url}}'] : [];
    const validation = validateDraft(message.body_text, message.subject, allowed);

    const senderDetails = await resolveSenderDetails(user.id, campaign, message);

    return NextResponse.json({
      message,
      validation,
      ...senderDetails,
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
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const message = await dbService.getMessage(id);
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const campaign = message.campaign_id ? await dbService.getCampaign(message.campaign_id) : null;
    if (!campaign || campaign.user_id !== user.id) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (message.status === 'sent') {
      return NextResponse.json({ error: 'Cannot edit an already sent email' }, { status: 400 });
    }

    const body = await request.json();
    const validated = updateDraftSchema.parse(body);

    const isJob = Boolean(
      campaign && (
        /intern|internship|job|hiring|candidate|resume|engineering/i.test(campaign.name) ||
        /intern|internship|job|hiring|candidate|resume/i.test(campaign.offer)
      )
    );
    const allowed = isJob ? ['{{resume_url}}'] : [];
    const draftCheck = validateDraft(validated.body_text, validated.subject, allowed);

    const updated = await dbService.createOrUpdateMessage({
      ...message,
      subject: validated.subject,
      body_text: validated.body_text,
      unsupported_claims: draftCheck.unsupported_claims,
      ...(validated.email_account_id !== undefined ? { email_account_id: validated.email_account_id } : {}),
    });

    const senderDetails = await resolveSenderDetails(user.id, campaign, updated);

    return NextResponse.json({
      message: updated,
      validation: draftCheck,
      ...senderDetails,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.flatten().fieldErrors }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
