/**
 * Waitlist Controller
 * Handles HTTP requests for waitlist operations
 */

import { Request, Response } from 'express';
import { WaitlistService } from './waitlist.service';
import { logger } from '../../utils/logger';

const isProduction = process.env.NODE_ENV === 'production';

function sanitizeErrorDetails(error: any): string | undefined {
    return isProduction ? undefined : error?.message || String(error);
}

export class WaitlistController {
    private service = new WaitlistService();

    /**
     * Submit email to waitlist
     */
    submit = async (req: Request, res: Response) => {
        try {
            const { email, platform } = req.body;
            const result = await this.service.submitToWaitlist(email, platform);
            res.json(result);
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error adding to waitlist');
            res.status(500).json({
                error: 'Failed to join waitlist',
                details: sanitizeErrorDetails(error)
            });
        }
    };

    /**
     * Verify email with OTP code
     */
    verify = async (req: Request, res: Response) => {
        try {
            const { email, code } = req.body;
            const result = await this.service.verifyEmail(email, code);

            if (!result.success) {
                return res.status(result.status || 400).json({
                    error: result.error,
                    expired: result.expired
                });
            }

            res.json(result);
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error verifying email');
            res.status(500).json({
                error: 'Verification failed',
                details: sanitizeErrorDetails(error)
            });
        }
    };

    /**
     * Get waitlist statistics
     */
    getStats = async (req: Request, res: Response) => {
        try {
            const stats = await this.service.getStats();
            res.json({ success: true, stats });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error fetching waitlist stats');
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    };
}
