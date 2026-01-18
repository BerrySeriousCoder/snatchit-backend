/**
 * Waitlist Service
 * Business logic for waitlist operations
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { waitlist } from '../../db/schema';
import { logger } from '../../utils/logger';
import { generateOTP, sendVerificationEmail } from '../../utils/email';

interface SubmitResult {
    success: boolean;
    needsVerification?: boolean;
    alreadyRegistered?: boolean;
    isVerified?: boolean;
    generationsRemaining?: number;
    hasPhoto?: boolean;
    message: string;
}

interface VerifyResult {
    success: boolean;
    alreadyVerified?: boolean;
    message?: string;
    generationsRemaining?: number;
    error?: string;
    status?: number;
    expired?: boolean;
}

interface WaitlistStats {
    ios: number;
    android: number;
    total: number;
}

export class WaitlistService {
    /**
     * Submit email to waitlist
     */
    async submitToWaitlist(email: string, platform: 'ios' | 'android'): Promise<SubmitResult> {
        const normalizedEmail = email.toLowerCase().trim();

        // Check if email already exists
        const existing = await db.select()
            .from(waitlist)
            .where(eq(waitlist.email, normalizedEmail))
            .limit(1);

        if (existing.length > 0) {
            const entry = existing[0];

            // If already verified, welcome them back
            if (entry.isVerified) {
                const generationsRemaining = Math.max(0, 1 - entry.generationsUsed);
                return {
                    success: true,
                    alreadyRegistered: true,
                    isVerified: true,
                    generationsRemaining,
                    hasPhoto: !!entry.lastImageUrl,
                    message: generationsRemaining > 0
                        ? `Welcome back! You have ${generationsRemaining} free generation${generationsRemaining === 1 ? '' : 's'} left.`
                        : "We've already got your submission! Keep an eye on your email – we'll reach out soon.",
                };
            }

            // Not verified - resend OTP
            const code = generateOTP();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

            await db.update(waitlist)
                .set({
                    verificationCode: code,
                    verificationCodeExpiresAt: expiresAt,
                })
                .where(eq(waitlist.email, normalizedEmail));

            await sendVerificationEmail(normalizedEmail, code);

            logger.info({ email: normalizedEmail }, 'Resent verification OTP');

            return {
                success: true,
                needsVerification: true,
                alreadyRegistered: true,
                message: 'This email is already registered. We sent a new verification code.',
            };
        }

        // New signup - generate OTP and insert
        const code = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await db.insert(waitlist).values({
            email: normalizedEmail,
            platform,
            verificationCode: code,
            verificationCodeExpiresAt: expiresAt,
            isVerified: false,
        });

        await sendVerificationEmail(normalizedEmail, code);

        logger.info({ email: normalizedEmail, platform }, 'New waitlist signup - OTP sent');

        return {
            success: true,
            needsVerification: true,
            message: 'Check your email for a verification code!',
        };
    }

    /**
     * Verify email with OTP code
     */
    async verifyEmail(email: string, code: string): Promise<VerifyResult> {
        const normalizedEmail = email.toLowerCase().trim();

        // Find entry
        const [entry] = await db.select()
            .from(waitlist)
            .where(eq(waitlist.email, normalizedEmail))
            .limit(1);

        if (!entry) {
            return {
                success: false,
                error: 'Email not found. Please join the waitlist first.',
                status: 404,
            };
        }

        if (entry.isVerified) {
            return {
                success: true,
                alreadyVerified: true,
                message: 'Email already verified!',
            };
        }

        // Check code
        if (entry.verificationCode !== code) {
            return {
                success: false,
                error: 'Invalid verification code',
                status: 400,
            };
        }

        // Check expiry
        if (entry.verificationCodeExpiresAt && new Date() > entry.verificationCodeExpiresAt) {
            return {
                success: false,
                error: 'Verification code expired. Please request a new one.',
                status: 400,
                expired: true,
            };
        }

        // Mark as verified
        await db.update(waitlist)
            .set({
                isVerified: true,
                verificationCode: null,
                verificationCodeExpiresAt: null,
            })
            .where(eq(waitlist.email, normalizedEmail));

        logger.info({ email: normalizedEmail }, 'Email verified successfully');

        return {
            success: true,
            message: "You're verified! Welcome to Snatched.",
            generationsRemaining: 1,
        };
    }

    /**
     * Get waitlist statistics
     */
    async getStats(): Promise<WaitlistStats> {
        const [iosCount] = await db.select({ count: sql<number>`count(*)` })
            .from(waitlist)
            .where(eq(waitlist.platform, 'ios'));

        const [androidCount] = await db.select({ count: sql<number>`count(*)` })
            .from(waitlist)
            .where(eq(waitlist.platform, 'android'));

        const [totalCount] = await db.select({ count: sql<number>`count(*)` })
            .from(waitlist);

        return {
            ios: Number(iosCount.count),
            android: Number(androidCount.count),
            total: Number(totalCount.count),
        };
    }
}
