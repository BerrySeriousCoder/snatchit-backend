/**
 * Demo Service
 * Business logic for demo playground
 */

import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { db } from '../../db';
import { waitlist } from '../../db/schema';
import { uploadFile, getAuthenticatedUrl } from '../../storage';
import { parseProductLink } from '../../linkParser';
import { generateVirtualTryOn } from '../../gemini';
import { downloadProductImages } from '../../utils/imageDownloader';
import { logger } from '../../utils/logger';

// Max generations per demo user
const MAX_DEMO_GENERATIONS = 1;

// Valid aspect ratios
type AspectRatio = '9:16' | '2:3' | '3:4' | '4:5';
const ASPECT_RATIO_VALUES: Record<AspectRatio, number> = {
    '9:16': 9 / 16,
    '2:3': 2 / 3,
    '3:4': 3 / 4,
    '4:5': 4 / 5,
};

export class DemoService {
    /**
     * Upload demo photo with cropping
     */
    async uploadDemoPhoto(email: string, file: Express.Multer.File, aspectRatio: string) {
        const normalizedEmail = email.toLowerCase().trim();

        // Verify waitlist entry
        const entry = await this.verifyWaitlistEmail(normalizedEmail);
        if (!entry.success) return entry;

        // Validate aspect ratio
        const ratio = ASPECT_RATIO_VALUES[aspectRatio as AspectRatio] || ASPECT_RATIO_VALUES['3:4'];

        // Crop image to aspect ratio
        const croppedBuffer = await this.cropToAspectRatio(file.buffer, ratio);

        // Upload to R2
        const safeEmail = email.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `demo/${safeEmail}/${uuidv4()}.jpg`;
        const imageUrl = await uploadFile(croppedBuffer, fileName, 'image/jpeg');

        // Update waitlist record
        await db.update(waitlist)
            .set({ lastImageUrl: imageUrl })
            .where(eq(waitlist.email, normalizedEmail));

        // Get authenticated URL
        const authUrl = await getAuthenticatedUrl(imageUrl);

        logger.info({ email: normalizedEmail, aspectRatio }, 'Demo photo uploaded');

        return { success: true, imageUrl: authUrl };
    }

    /**
     * Parse link for demo user
     */
    async parseLinkForDemo(email: string, url: string) {
        const normalizedEmail = email.toLowerCase().trim();

        // Verify waitlist entry
        const entry = await this.verifyWaitlistEmail(normalizedEmail);
        if (!entry.success) return entry;

        // Parse the link
        const result = await parseProductLink(url);

        logger.info({ email: normalizedEmail, productName: result.product?.name }, 'Demo link parsed');

        return { success: true, data: result };
    }

    /**
     * Generate try-on for demo user
     */
    async generateForDemo(email: string, productName: string, productImageUrls: string[]) {
        const normalizedEmail = email.toLowerCase().trim();

        // Verify waitlist entry
        const verifyResult = await this.verifyWaitlistEmail(normalizedEmail);
        if (!verifyResult.success) return verifyResult;

        // Get entry
        const [entry] = await db.select()
            .from(waitlist)
            .where(eq(waitlist.email, normalizedEmail))
            .limit(1);

        // Check generation limit
        if (entry.generationsUsed >= MAX_DEMO_GENERATIONS) {
            return {
                success: false,
                error: 'You have used all your free generations. Download the app for more!',
                code: 'LIMIT_REACHED',
                limitReached: true,
                generationsUsed: entry.generationsUsed,
                maxGenerations: MAX_DEMO_GENERATIONS,
                status: 403,
            };
        }

        // Check if user has photo
        if (!entry.lastImageUrl) {
            return {
                success: false,
                error: 'Please upload your photo first',
                code: 'NO_PHOTO',
                status: 400,
            };
        }

        logger.info({
            email: normalizedEmail,
            productName,
            imageCount: productImageUrls.length,
        }, 'Demo generation starting');

        // Get user image
        const userImageUrl = await getAuthenticatedUrl(entry.lastImageUrl);

        // Download product images
        const productBase64s = await downloadProductImages(productImageUrls);

        // Generate try-on
        const generatedBase64 = await generateVirtualTryOn(
            userImageUrl,
            productBase64s,
            productName || 'Clothing Item',
            '3:4'
        );

        // Increment generation count
        await db.update(waitlist)
            .set({ generationsUsed: entry.generationsUsed + 1 })
            .where(eq(waitlist.email, normalizedEmail));

        const generationsRemaining = MAX_DEMO_GENERATIONS - entry.generationsUsed - 1;

        return {
            success: true,
            generatedImageBase64: `data:image/jpeg;base64,${generatedBase64}`,
            generationsUsed: entry.generationsUsed + 1,
            generationsRemaining,
            message: generationsRemaining > 0
                ? `Generation complete! You have ${generationsRemaining} free generation${generationsRemaining === 1 ? '' : 's'} left.`
                : 'Generation complete! Download the app for unlimited access.',
        };
    }

    /**
     * Get demo status for email
     */
    async getDemoStatus(email: string) {
        const normalizedEmail = email.toLowerCase().trim();

        const [entry] = await db.select()
            .from(waitlist)
            .where(eq(waitlist.email, normalizedEmail))
            .limit(1);

        if (!entry) {
            return {
                success: false,
                error: 'Email not found. Please join the waitlist first.',
                status: 404,
            };
        }

        return {
            success: true,
            isVerified: entry.isVerified,
            generationsUsed: entry.generationsUsed,
            generationsRemaining: Math.max(0, MAX_DEMO_GENERATIONS - entry.generationsUsed),
            hasPhoto: !!entry.lastImageUrl,
        };
    }

    /**
     * Verify email is in waitlist and verified
     */
    private async verifyWaitlistEmail(email: string) {
        const [entry] = await db.select()
            .from(waitlist)
            .where(eq(waitlist.email, email))
            .limit(1);

        if (!entry) {
            return {
                success: false,
                error: 'Email not found. Please join the waitlist first.',
                status: 404,
            };
        }

        if (!entry.isVerified) {
            return {
                success: false,
                error: 'Please verify your email first.',
                status: 403,
            };
        }

        return { success: true, entry };
    }

    /**
     * Crop image to aspect ratio
     */
    private async cropToAspectRatio(buffer: Buffer, ratio: number): Promise<Buffer> {
        const image = sharp(buffer);
        const metadata = await image.metadata();

        if (!metadata.width || !metadata.height) {
            throw new Error('Could not read image dimensions');
        }

        const currentRatio = metadata.width / metadata.height;
        let cropWidth = metadata.width;
        let cropHeight = metadata.height;

        if (currentRatio > ratio) {
            // Image is wider than target, crop width
            cropWidth = Math.round(metadata.height * ratio);
        } else {
            // Image is taller than target, crop height
            cropHeight = Math.round(metadata.width / ratio);
        }

        const left = Math.round((metadata.width - cropWidth) / 2);
        const top = Math.round((metadata.height - cropHeight) / 2);

        return image
            .extract({ left, top, width: cropWidth, height: cropHeight })
            .jpeg({ quality: 90 })
            .toBuffer();
    }
}
