/**
 * Credits Service
 * Business logic for credit operations
 */

import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../../db';
import { users, creditTransactions, looks, outfits, purchaseIntents } from '../../db/schema';
import { logger } from '../../utils/logger';

// Pricing plans configuration
export const PRICING_PLANS = {
    basic: {
        id: 'basic',
        name: 'Basic',
        price: 499, // INR
        credits: 20,
        features: ['Normal Generation'],
        popular: false,
    },
    premium: {
        id: 'premium',
        name: 'Premium',
        price: 999, // INR
        credits: 40,
        features: ['Normal Generation', 'Outfit Mode', 'Upscale Download'],
        popular: true,
    },
    business: {
        id: 'business',
        name: 'Business',
        price: null, // Contact
        credits: null,
        features: ['Everything in Premium', 'API Access', 'Team Features', 'Custom Limits'],
        popular: false,
    },
} as const;

export class CreditsService {
    /**
     * Get user's current balance and plan
     */
    async getBalanceAndPlan(userId: string): Promise<{ credits: number; plan: string } | null> {
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { credits: true, plan: true },
        });

        return user || null;
    }

    /**
     * Check if user has enough credits
     */
    async hasEnoughCredits(userId: string, amount: number): Promise<boolean> {
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { credits: true },
        });

        return user ? user.credits >= amount : false;
    }

    /**
     * Check if user has premium features (Premium or Business plan)
     */
    async hasPremiumFeatures(userId: string): Promise<boolean> {
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { plan: true },
        });

        return user ? ['premium', 'business'].includes(user.plan) : false;
    }

    /**
     * Deduct credits atomically (only call on successful operations)
     */
    async deductCredits(
        userId: string,
        amount: number,
        type: 'generation' | 'refund',
        lookId?: string,
        outfitId?: string
    ): Promise<boolean> {
        try {
            // Atomic deduction using SQL
            const result = await db.update(users)
                .set({
                    credits: sql`${users.credits} - ${amount}`,
                })
                .where(eq(users.id, userId))
                .returning({ credits: users.credits });

            if (result.length === 0) {
                return false;
            }

            // Log transaction
            await db.insert(creditTransactions).values({
                userId,
                amount: -amount, // Negative for deduction
                type,
                lookId: lookId || null,
                outfitId: outfitId || null,
                description: type === 'generation' ? 'Virtual try-on generation' : 'Credit refund',
            });

            logger.info({ userId, amount, type, newBalance: result[0].credits }, 'Credits deducted');
            return true;
        } catch (error: any) {
            logger.error({ userId, amount, error: error.message }, 'Failed to deduct credits');
            return false;
        }
    }

    /**
     * Add credits (for purchases, refunds, etc.)
     */
    async addCredits(
        userId: string,
        amount: number,
        type: 'signup_bonus' | 'purchase' | 'refund',
        plan?: string,
        description?: string
    ): Promise<boolean> {
        try {
            const updateData: any = {
                credits: sql`${users.credits} + ${amount}`,
            };

            // Update plan if this is a purchase
            if (type === 'purchase' && plan) {
                updateData.plan = plan;
                updateData.planPurchasedAt = new Date();
            }

            const result = await db.update(users)
                .set(updateData)
                .where(eq(users.id, userId))
                .returning({ credits: users.credits, plan: users.plan });

            if (result.length === 0) {
                return false;
            }

            // Log transaction
            await db.insert(creditTransactions).values({
                userId,
                amount, // Positive for addition
                type,
                plan: plan || null,
                description: description || `Added ${amount} credits`,
            });

            logger.info({ userId, amount, type, plan, newBalance: result[0].credits }, 'Credits added');
            return true;
        } catch (error: any) {
            logger.error({ userId, amount, error: error.message }, 'Failed to add credits');
            return false;
        }
    }

    /**
     * Grant signup bonus (3 free credits)
     * Called when a new user is created
     */
    async grantSignupBonus(userId: string): Promise<void> {
        await db.insert(creditTransactions).values({
            userId,
            amount: 3,
            type: 'signup_bonus',
            description: 'Welcome bonus - 3 free credits',
        });

        logger.info({ userId }, 'Signup bonus granted');
    }

    /**
     * Get available pricing plans
     */
    getPlans() {
        return Object.values(PRICING_PLANS);
    }

    /**
     * Get transaction history for a user
     */
    async getTransactionHistory(userId: string, page: number = 1, limit: number = 20) {
        const offset = (page - 1) * limit;

        const transactions = await db.query.creditTransactions.findMany({
            where: eq(creditTransactions.userId, userId),
            orderBy: [desc(creditTransactions.createdAt)],
            limit,
            offset,
        });

        // Get total count
        const countResult = await db.select({ count: sql`count(*)` })
            .from(creditTransactions)
            .where(eq(creditTransactions.userId, userId));

        const total = Number(countResult[0]?.count || 0);

        return {
            transactions,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Record purchase intent (when user clicks on a plan)
     * Used for lead tracking and outreach
     */
    async recordPurchaseIntent(userId: string, planId: string, source?: string): Promise<void> {
        try {
            await db.insert(purchaseIntents).values({
                userId,
                planId: planId as 'basic' | 'premium' | 'business',
                source: source || null,
            });
            logger.info({ userId, planId, source }, 'Purchase intent recorded');
        } catch (error: any) {
            // Don't fail the request if logging fails
            logger.error({ userId, planId, error: error.message }, 'Failed to record purchase intent');
        }
    }

    /**
     * Get all purchase intents (for admin/analytics)
     */
    async getPurchaseIntents(page: number = 1, limit: number = 50) {
        const offset = (page - 1) * limit;

        const intents = await db.query.purchaseIntents.findMany({
            orderBy: [desc(purchaseIntents.createdAt)],
            limit,
            offset,
            with: {
                user: {
                    columns: { id: true, email: true, name: true, plan: true },
                },
            },
        });

        const countResult = await db.select({ count: sql`count(*)` })
            .from(purchaseIntents);

        const total = Number(countResult[0]?.count || 0);

        return {
            intents,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }
}
