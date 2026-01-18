/**
 * Looks Controller
 * Handles HTTP requests for look operations
 */

import { Response } from 'express';
import { LooksService } from './looks.service';
import { AuthRequest } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const isProduction = process.env.NODE_ENV === 'production';

function sanitizeErrorDetails(error: any): string | undefined {
    return isProduction ? undefined : error?.message || String(error);
}

export class LooksController {
    private service = new LooksService();

    /**
     * Save a look
     */
    save = async (req: AuthRequest, res: Response) => {
        try {
            const { userId, productUrl, productName, productImageUrl, generatedImageBase64, generatedImageUrl, isPublic } = req.body;

            // SECURITY: Verify authenticated user is saving for themselves
            if (req.user?.id !== userId) {
                return res.status(403).json({ error: 'Not authorized to save looks for this user' });
            }

            const look = await this.service.saveLook({
                userId,
                productUrl,
                productName,
                productImageUrl,
                generatedImageBase64,
                generatedImageUrl,
                isPublic: isPublic !== false,
            });

            res.json({ success: true, look });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.body?.userId }, 'Error saving look');
            res.status(500).json({ error: 'Failed to save look', details: sanitizeErrorDetails(error) });
        }
    };

    /**
     * Get user's looks (wardrobe)
     */
    getUserLooks = async (req: AuthRequest, res: Response) => {
        try {
            const { userId } = req.params;
            const { page = 1, limit = 20 } = req.query;

            // SECURITY: Only allow users to view their own wardrobe
            if (req.user?.id !== userId) {
                return res.status(403).json({ error: 'Not authorized to view this wardrobe' });
            }

            const looks = await this.service.getUserLooks(userId, Number(page), Number(limit));
            res.json({ success: true, looks });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.params.userId }, 'Error fetching looks');
            res.status(500).json({ error: 'Failed to fetch looks' });
        }
    };

    /**
     * Toggle look privacy
     */
    togglePrivacy = async (req: AuthRequest, res: Response) => {
        try {
            const { lookId } = req.params;
            const { isPublic } = req.body;
            const userId = req.user!.id;

            const result = await this.service.togglePrivacy(lookId, userId, isPublic);

            if (!result.success) {
                return res.status(result.status || 403).json({ error: result.error });
            }

            res.json({ success: true, look: result.look });
        } catch (error: any) {
            logger.error({ error: error.message, lookId: req.params.lookId }, 'Error updating privacy');
            res.status(500).json({ error: 'Failed to update privacy' });
        }
    };

    /**
     * Delete a look
     */
    delete = async (req: AuthRequest, res: Response) => {
        try {
            const { lookId } = req.params;
            const userId = req.user!.id;

            const result = await this.service.deleteLook(lookId, userId);

            if (!result.success) {
                return res.status(result.status || 403).json({ error: result.error });
            }

            res.json({ success: true, message: 'Look deleted successfully' });
        } catch (error: any) {
            logger.error({ error: error.message, lookId: req.params.lookId }, 'Error deleting look');
            res.status(500).json({ error: 'Failed to delete look' });
        }
    };
}
