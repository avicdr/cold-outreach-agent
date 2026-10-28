import nodemailer, { type SendMailOptions } from 'nodemailer';
import crypto from 'crypto';
import { env } from '../env';

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
}

export interface SendSmtpOptions {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  unsubscribeUrl?: string;
  threadId?: string;
  inReplyToMessageId?: string;
  references?: string;
  attachments?: { filename: string; contentType: string; contentBase64: string }[];
}

export interface SmtpSendResult {
  id: string;
  threadId: string;
}

/**
 * Validates connection to SMTP server (e.g. Titan / GoDaddy / Custom)
 */
export async function verifySmtp(config: SmtpConfig): Promise<{ success: boolean; message?: string }> {
  if (
    env.MOCK_MODE ||
    config.pass.startsWith('mock-') ||
    config.pass.includes('mock') ||
    config.host === 'mock.smtp' ||
    process.env.NODE_ENV === 'test'
  ) {
    return { success: true, message: 'Mock SMTP credentials verified' };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? (config.port === 465),
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
  });

  try {
    await transporter.verify();
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: errorMsg };
  }
}

/**
 * Sends an email via standard SMTP (e.g. Titan Mail, GoDaddy, Custom)
 */
export async function sendSmtpEmail(
  config: SmtpConfig,
  options: SendSmtpOptions
): Promise<SmtpSendResult> {
  if (
    env.MOCK_MODE ||
    config.pass.startsWith('mock-') ||
    config.pass.includes('mock') ||
    config.host === 'mock.smtp' ||
    process.env.NODE_ENV === 'test'
  ) {
    const mockMsgId = '<mock_smtp_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16) + '@' + (config.host || 'titan.email') + '>';
    return {
      id: mockMsgId,
      threadId: options.threadId || 'mock_th_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16),
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? (config.port === 465),
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 15000,
  });

  const headers: Record<string, string> = {
    'X-Mailer': 'AI-Cold-Outreach-Agent/1.0',
  };

  if (options.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${options.unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  if (options.inReplyToMessageId) {
    headers['In-Reply-To'] = options.inReplyToMessageId;
  }

  if (options.references) {
    headers['References'] = options.references;
  }

  const mailOptions: SendMailOptions = {
    from: options.from,
    to: options.to,
    subject: options.subject,
    text: options.bodyText,
    html: options.bodyHtml,
    headers,
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.contentBase64, 'base64'),
      contentType: a.contentType,
    })),
  };

  const info = await transporter.sendMail(mailOptions);
  return {
    id: info.messageId || `<${crypto.randomUUID()}@${config.host}>`,
    threadId: options.threadId || info.messageId || `<${crypto.randomUUID()}@${config.host}>`,
  };
}
