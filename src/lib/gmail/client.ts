import crypto from 'crypto';
import { env } from '../env';

export interface SendEmailOptions {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  unsubscribeUrl?: string;
  threadId?: string;
  inReplyToMessageId?: string;
  references?: string;
}

export interface GmailSendResult {
  id: string;
  threadId: string;
  labelIds?: string[];
}

export interface InboundEmailMessage {
  id: string;
  threadId: string;
  senderEmail: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
  inReplyTo?: string;
  references?: string;
}

/**
 * Encodes a string or buffer into URL-safe base64 without padding (as required by Gmail API).
 */
export function encodeBase64Url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Builds an RFC 2822 MIME formatted email string.
 */
export function buildMimeEmail(options: SendEmailOptions): string {
  const {
    from,
    to,
    subject,
    bodyText,
    bodyHtml,
    unsubscribeUrl,
    inReplyToMessageId,
    references,
  } = options;

  const date = new Date().toUTCString();
  const domain = from.includes('@') ? from.split('@')[1] : 'coldoutreach.app';
  const messageId = `<${crypto.randomUUID()}@${domain}>`;

  const headers: string[] = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `Date: ${date}`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
  ];

  if (inReplyToMessageId) {
    headers.push(`In-Reply-To: ${inReplyToMessageId}`);
  }
  if (references) {
    headers.push(`References: ${references}`);
  }

  // Add CAN-SPAM and RFC 8058 compliant unsubscribe headers if provided
  if (unsubscribeUrl) {
    headers.push(`List-Unsubscribe: <${unsubscribeUrl}>`);
    headers.push(`List-Unsubscribe-Post: List-Unsubscribe=One-Click`);
  }

  if (bodyHtml) {
    const boundary = `----=_Part_${crypto.randomBytes(8).toString('hex')}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    
    const parts = [
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      bodyText,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      bodyHtml,
      ``,
      `--${boundary}--`,
    ];

    return `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`;
  }

  // Plain text email
  headers.push(`Content-Type: text/plain; charset="UTF-8"`);
  headers.push(`Content-Transfer-Encoding: 7bit`);

  return `${headers.join('\r\n')}\r\n\r\n${bodyText}`;
}

/**
 * Sends an email using the Gmail REST API (users.messages.send).
 */
export async function sendGmailMessage(
  accessToken: string,
  options: SendEmailOptions
): Promise<GmailSendResult> {
  const mime = buildMimeEmail(options);
  const raw = encodeBase64Url(mime);

  if (env.MOCK_MODE || accessToken.startsWith('mock-') || accessToken.startsWith('refreshed-mock-')) {
    // Mock delivery
    return {
      id: 'mock_msg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      threadId: options.threadId || 'mock_th_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      labelIds: ['SENT'],
    };
  }

  const payload: { raw: string; threadId?: string } = { raw };
  if (options.threadId) {
    payload.threadId = options.threadId;
  }

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gmail API send failed: ${response.status} ${errorBody}`);
  }

  return response.json();
}

/**
 * Polls Gmail for inbound replies.
 */
export async function pollGmailReplies(
  accessToken: string,
  sentGmailThreadIds: string[],
  ownEmailAddresses: string[] = []
): Promise<InboundEmailMessage[]> {
  if (sentGmailThreadIds.length === 0) return [];

  if (env.MOCK_MODE || accessToken.startsWith('mock-')) {
    // Return empty unless testing simulated replies
    return [];
  }

  const ownSet = new Set(ownEmailAddresses.map((e) => e.toLowerCase().trim()));
  const replies: InboundEmailMessage[] = [];

  for (const threadId of sentGmailThreadIds.slice(0, 20)) {
    try {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) continue;

      const thread = await response.json();
      const messages = thread.messages || [];

      // Threads with only 1 message haven't received any reply
      if (messages.length < 2) continue;

      // Search backwards for the latest message that is NOT from one of our own accounts
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const labels: string[] = msg.labelIds || [];
        const headers = msg.payload?.headers || [];
        const fromHeader = headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === 'from')?.value || '';
        const subjectHeader = headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === 'subject')?.value || '';
        const inReplyTo = headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === 'in-reply-to')?.value || '';

        // Extract sender email
        const senderMatch = fromHeader.match(/<([^>]+)>/) || [null, fromHeader];
        const senderEmail = (senderMatch[1] || fromHeader).trim().toLowerCase();

        // Skip outbound messages sent from our own sending accounts or marked as SENT
        if (labels.includes('SENT') || ownSet.has(senderEmail)) {
          continue;
        }

        // Found authentic inbound message from external recipient
        replies.push({
          id: msg.id,
          threadId,
          senderEmail,
          subject: subjectHeader,
          bodyText: msg.snippet || '',
          receivedAt: new Date(parseInt(msg.internalDate, 10)).toISOString(),
          inReplyTo,
        });

        // Only capture the latest prospect reply per thread
        break;
      }
    } catch (err) {
      console.error(`Failed to fetch thread ${threadId}:`, err);
    }
  }

  return replies;
}
