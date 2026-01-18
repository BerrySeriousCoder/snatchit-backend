/**
 * Credits Controller
 * Handles HTTP requests for credit operations
 */

import { Response } from 'express';
import { CreditsService } from './credits.service';
import { AuthRequest } from '../../middleware/auth';
import { logger } from '../../utils/logger';

export class CreditsController {
    private service = new CreditsService();

    /**
     * Get user's credit balance and plan
     */
    getBalance = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const data = await this.service.getBalanceAndPlan(userId);

            if (!data) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({
                credits: data.credits,
                plan: data.plan,
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error getting credit balance');
            res.status(500).json({ error: 'Failed to get credit balance' });
        }
    };

    /**
     * Get available pricing plans
     */
    getPlans = async (req: AuthRequest, res: Response) => {
        try {
            const plans = this.service.getPlans();
            res.json({ plans });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error getting plans');
            res.status(500).json({ error: 'Failed to get pricing plans' });
        }
    };

    /**
     * Get transaction history
     */
    getHistory = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const page = parseInt(req.query.page as string) || 1;
            const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

            const data = await this.service.getTransactionHistory(userId, page, limit);

            res.json(data);
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error getting transaction history');
            res.status(500).json({ error: 'Failed to get transaction history' });
        }
    };

    /**
     * Attempt to purchase credits
     * Returns testing mode message for now
     */
    purchase = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            const { planId } = req.body;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            if (!planId || !['basic', 'premium', 'business'].includes(planId)) {
                return res.status(400).json({ error: 'Invalid plan ID' });
            }

            // Get user email for notification message
            const user = await require('../../db').db.query.users.findFirst({
                where: require('drizzle-orm').eq(require('../../db/schema').users.id, userId),
                columns: { email: true },
            });

            logger.info({ userId, planId }, 'Purchase attempted - testing mode');

            // Return testing mode message
            res.json({
                success: false,
                testingMode: true,
                message: "We're in Testing Mode!",
                description: `Thank you for your interest in SnatchIt! We're currently in early access and payment processing is not yet available.`,
                notification: user?.email
                    ? `We'll notify you at ${user.email} as soon as we go live!`
                    : 'We will announce when payments are available!',
                cta: 'Stay tuned for exclusive launch discounts! 🎉',
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error processing purchase');
            res.status(500).json({ error: 'Failed to process purchase' });
        }
    };

    /**
     * Record purchase intent (when user clicks on a plan)
     * For lead tracking
     */
    recordIntent = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            const { planId, source } = req.body;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            if (!planId || !['basic', 'premium', 'business'].includes(planId)) {
                return res.status(400).json({ error: 'Invalid plan ID' });
            }

            await this.service.recordPurchaseIntent(userId, planId, source);

            res.json({ success: true });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error recording purchase intent');
            res.status(500).json({ error: 'Failed to record intent' });
        }
    };
}
