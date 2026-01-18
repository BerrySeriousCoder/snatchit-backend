/**
 * Outfits Controller
 * Handles HTTP requests for outfit operations
 */

import { Response } from 'express';
import { OutfitsService } from './outfits.service';
import { AuthRequest } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const isProduction = process.env.NODE_ENV === 'production';

function sanitizeErrorDetails(error: any): string | undefined {
    return isProduction ? undefined : error?.message || String(error);
}

export class OutfitsController {
    private service = new OutfitsService();

    /**
     * Create new outfit
     */
    create = async (req: AuthRequest, res: Response) => {
        try {
            const { userId, name } = req.body;

            // SECURITY: Verify authenticated user is creating for themselves
            if (req.user?.id !== userId) {
                return res.status(403).json({ error: 'Not authorized to create outfits for this user' });
            }

            const outfit = await this.service.createOutfit(userId, name);
            res.json({ success: true, outfit });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.body?.userId }, 'Error creating outfit');
            res.status(500).json({ error: 'Failed to create outfit', details: sanitizeErrorDetails(error) });
        }
    };

    /**
     * Get user's outfits
     */
    getUserOutfits = async (req: AuthRequest, res: Response) => {
        try {
            const { userId } = req.params;
            const { page = 1, limit = 20 } = req.query;

            // SECURITY: Only allow users to view their own outfits
            if (req.user?.id !== userId) {
                return res.status(403).json({ error: 'Not authorized to view these outfits' });
            }

            const outfits = await this.service.getUserOutfits(userId, Number(page), Number(limit));
            res.json({ success: true, outfits });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.params.userId }, 'Error fetching outfits');
            res.status(500).json({ error: 'Failed to fetch outfits' });
        }
    };

    /**
     * Get single outfit with generations
     */
    getById = async (req: AuthRequest, res: Response) => {
        try {
            const { outfitId } = req.params;

            const result = await this.service.getOutfitById(outfitId, req.user!.id);

            if (!result.success) {
                return res.status(result.status || 404).json({ error: result.error });
            }

            res.json({ success: true, outfit: result.outfit });
        } catch (error: any) {
            logger.error({ error: error.message, outfitId: req.params.outfitId }, 'Error fetching outfit');
            res.status(500).json({ error: 'Failed to fetch outfit' });
        }
    };

    /**
     * Delete outfit
     */
    delete = async (req: AuthRequest, res: Response) => {
        try {
            const { outfitId } = req.params;

            const result = await this.service.deleteOutfit(outfitId, req.user!.id);

            if (!result.success) {
                return res.status(result.status || 403).json({ error: result.error });
            }

            res.json({ success: true, message: 'Outfit deleted successfully' });
        } catch (error: any) {
            logger.error({ error: error.message, outfitId: req.params.outfitId }, 'Error deleting outfit');
            res.status(500).json({ error: 'Failed to delete outfit' });
        }
    };
}
