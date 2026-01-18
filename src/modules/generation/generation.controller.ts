/**
 * Generation Controller
 * Handles HTTP requests for AI generation operations
 */

import { Response } from 'express';
import { GenerationService } from './generation.service';
import { AuthRequest } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const isProduction = process.env.NODE_ENV === 'production';

function sanitizeErrorDetails(error: any): string | undefined {
    return isProduction ? undefined : error?.message || String(error);
}

export class GenerationController {
    private service = new GenerationService();

    /**
     * Parse product link
     */
    parseLink = async (req: AuthRequest, res: Response) => {
        try {
            const { url } = req.body;

            if (!url) {
                return res.status(400).json({ error: 'URL is required' });
            }

            logger.info({ userId: req.user?.id, url }, 'Parsing product link');
            const result = await this.service.parseProductLink(url);
            res.json(result);
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.user?.id }, 'Error parsing link');
            res.status(500).json({
                error: 'Failed to parse product link',
                details: sanitizeErrorDetails(error),
            });
        }
    };

    /**
     * Parse product link for outfit mode
     */
    parseLinkForOutfit = async (req: AuthRequest, res: Response) => {
        const startTime = Date.now();
        try {
            const { url } = req.body;

            if (!url) {
                return res.status(400).json({ error: 'URL is required' });
            }

            logger.info({ userId: req.user?.id, url, endpoint: '/api/parse-link-outfit' },
                '🔥 OUTFIT MODE PARSE - REQUEST RECEIVED');

            const result = await this.service.parseProductLinkForOutfit(url);

            // Log classification results
            const productOnlyImages = result.product.classifiedImages?.filter((c: any) => c.type === 'product_only') || [];
            const modelOutfitImages = result.product.classifiedImages?.filter((c: any) => c.type === 'model_full_outfit') || [];

            logger.info({
                userId: req.user?.id,
                url,
                success: result.success,
                productName: result.product.name,
                classificationResults: {
                    productOnly: productOnlyImages.length,
                    modelFullOutfit: modelOutfitImages.length,
                },
                timing: { totalMs: Date.now() - startTime },
            }, '✅ OUTFIT MODE PARSE - COMPLETE');

            res.json(result);
        } catch (error: any) {
            logger.error({
                error: error.message,
                userId: req.user?.id,
                url: req.body?.url,
                duration: Date.now() - startTime,
            }, '❌ OUTFIT MODE PARSE - ERROR');

            res.status(500).json({
                error: 'Failed to parse product link for outfit mode',
                details: sanitizeErrorDetails(error),
            });
        }
    };

    /**
     * Generate virtual try-on
     */
    generate = async (req: AuthRequest, res: Response) => {
        const totalStart = Date.now();
        try {
            const { userId, productUrl, productName, productImageUrls, outfitId, baseImageUrl, stepOrder } = req.body;

            // SECURITY: Verify authenticated user is generating for themselves
            if (req.user?.id !== userId) {
                return res.status(403).json({ error: 'Not authorized to generate try-ons for this user' });
            }

            if (!userId || !productImageUrls || !Array.isArray(productImageUrls) || productImageUrls.length === 0) {
                return res.status(400).json({ error: 'Missing required fields or invalid images' });
            }

            const isOutfitMode = !!outfitId;
            logger.info({ userId, isOutfitMode, outfitId, stepOrder }, 'Starting virtual try-on generation');

            const result = await this.service.generateTryOn({
                userId,
                productUrl,
                productName,
                productImageUrls,
                outfitId,
                baseImageUrl,
                stepOrder,
            });

            const responseTime = Date.now() - totalStart;
            logger.info({ userId, duration: responseTime, isOutfitMode }, 'Returning response to user');

            res.json({
                success: true,
                generatedImageBase64: `data:image/jpeg;base64,${result.generatedImageBase64}`,
                generatedImageUrl: result.generatedImageUrl || null,
                isOutfitMode,
                outfitId: outfitId || null,
                stepOrder: stepOrder || null,
                message: isOutfitMode ? 'Outfit generation complete!' : 'Image generated! Saving in background...',
            });
        } catch (error: any) {
            const totalMs = Date.now() - totalStart;

            // Handle credit-related errors with specific responses
            if (error.message === 'INSUFFICIENT_CREDITS') {
                logger.info({ userId: req.body?.userId, duration: totalMs }, 'Generation blocked - insufficient credits');
                return res.status(402).json({
                    error: 'Insufficient credits',
                    code: 'INSUFFICIENT_CREDITS',
                    message: 'You need more credits to generate. Visit the shop to purchase more.',
                });
            }

            if (error.message === 'PREMIUM_REQUIRED') {
                logger.info({ userId: req.body?.userId, duration: totalMs }, 'Generation blocked - premium required');
                return res.status(403).json({
                    error: 'Premium feature',
                    code: 'PREMIUM_REQUIRED',
                    message: 'Outfit Mode is a Premium feature. Upgrade to unlock!',
                });
            }

            if (error.message === 'NO_PRODUCT_IMAGES') {
                logger.info({ userId: req.body?.userId, duration: totalMs }, 'Generation blocked - no product images');
                return res.status(400).json({
                    error: 'No product images found',
                    code: 'NO_PRODUCT_IMAGES',
                    message: 'Could not find valid product images from this link.',
                });
            }

            logger.error({ duration: totalMs, error: error.message }, 'Error generating virtual try-on');
            res.status(500).json({
                error: 'Failed to generate virtual try-on',
                details: sanitizeErrorDetails(error),
            });
        }
    };

    /**
     * Upscale image
     */
    upscale = async (req: AuthRequest, res: Response) => {
        const start = Date.now();
        try {
            const { imageUrl, imageBase64 } = req.body;

            if (!imageUrl && !imageBase64) {
                return res.status(400).json({ error: 'Image URL or Base64 is required' });
            }

            const result = await this.service.upscaleImage(imageUrl, imageBase64);

            logger.info({ userId: req.user?.id, duration: Date.now() - start }, 'Image upscaled');

            res.json({
                success: true,
                upscaledImageBase64: result.base64,
            });
        } catch (error: any) {
            logger.error({ error: error.message, duration: Date.now() - start }, 'Error upscaling image');
            res.status(500).json({
                error: 'Failed to upscale image',
                details: sanitizeErrorDetails(error),
            });
        }
    };
}
