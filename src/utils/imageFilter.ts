/**
 * Image Filter Utility
 * 
 * Filters product images to prefer product-only shots over model images
 * for better AI generation quality.
 */

import { classifyProductImagesForOutfit } from '../linkParser';
import { logger } from './logger';

/**
 * Filter images to prefer product-only shots for better generation quality.
 * 
 * Logic:
 * - If 2 or fewer images: use all (no classification needed)
 * - If product_only images >= 2: use ONLY product_only images
 * - Otherwise: use all images (fallback)
 */
export async function getOptimalProductImages(
    imageUrls: string[]
): Promise<string[]> {
    // If 2 or fewer images, use all (no need to classify)
    if (imageUrls.length <= 2) {
        logger.info({ count: imageUrls.length }, 'Skipping classification - 2 or fewer images');
        return imageUrls;
    }

    try {
        // Classify images using Gemini Vision
        const { classifications } = await classifyProductImagesForOutfit(imageUrls);

        // Get product-only images sorted by confidence
        const productOnly = classifications
            .filter(c => c.type === 'product_only')
            .sort((a, b) => b.confidence - a.confidence)
            .map(c => c.url);

        logger.info({
            total: imageUrls.length,
            productOnly: productOnly.length,
            usingProductOnly: productOnly.length >= 2
        }, 'Image filtering result');

        // If we have 2+ product-only, use those
        if (productOnly.length >= 2) {
            return productOnly;
        }

        // Fallback: return all images
        return imageUrls;

    } catch (error: any) {
        logger.warn({ error: error.message }, 'Image filtering failed, using all images');
        return imageUrls;
    }
}
