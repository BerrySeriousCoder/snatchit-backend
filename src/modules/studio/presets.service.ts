import { eq, asc } from 'drizzle-orm';
import { db } from '../../db';
import { studioScenePresets, studioLightingPresets } from '../../db/schema';
import { logger } from '../../utils/logger';

export class PresetsService {

    /**
     * Get all scene presets
     */
    async getScenePresets() {
        const presets = await db.query.studioScenePresets.findMany({
            orderBy: [asc(studioScenePresets.sortOrder)],
        });

        return presets.map(preset => ({
            id: preset.id,
            name: preset.name,
            prompt: preset.prompt,
            category: preset.category,
        }));
    }

    /**
     * Get all lighting presets
     */
    async getLightingPresets() {
        const presets = await db.query.studioLightingPresets.findMany({
            orderBy: [asc(studioLightingPresets.sortOrder)],
        });

        return presets.map(preset => ({
            id: preset.id,
            name: preset.name,
            prompt: preset.prompt,
        }));
    }

    /**
     * Get scene preset by ID
     */
    async getScenePreset(presetId: string) {
        return db.query.studioScenePresets.findFirst({
            where: eq(studioScenePresets.id, presetId),
        });
    }

    /**
     * Get lighting preset by ID
     */
    async getLightingPreset(presetId: string) {
        return db.query.studioLightingPresets.findFirst({
            where: eq(studioLightingPresets.id, presetId),
        });
    }
}

export const presetsService = new PresetsService();
