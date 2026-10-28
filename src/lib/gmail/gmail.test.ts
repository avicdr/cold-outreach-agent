import { describe, it, expect } from 'vitest';
import { generateOAuthState, validateOAuthState } from './oauth';
import { buildMimeEmail, encodeBase64Url, sendGmailMessage } from './client';

describe('Gmail & OAuth Integrations', () => {
  it('generates and validates OAuth state correctly', () => {
    const userId = 'user-uuid-abc';
    const state = generateOAuthState(userId);

    expect(typeof state).toBe('string');
    const result = validateOAuthState(state);
    expect(result.isValid).toBe(true);
    expect(result.userId).toBe(userId);
  });

  it('rejects tampered OAuth state', () => {
    const userId = 'user-uuid-abc';
    const state = generateOAuthState(userId);
    const tampered = state.slice(0, -4) + 'zzzz';

    const result = validateOAuthState(tampered);
    expect(result.isValid).toBe(false);
  });

  it('encodes base64url correctly without padding', () => {
    const raw = 'Hello world from Gmail MIME test!';
    const encoded = encodeBase64Url(raw);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('builds RFC 2822 compliant MIME message with unsubscribe headers', () => {
    const mime = buildMimeEmail({
      from: 'sender@business.com',
      to: 'lead@prospect.com',
      subject: 'Opportunity to connect',
      bodyText: 'Hey there, wanted to reach out.',
      unsubscribeUrl: 'https://coldoutreach.app/unsubscribe?token=sample123',
    });

    expect(mime).toContain('From: sender@business.com');
    expect(mime).toContain('To: lead@prospect.com');
    expect(mime).toContain('List-Unsubscribe: <https://coldoutreach.app/unsubscribe?token=sample123>');
    expect(mime).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
    expect(mime).toContain('Message-ID:');
    expect(mime).toContain('Hey there, wanted to reach out.');
    expect(mime).not.toContain('To stop receiving these emails');
    expect(mime).not.toContain('click here:');
  });

  it('builds threaded email with In-Reply-To and References', () => {
    const mime = buildMimeEmail({
      from: 'sender@business.com',
      to: 'lead@prospect.com',
      subject: 'Re: Opportunity to connect',
      bodyText: 'Just following up.',
      inReplyToMessageId: '<original-msg-123@business.com>',
      references: '<original-msg-123@business.com>',
      threadId: 'th_12345',
    });

    expect(mime).toContain('In-Reply-To: <original-msg-123@business.com>');
    expect(mime).toContain('References: <original-msg-123@business.com>');
  });

  it('builds RFC 2822 compliant MIME message with attachments', () => {
    const mime = buildMimeEmail({
      from: 'sender@business.com',
      to: 'lead@prospect.com',
      subject: 'Opportunity to connect with Resume',
      bodyText: 'Please see attached resume.',
      attachments: [
        {
          filename: 'Resume_Avi.pdf',
          contentType: 'application/pdf',
          contentBase64: 'JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDw...',
        },
      ],
    });

    expect(mime).toContain('Content-Type: multipart/mixed;');
    expect(mime).toContain('Content-Disposition: attachment; filename="Resume_Avi.pdf"');
    expect(mime).toContain('Content-Type: application/pdf; name="Resume_Avi.pdf"');
    expect(mime).toContain('JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDw...');
  });

  it('sends via mock adapter when in mock mode', async () => {
    const result = await sendGmailMessage('mock-token', {
      from: 'sender@business.com',
      to: 'lead@prospect.com',
      subject: 'Test Subject',
      bodyText: 'Test Body',
    });

    expect(result.id).toMatch(/^mock_msg_/);
    expect(result.threadId).toMatch(/^mock_th_/);
    expect(result.labelIds).toContain('SENT');
  });
});
