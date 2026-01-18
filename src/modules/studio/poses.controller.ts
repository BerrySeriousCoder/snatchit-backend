import { Response } from 'express';
import { posesService } from './poses.service';
import { AuthRequest } from '../../middleware/auth';
import { logger } from '../../utils/logger';

export class PosesController {

    /**
     * Get all stock poses
     */
    async getStockPoses(req: AuthRequest, res: Response) {
        try {
            const poses = await posesService.getStockPoses();
            res.json({ poses });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to get stock poses');
            res.status(500).json({ error: 'Failed to get stock poses' });
        }
    }

    /**
     * Get user's custom poses
     */
    async getUserPoses(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const poses = await posesService.getUserPoses(userId);
            res.json({ poses });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to get user poses');
            res.status(500).json({ error: 'Failed to get user poses' });
        }
    }

    /**
     * Upload a custom pose
     */
    async uploadPose(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const { name, category } = req.body;
            const file = req.file;

            if (!file) {
                return res.status(400).json({ error: 'File is required' });
            }

            const pose = await posesService.uploadPose(file, userId, name, category);
            res.json({ pose });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to upload pose');
            res.status(500).json({ error: 'Failed to upload pose' });
        }
    }

    /**
     * Delete a user pose
     */
    async deletePose(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const { poseId } = req.params;

            if (!poseId) {
                return res.status(400).json({ error: 'Pose ID is required' });
            }

            await posesService.deletePose(poseId, userId);
            res.json({ success: true });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to delete pose');
            res.status(500).json({ error: 'Failed to delete pose' });
        }
    }
}

export const posesController = new PosesController();
