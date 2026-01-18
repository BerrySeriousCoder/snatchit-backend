/**
 * Premium Feature Middleware
 * Checks if user has Premium or Business plan
 */

import { Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { AuthRequest } from './auth';
import { logger } from '../utils/logger';

export const requirePremium = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { plan: true },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!['premium', 'business'].includes(user.plan)) {
            logger.info({ userId, plan: user.plan }, 'Premium feature access denied');
            return res.status(403).json({
                error: 'Premium feature',
                code: 'PREMIUM_REQUIRED',
                message: 'Upgrade to Premium to unlock this feature!',
                currentPlan: user.plan,
            });
        }

        next();
    } catch (error: any) {
        logger.error({ error: error.message }, 'Error checking premium status');
        res.status(500).json({ error: 'Failed to verify premium status' });
    }
};
