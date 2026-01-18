/**
 * Looks Service
 * Business logic for look operations
 */

import { eq, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db';
import { looks, NewLook, reactions } from '../../db/schema';
import { uploadFile, getAuthenticatedUrls, deleteFile } from '../../storage';
import { logger } from '../../utils/logger';

interface SaveLookData {
    userId: string;
    productUrl?: string;
    productName?: string;
    productImageUrl?: string;
    generatedImageBase64?: string;
    generatedImageUrl?: string;
    isPublic: boolean;
}

export class LooksService {
    /**
     * Save a look
     */
    async saveLook(data: SaveLookData) {
        let finalImageUrl = data.generatedImageUrl;

        // If base64 provided, upload it
        if (data.generatedImageBase64 && !finalImageUrl) {
            const base64Data = data.generatedImageBase64.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            const fileName = `looks/${uuidv4()}.jpg`;
            finalImageUrl = await uploadFile(buffer, fileName, 'image/jpeg', true);
        }

        // Create look
        const newLook: NewLook = {
            userId: data.userId,
            productUrl: data.productUrl || null,
            productName: data.productName || 'Generated Look',
            productImageUrl: data.productImageUrl || null,
            generatedImageUrl: finalImageUrl || null,
            isPublic: data.isPublic,
        };

        const [savedLook] = await db.insert(looks).values(newLook).returning();

        logger.info({ userId: data.userId, lookId: savedLook.id }, 'Look saved');

        // Get authenticated URL for response
        if (savedLook.generatedImageUrl) {
            const [authUrl] = await getAuthenticatedUrls([savedLook.generatedImageUrl]);
            return { ...savedLook, generatedImageUrl: authUrl };
        }

        return savedLook;
    }

    /**
     * Get user's looks (wardrobe)
     */
    async getUserLooks(userId: string, page: number = 1, limit: number = 20) {
        const offset = (page - 1) * limit;

        const userLooks = await db.select()
            .from(looks)
            .where(eq(looks.userId, userId))
            .orderBy(desc(looks.createdAt))
            .limit(limit)
            .offset(offset);

        // Batch get authenticated URLs
        const generatedImageUrls = userLooks
            .map(l => l.generatedImageUrl)
            .filter((url): url is string => !!url);

        const authenticatedUrls = await getAuthenticatedUrls(generatedImageUrls);

        // Map authenticated URLs back
        let authUrlIndex = 0;
        return userLooks.map(look => ({
            ...look,
            generatedImageUrl: look.generatedImageUrl
                ? authenticatedUrls[authUrlIndex++]
                : null,
            productImageUrl: look.productImageUrl || null,
        }));
    }

    /**
     * Toggle look privacy
     */
    async togglePrivacy(lookId: string, userId: string, isPublic: boolean) {
        // Verify ownership
        const look = await db.query.looks.findFirst({
            where: eq(looks.id, lookId),
        });

        if (!look) {
            return { success: false, error: 'Look not found', status: 404 };
        }

        if (look.userId !== userId) {
            return { success: false, error: 'Not authorized to modify this look', status: 403 };
        }

        const [updatedLook] = await db.update(looks)
            .set({ isPublic })
            .where(eq(looks.id, lookId))
            .returning();

        logger.info({ lookId, userId, isPublic }, 'Look privacy updated');

        return { success: true, look: updatedLook };
    }

    /**
     * Delete a look
     */
    async deleteLook(lookId: string, userId: string) {
        // Verify ownership
        const look = await db.query.looks.findFirst({
            where: eq(looks.id, lookId),
        });

        if (!look) {
            return { success: false, error: 'Look not found', status: 404 };
        }

        if (look.userId !== userId) {
            return { success: false, error: 'Not authorized to delete this look', status: 403 };
        }

        // Delete reactions first (foreign key constraint)
        await db.delete(reactions).where(eq(reactions.lookId, lookId));

        // Delete look
        await db.delete(looks).where(eq(looks.id, lookId));

        // Try to delete image from storage (non-blocking)
        if (look.generatedImageUrl) {
            deleteFile(look.generatedImageUrl).catch(err =>
                logger.warn({ err, lookId }, 'Failed to delete look image from storage')
            );
        }

        logger.info({ lookId, userId }, 'Look deleted');

        return { success: true };
    }
}
