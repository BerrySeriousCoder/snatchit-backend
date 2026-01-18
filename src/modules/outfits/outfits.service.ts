/**
 * Outfits Service
 * Business logic for outfit operations
 */

import { eq, desc } from 'drizzle-orm';
import { db } from '../../db';
import { outfits, outfitGenerations, NewOutfit } from '../../db/schema';
import { getAuthenticatedUrls } from '../../storage';
import { logger } from '../../utils/logger';

export class OutfitsService {
    /**
     * Create new outfit
     */
    async createOutfit(userId: string, name?: string) {
        const newOutfit: NewOutfit = {
            userId,
            name: name || `Outfit ${new Date().toLocaleDateString()}`,
        };

        const [outfit] = await db.insert(outfits).values(newOutfit).returning();

        logger.info({ userId, outfitId: outfit.id }, 'Outfit created');

        return outfit;
    }

    /**
     * Get user's outfits with preview images
     */
    async getUserOutfits(userId: string, page: number = 1, limit: number = 20) {
        const offset = (page - 1) * limit;

        const userOutfits = await db.query.outfits.findMany({
            where: eq(outfits.userId, userId),
            orderBy: [desc(outfits.updatedAt)],
            limit,
            offset,
        });

        // For each outfit, get the latest generation (highest stepOrder) and count
        const outfitsWithImages = await Promise.all(userOutfits.map(async (outfit) => {
            const generations = await db.query.outfitGenerations.findMany({
                where: eq(outfitGenerations.outfitId, outfit.id),
                orderBy: [desc(outfitGenerations.stepOrder)],
            });

            const stepCount = generations.length;
            let finalImageUrl = null;

            if (generations.length > 0 && generations[0].generatedImageUrl) {
                const [authUrl] = await getAuthenticatedUrls([generations[0].generatedImageUrl]);
                finalImageUrl = authUrl;
            }

            return {
                ...outfit,
                stepCount,
                finalImageUrl,
            };
        }));

        return outfitsWithImages;
    }

    /**
     * Get single outfit with all generations
     */
    async getOutfitById(outfitId: string, userId: string) {
        const outfit = await db.query.outfits.findFirst({
            where: eq(outfits.id, outfitId),
        });

        if (!outfit) {
            return { success: false, error: 'Outfit not found', status: 404 };
        }

        // SECURITY: Only owner can view
        if (outfit.userId !== userId) {
            return { success: false, error: 'Not authorized to view this outfit', status: 403 };
        }

        // Get all generations
        const generations = await db.query.outfitGenerations.findMany({
            where: eq(outfitGenerations.outfitId, outfitId),
            orderBy: [desc(outfitGenerations.stepOrder)],
        });

        // Get authenticated URLs for all generations
        const imageUrls = generations
            .map(g => g.generatedImageUrl)
            .filter((url): url is string => !!url);

        const authUrls = await getAuthenticatedUrls(imageUrls);

        let authIndex = 0;
        const generationsWithAuthUrls = generations.map(g => ({
            ...g,
            generatedImageUrl: g.generatedImageUrl ? authUrls[authIndex++] : null,
        }));

        return {
            success: true,
            outfit: {
                ...outfit,
                generations: generationsWithAuthUrls,
                stepCount: generations.length,
            },
        };
    }

    /**
     * Delete outfit and all generations
     */
    async deleteOutfit(outfitId: string, userId: string) {
        const outfit = await db.query.outfits.findFirst({
            where: eq(outfits.id, outfitId),
        });

        if (!outfit) {
            return { success: false, error: 'Outfit not found', status: 404 };
        }

        // SECURITY: Only owner can delete
        if (outfit.userId !== userId) {
            return { success: false, error: 'Not authorized to delete this outfit', status: 403 };
        }

        // Delete generations first (foreign key)
        await db.delete(outfitGenerations).where(eq(outfitGenerations.outfitId, outfitId));

        // Delete outfit
        await db.delete(outfits).where(eq(outfits.id, outfitId));

        logger.info({ outfitId, userId }, 'Outfit deleted');

        return { success: true };
    }

    /**
     * Add generation to outfit (called from generation service)
     */
    async addGeneration(outfitId: string, generatedImageUrl: string, productName: string, stepOrder: number) {
        const [generation] = await db.insert(outfitGenerations).values({
            outfitId,
            generatedImageUrl,
            productName,
            stepOrder,
        }).returning();

        // Update outfit's updatedAt
        await db.update(outfits)
            .set({ updatedAt: new Date() })
            .where(eq(outfits.id, outfitId));

        return generation;
    }
}
