import { Response } from 'express';
import { propsService } from './props.service';
import { AuthRequest } from '../../middleware/auth';
import { logger } from '../../utils/logger';

export class PropsController {

    /**
     * Get all stock props
     */
    async getStockProps(req: AuthRequest, res: Response) {
        try {
            const props = await propsService.getStockProps();
            res.json({ props });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to get stock props');
            res.status(500).json({ error: 'Failed to get stock props' });
        }
    }

    /**
     * Get user's custom props
     */
    async getUserProps(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const props = await propsService.getUserProps(userId);
            res.json({ props });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to get user props');
            res.status(500).json({ error: 'Failed to get user props' });
        }
    }

    /**
     * Upload a custom prop (with image)
     */
    async uploadProp(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const { name, promptText, category } = req.body;
            const file = req.file;

            const prop = await propsService.uploadProp(file, userId, name, promptText, category);
            res.json({ prop });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to upload prop');
            res.status(500).json({ error: 'Failed to upload prop' });
        }
    }

    /**
     * Create a text-only prop
     */
    async createTextProp(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const { name, promptText, category } = req.body;

            if (!promptText) {
                return res.status(400).json({ error: 'Prompt text is required' });
            }

            const prop = await propsService.createTextProp(userId, name || promptText, promptText, category);
            res.json({ prop });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to create prop');
            res.status(500).json({ error: 'Failed to create prop' });
        }
    }

    /**
     * Delete a user prop
     */
    async deleteProp(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const { propId } = req.params;

            if (!propId) {
                return res.status(400).json({ error: 'Prop ID is required' });
            }

            await propsService.deleteProp(propId, userId);
            res.json({ success: true });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to delete prop');
            res.status(500).json({ error: 'Failed to delete prop' });
        }
    }
}

export const propsController = new PropsController();
