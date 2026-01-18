import { Response } from 'express';
import { presetsService } from './presets.service';
import { AuthRequest } from '../../middleware/auth';
import { logger } from '../../utils/logger';

export class PresetsController {

    /**
     * Get all scene presets
     */
    async getScenePresets(req: AuthRequest, res: Response) {
        try {
            const presets = await presetsService.getScenePresets();
            res.json({ presets });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to get scene presets');
            res.status(500).json({ error: 'Failed to get scene presets' });
        }
    }

    /**
     * Get all lighting presets
     */
    async getLightingPresets(req: AuthRequest, res: Response) {
        try {
            const presets = await presetsService.getLightingPresets();
            res.json({ presets });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to get lighting presets');
            res.status(500).json({ error: 'Failed to get lighting presets' });
        }
    }
}

export const presetsController = new PresetsController();
