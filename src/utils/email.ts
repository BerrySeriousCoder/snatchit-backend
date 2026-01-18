/**
 * Email Service using Autosend API
 * 
 * Handles sending transactional emails for verification, notifications, etc.
 */

import { logger } from './logger';

const AUTOSEND_API_URL = 'https://api.autosend.com/v1/mails/send';
const AUTOSEND_API_KEY = process.env.AUTOSEND_API_KEY;
const FROM_EMAIL = process.env.AUTOSEND_FROM_EMAIL || 'no-reply@snatched.app';
const FROM_NAME = 'Snatched';

interface SendEmailOptions {
    to: {
        email: string;
        name?: string;
    };
    subject: string;
    html: string;
    text?: string;
}

/**
 * Send an email using Autosend API
 */
async function sendEmail(options: SendEmailOptions): Promise<boolean> {
    if (!AUTOSEND_API_KEY) {
        logger.error('AUTOSEND_API_KEY is not configured');
        throw new Error('Email service not configured');
    }

    try {
        const response = await fetch(AUTOSEND_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AUTOSEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: {
                    email: FROM_EMAIL,
                    name: FROM_NAME,
                },
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text,
            }),
        });

        const data = await response.json() as { success?: boolean; message?: string; data?: { emailId?: string } };

        if (!response.ok) {
            logger.error({ status: response.status, data }, 'Autosend API error');
            throw new Error(data.message || 'Failed to send email');
        }

        logger.info({ emailId: data.data?.emailId, to: options.to.email }, 'Email sent successfully');
        return true;
    } catch (error: any) {
        logger.error({ error: error.message, to: options.to.email }, 'Failed to send email');
        throw error;
    }
}

/**
 * Generate a 6-digit OTP code
 */
export function generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send verification OTP email
 */
export async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" max-width="480" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%); border-radius: 16px; border: 1px solid #333; padding: 40px;">
                    <tr>
                        <td align="center" style="padding-bottom: 24px;">
                            <h1 style="margin: 0; font-size: 32px; font-weight: 700; background: linear-gradient(135deg, #fff 0%, #888 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                                SNATCHED
                            </h1>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom: 16px;">
                            <p style="margin: 0; color: #999; font-size: 16px;">
                                Your verification code is:
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom: 24px;">
                            <div style="background: linear-gradient(135deg, #222 0%, #111 100%); border: 2px solid #444; border-radius: 12px; padding: 20px 40px; display: inline-block;">
                                <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #fff; font-family: 'SF Mono', 'Fira Code', monospace;">
                                    ${code}
                                </span>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom: 8px;">
                            <p style="margin: 0; color: #666; font-size: 14px;">
                                This code expires in <strong style="color: #999;">10 minutes</strong>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center">
                            <p style="margin: 0; color: #444; font-size: 12px;">
                                If you didn't request this, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();

    const text = `Your Snatched verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.`;

    return sendEmail({
        to: { email },
        subject: `${code} is your Snatched verification code`,
        html,
        text,
    });
}
