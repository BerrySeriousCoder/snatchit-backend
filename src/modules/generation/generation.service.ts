/**
 * Generation Service
 * Business logic for AI generation operations
 */

import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { users, outfitGenerations, outfits, looks } from '../../db/schema';
import { parseProductLink, parseProductLinkForOutfit } from '../../linkParser';
import { generateVirtualTryOn } from '../../gemini';
import { upscaleImage as upscaleWithVertex, downloadImageAsBase64 } from '../../upscale';
import { uploadFile, getAuthenticatedUrl } from '../../storage';
import { downloadProductImages } from '../../utils/imageDownloader';
import { getOptimalProductImages } from '../../utils/imageFilter';
import { cacheService } from '../../services/cache.service';
import { logger } from '../../utils/logger';
import { CreditsService } from '../credits/credits.service';

interface GenerateTryOnData {
    userId: string;
    productUrl?: string;
    productName?: string;
    productImageUrls: string[];
    outfitId?: string;
    baseImageUrl?: string;
    stepOrder?: number;
}

export class GenerationService {
    private creditsService = new CreditsService();

    /**
     * Parse product link
     */
    async parseProductLink(url: string) {
        return parseProductLink(url);
    }

    /**
     * Parse product link for outfit mode
     */
    async parseProductLinkForOutfit(url: string) {
        return parseProductLinkForOutfit(url);
    }

    /**
     * Generate virtual try-on
     */
    async generateTryOn(data: GenerateTryOnData) {
        const isOutfitMode = !!data.outfitId;

        // Check premium for outfit mode (additional safety - routes also check)
        if (isOutfitMode) {
            const hasPremium = await this.creditsService.hasPremiumFeatures(data.userId);
            if (!hasPremium) {
                throw new Error('PREMIUM_REQUIRED');
            }
        }

        // Check credit balance BEFORE expensive operations
        const hasCredits = await this.creditsService.hasEnoughCredits(data.userId, 1);
        if (!hasCredits) {
            throw new Error('INSUFFICIENT_CREDITS');
        }

        // Filter to prefer product-only images
        const filteredImageUrls = await getOptimalProductImages(data.productImageUrls);

        // Validate product images exist BEFORE deducting credits
        if (!filteredImageUrls || filteredImageUrls.length === 0) {
            throw new Error('NO_PRODUCT_IMAGES');
        }

        // Parallel fetch: user data + product images
        const fetchStart = Date.now();
        const [user, productBase64s] = await Promise.all([
            this.getUserWithBodyPhoto(data.userId),
            downloadProductImages(filteredImageUrls),
        ]);
        logger.info({ userId: data.userId, duration: Date.now() - fetchStart }, 'Parallel fetch (User + Products)');

        if (!user || !user.bodyPhotoUrl) {
            throw new Error('User not found or no body photo');
        }

        // Determine base image for generation
        let baseImageForGeneration: string;
        if (isOutfitMode && data.baseImageUrl) {
            baseImageForGeneration = await this.getAuthenticatedImageUrl(data.baseImageUrl);
        } else {
            baseImageForGeneration = await this.getAuthenticatedImageUrl(user.bodyPhotoUrl);
        }

        // Generate the try-on
        const generateStart = Date.now();
        const generatedImageBase64 = await generateVirtualTryOn(
            baseImageForGeneration,
            productBase64s,
            data.productName || 'Clothing Item',
            '3:4'
        );
        logger.info({ userId: data.userId, duration: Date.now() - generateStart }, 'Image generation');

        // DEDUCT CREDIT ONLY AFTER SUCCESSFUL GENERATION
        await this.creditsService.deductCredits(
            data.userId,
            1,
            'generation',
            undefined,
            isOutfitMode ? data.outfitId : undefined
        );

        // Update streak logic (only for first generation, not outfit continuations)
        if (!isOutfitMode || data.stepOrder === 1) {
            await this.updateStreak(data.userId, user);
        }

        // Save generated image
        let generatedImageUrl: string | null = null;

        if (isOutfitMode && data.outfitId) {
            // SYNCHRONOUS SAVE for outfit mode - critical for chaining
            generatedImageUrl = await this.saveGeneratedImage(
                generatedImageBase64,
                data.userId,
                data.outfitId,
                data.productName,
                data.stepOrder
            );
        } else {
            // BACKGROUND SAVE for regular mode - faster response
            this.saveGeneratedImageBackground(generatedImageBase64, data.userId, data.productUrl, data.productName, user.bodyPhotoUrl);
        }

        return {
            generatedImageBase64,
            generatedImageUrl,
        };
    }

    /**
     * Upscale image
     */
    async upscaleImage(imageUrl?: string, imageBase64?: string) {
        let base64: string;

        if (imageBase64) {
            base64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        } else if (imageUrl) {
            // Get authenticated URL if needed
            const authUrl = await getAuthenticatedUrl(imageUrl);
            base64 = await downloadImageAsBase64(authUrl);
        } else {
            throw new Error('No image provided');
        }

        const upscaledBase64 = await upscaleWithVertex(base64);
        return { base64: upscaledBase64 };
    }

    /**
     * Get user with body photo
     */
    private async getUserWithBodyPhoto(userId: string) {
        // Try cache first
        const cached = await cacheService.getUser(userId);
        if (cached) return cached;

        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (user) {
            await cacheService.setUser(userId, user);
        }

        return user;
    }

    /**
     * Get authenticated image URL
     */
    private async getAuthenticatedImageUrl(url: string): Promise<string> {
        return getAuthenticatedUrl(url);
    }

    /**
     * Update user streak
     */
    private async updateStreak(userId: string, user: any) {
        const now = new Date();
        const lastSnatch = user.lastSnatchAt ? new Date(user.lastSnatchAt) : null;
        let newStreak = user.streakCurrent;

        if (lastSnatch) {
            const hoursSinceLastSnatch = (now.getTime() - lastSnatch.getTime()) / (1000 * 60 * 60);

            if (hoursSinceLastSnatch >= 24 && hoursSinceLastSnatch < 48) {
                newStreak = (user.streakCurrent || 0) + 1;
            } else if (hoursSinceLastSnatch >= 48) {
                newStreak = 1;
            }
        } else {
            newStreak = 1;
        }

        const newMaxStreak = Math.max(newStreak, user.streakMax || 0);

        await db.update(users)
            .set({
                lastSnatchAt: now,
                streakCurrent: newStreak,
            })
            .where(eq(users.id, userId));

        // Invalidate cache
        await cacheService.invalidateUser(userId);
    }

    /**
     * Save generated image (synchronous - for outfit mode)
     */
    private async saveGeneratedImage(
        base64: string,
        userId: string,
        outfitId: string,
        productName?: string,
        stepOrder?: number
    ): Promise<string> {
        const buffer = Buffer.from(base64, 'base64');
        const fileName = `generated/${uuidv4()}.jpg`;
        const uploadedUrl = await uploadFile(buffer, fileName, 'image/jpeg', true);

        // Save outfit generation
        await db.insert(outfitGenerations).values({
            outfitId,
            generatedImageUrl: uploadedUrl,
            productName: productName || 'Clothing Item',
            stepOrder: stepOrder || 1,
        });

        // Update outfit's updatedAt
        await db.update(outfits)
            .set({ updatedAt: new Date() })
            .where(eq(outfits.id, outfitId));

        logger.info({ userId, outfitId, stepOrder }, 'Outfit generation saved');

        return uploadedUrl;
    }

    /**
     * Save generated image (background - for regular mode)
     */
    private saveGeneratedImageBackground(base64: string, userId: string, productUrl?: string, productName?: string, baseImageUrl?: string) {
        (async () => {
            try {
                const buffer = Buffer.from(base64, 'base64');
                const fileName = `generated/${uuidv4()}.jpg`;
                const uploadedUrl = await uploadFile(buffer, fileName, 'image/jpeg', true);

                // Insert into looks table so it appears in wardrobe/profile
                await db.insert(looks).values({
                    userId,
                    productUrl: productUrl || null,
                    productName: productName || 'Clothing Item',
                    generatedImageUrl: uploadedUrl,
                    baseImageUrl: baseImageUrl || null,
                    isPublic: false, // Default to private
                });

                logger.info({ userId }, 'Background image save complete');
            } catch (error: any) {
                logger.error({ userId, error: error.message }, 'Background image save failed');
            }
        })();
    }
}
