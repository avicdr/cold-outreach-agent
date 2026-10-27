import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { decryptToken } from '@/lib/crypto';
import { executeWithGmailAuth } from '@/lib/gmail/tokens';
import { sendGmailMessage } from '@/lib/gmail/client';
import { sendSmtpEmail } from '@/lib/smtp/client';
import { z } from 'zod';

import { checkRateLimit, getClientIp } from '@/lib/security';

const testEmailSchema = z.object({
  recipient_email: z.string().email('Please provide a valid email address'),
  subject: z.string().optional(),
  body_text: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit: max 5 test emails per 10 minutes per user/IP to prevent spam relay abuse
  const clientIp = getClientIp(request);
  const rateKey = `test_email:${user.id}:${clientIp}`;
  const rateCheck = checkRateLimit(rateKey, 5, 10 * 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded: You can send at most 5 test emails every 10 minutes.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { recipient_email, subject: bodySubject, body_text: bodyContent } = testEmailSchema.parse(body);

    // 1. Get the draft message from database and verify ownership
    const message = await dbService.getMessage(id);
    if (message && message.campaign_id) {
      const campaign = await dbService.getCampaign(message.campaign_id);
      if (!campaign || campaign.user_id !== user.id) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      }
    }
    const subject = bodySubject || message?.subject || 'Test Outreach Email';
    const bodyText = bodyContent || message?.body_text || 'This is a test email from your AI Cold Outreach Agent.';

    // 2. Verify Inbox is connected
    const emailAccount = await dbService.getConnectedEmailAccount(user.id);
    if (!emailAccount) {
      return NextResponse.json(
        { error: 'No email inbox connected. Please connect an inbox in Accounts first.' },
        { status: 400 }
      );
    }

    let sendResult: { id: string; threadId: string };

    if (emailAccount.provider === 'smtp') {
      let smtpPassword = '';
      try {
        smtpPassword = decryptToken(emailAccount.encrypted_smtp_password || emailAccount.encrypted_access_token);
      } catch {
        smtpPassword = emailAccount.encrypted_smtp_password || emailAccount.encrypted_access_token;
      }

      const senderDisplay = emailAccount.sender_name?.trim()
        ? `"${emailAccount.sender_name.trim()}" <${emailAccount.email_address}>`
        : emailAccount.email_address;

      sendResult = await sendSmtpEmail(
        {
          host: emailAccount.smtp_host || 'smtp.titan.email',
          port: emailAccount.smtp_port || 465,
          secure: emailAccount.smtp_secure ?? (emailAccount.smtp_port === 465 || !emailAccount.smtp_port),
          user: emailAccount.smtp_username || emailAccount.email_address,
          pass: smtpPassword,
        },
        {
          to: recipient_email,
          from: senderDisplay,
          subject: `[TEST] ${subject}`,
          bodyText: `${bodyText}\n\n---\n[Test Email sent from ${emailAccount.email_address} via AI Cold Outreach Agent (Titan / GoDaddy)]`,
        }
      );
    } else {
      sendResult = await executeWithGmailAuth(emailAccount, (token) =>
        sendGmailMessage(token, {
          to: recipient_email,
          from: emailAccount.email_address,
          subject: `[TEST] ${subject}`,
          bodyText: `${bodyText}\n\n---\n[Test Email sent from ${emailAccount.email_address} via AI Cold Outreach Agent]`,
        })
      );
    }

    await dbService.logActivity(user.id, 'test_email_sent', 'email_messages', id, {
      recipient: recipient_email,
      gmail_message_id: sendResult.id,
    });

    return NextResponse.json({
      success: true,
      message_id: sendResult.id,
      recipient: recipient_email,
      sender: emailAccount.email_address,
    });
  } catch (err: unknown) {
    console.error('Test email send error:', err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
