/**
 * Demo Controller
 * Handles HTTP requests for demo playground
 */

import { Request, Response } from 'express';
import { DemoService } from './demo.service';
import { logger } from '../../utils/logger';

const isProduction = process.env.NODE_ENV === 'production';

function sanitizeErrorDetails(error: any): string | undefined {
    return isProduction ? undefined : error?.message || String(error);
}

export class DemoController {
    private service = new DemoService();

    /**
     * Upload photo for demo
     */
    uploadPhoto = async (req: Request, res: Response) => {
        try {
            const { email, aspectRatio = '3:4' } = req.body;
            const photo = req.file;

            if (!email) {
                return res.status(400).json({ error: 'Email is required' });
            }

            if (!photo) {
                return res.status(400).json({ error: 'Photo is required' });
            }

            const result = await this.service.uploadDemoPhoto(email, photo, aspectRatio);

            if (!result.success) {
                return res.status((result as any).status || 400).json({ error: (result as any).error });
            }

            res.json({
                success: true,
                imageUrl: (result as any).imageUrl,
                message: 'Photo uploaded successfully!',
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error uploading demo photo');
            res.status(500).json({
                error: 'Failed to upload photo',
                details: sanitizeErrorDetails(error),
            });
        }
    };

    /**
     * Parse product link for demo
     */
    parseLink = async (req: Request, res: Response) => {
        try {
            const { email, url } = req.body;

            if (!email || !url) {
                return res.status(400).json({ error: 'Email and URL are required' });
            }

            const result = await this.service.parseLinkForDemo(email, url);

            if (!result.success) {
                return res.status((result as any).status || 400).json({ error: (result as any).error });
            }

            res.json((result as any).data);
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error parsing demo link');
            res.status(500).json({
                error: 'Failed to parse product link',
                details: sanitizeErrorDetails(error),
            });
        }
    };

    /**
     * Generate try-on for demo
     */
    generate = async (req: Request, res: Response) => {
        const startTime = Date.now();
        try {
            const { email, productName, productImageUrls } = req.body;

            if (!email) {
                return res.status(400).json({ error: 'Email is required' });
            }

            if (!productImageUrls || !Array.isArray(productImageUrls) || productImageUrls.length === 0) {
                return res.status(400).json({ error: 'Product images are required' });
            }

            const result = await this.service.generateForDemo(email, productName, productImageUrls);

            if (!result.success) {
                const failResult = result as any;
                return res.status(failResult.status || 400).json({
                    error: failResult.error,
                    code: failResult.code,
                    limitReached: failResult.limitReached,
                    generationsUsed: failResult.generationsUsed,
                    maxGenerations: failResult.maxGenerations,
                });
            }

            const successResult = result as any;
            logger.info({
                email,
                duration: Date.now() - startTime,
                generationsRemaining: successResult.generationsRemaining,
            }, 'Demo generation complete');

            res.json({
                success: true,
                generatedImageBase64: successResult.generatedImageBase64,
                generationsUsed: successResult.generationsUsed,
                generationsRemaining: successResult.generationsRemaining,
                message: successResult.message,
            });
        } catch (error: any) {
            logger.error({ error: error.message, duration: Date.now() - startTime }, 'Error in demo generation');
            res.status(500).json({
                error: 'Failed to generate try-on',
                details: sanitizeErrorDetails(error),
            });
        }
    };

    /**
     * Get demo status for email
     */
    getStatus = async (req: Request, res: Response) => {
        try {
            const { email } = req.query;

            if (!email || typeof email !== 'string') {
                return res.status(400).json({ error: 'Email is required' });
            }

            const result = await this.service.getDemoStatus(email);

            if (!result.success) {
                return res.status((result as any).status || 404).json({ error: (result as any).error });
            }

            const successResult = result as any;
            res.json({
                success: true,
                isVerified: successResult.isVerified,
                generationsUsed: successResult.generationsUsed,
                generationsRemaining: successResult.generationsRemaining,
                hasPhoto: successResult.hasPhoto,
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error getting demo status');
            res.status(500).json({ error: 'Failed to get demo status' });
        }
    };
}
