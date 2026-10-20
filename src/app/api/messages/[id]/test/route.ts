import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { decryptToken, encryptToken } from '@/lib/crypto';
import { refreshAccessToken } from '@/lib/gmail/oauth';
import { sendGmailMessage } from '@/lib/gmail/client';
import { z } from 'zod';

const testEmailSchema = z.object({
  recipient_email: z.string().email('Please provide a valid email address'),
  subject: z.string().optional(),
  body_text: z.string().optional(),
});

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
    const body = await request.json();
    const { recipient_email, subject: bodySubject, body_text: bodyContent } = testEmailSchema.parse(body);

    // 1. Get the draft message from database
    const message = await dbService.getMessage(id);
    const subject = bodySubject || message?.subject || 'Test Outreach Email';
    const bodyText = bodyContent || message?.body_text || 'This is a test email from your AI Cold Outreach Agent.';

    // 2. Verify Gmail is connected
    const emailAccount = await dbService.getConnectedEmailAccount(user.id);
    if (!emailAccount) {
      return NextResponse.json(
        { error: 'No Gmail account connected. Please go to Settings and connect your Gmail account first.' },
        { status: 400 }
      );
    }

    // 3. Decrypt and validate token
    let accessToken = '';
    try {
      accessToken = decryptToken(emailAccount.encrypted_access_token);
    } catch {
      accessToken = emailAccount.encrypted_access_token;
    }

    // Check expiration and refresh if needed
    const isExpired = emailAccount.token_expires_at
      ? new Date(emailAccount.token_expires_at).getTime() - Date.now() < 60000
      : false;

    if (isExpired && emailAccount.encrypted_refresh_token) {
      try {
        const refreshToken = decryptToken(emailAccount.encrypted_refresh_token);
        const refreshed = await refreshAccessToken(refreshToken);
        accessToken = refreshed.access_token;

        await dbService.upsertEmailAccount({
          ...emailAccount,
          encrypted_access_token: encryptToken(accessToken),
          token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        });
      } catch (refreshErr) {
        console.warn('Failed to refresh token during test send:', refreshErr);
      }
    }

    // 4. Send the test email via Gmail API (with auto-refresh retry on 401)
    let sendResult;
    try {
      sendResult = await sendGmailMessage(accessToken, {
        to: recipient_email,
        from: emailAccount.email_address,
        subject: `[TEST] ${subject}`,
        bodyText: `${bodyText}\n\n---\n[Test Email sent from ${emailAccount.email_address} via AI Cold Outreach Agent]`,
      });
    } catch (sendErr: unknown) {
      const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      if (emailAccount.encrypted_refresh_token && (errMsg.includes('401') || errMsg.includes('invalid_grant'))) {
        try {
          const refreshToken = decryptToken(emailAccount.encrypted_refresh_token);
          const refreshed = await refreshAccessToken(refreshToken);
          accessToken = refreshed.access_token;

          await dbService.upsertEmailAccount({
            ...emailAccount,
            encrypted_access_token: encryptToken(accessToken),
            token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          });

          sendResult = await sendGmailMessage(accessToken, {
            to: recipient_email,
            from: emailAccount.email_address,
            subject: `[TEST] ${subject}`,
            bodyText: `${bodyText}\n\n---\n[Test Email sent from ${emailAccount.email_address} via AI Cold Outreach Agent]`,
          });
        } catch {
          throw sendErr;
        }
      } else {
        throw sendErr;
      }
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
