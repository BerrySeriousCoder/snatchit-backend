import { eq, desc, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db';
import { studioProps } from '../../db/schema';
import { uploadFile, getAuthenticatedUrl, getAuthenticatedUrls } from '../../storage';
import { logger } from '../../utils/logger';

export class PropsService {

    /**
     * Get all stock props
     */
    async getStockProps() {
        const props = await db.query.studioProps.findMany({
            where: eq(studioProps.isStock, true),
            orderBy: [desc(studioProps.createdAt)],
        });

        if (props.length === 0) return [];

        // Get signed URLs for thumbnails
        const thumbnailUrls = props.map(p => p.thumbnailUrl).filter(Boolean) as string[];
        const signedThumbnails = thumbnailUrls.length > 0
            ? await getAuthenticatedUrls(thumbnailUrls)
            : [];

        const thumbnailMap = new Map<string, string>();
        thumbnailUrls.forEach((url, i) => thumbnailMap.set(url, signedThumbnails[i]));

        return props.map(prop => ({
            id: prop.id,
            name: prop.name,
            category: prop.category,
            thumbnailUrl: prop.thumbnailUrl ? thumbnailMap.get(prop.thumbnailUrl) : null,
            promptText: prop.promptText,
            isStock: prop.isStock,
        }));
    }

    /**
     * Get user's custom props
     */
    async getUserProps(userId: string) {
        const props = await db.query.studioProps.findMany({
            where: and(
                eq(studioProps.userId, userId),
                eq(studioProps.isStock, false)
            ),
            orderBy: [desc(studioProps.createdAt)],
        });

        if (props.length === 0) return [];

        // Get signed URLs for thumbnails
        const thumbnailUrls = props.map(p => p.thumbnailUrl).filter(Boolean) as string[];
        const signedThumbnails = thumbnailUrls.length > 0
            ? await getAuthenticatedUrls(thumbnailUrls)
            : [];

        const thumbnailMap = new Map<string, string>();
        thumbnailUrls.forEach((url, i) => thumbnailMap.set(url, signedThumbnails[i]));

        return props.map(prop => ({
            id: prop.id,
            name: prop.name,
            category: prop.category,
            thumbnailUrl: prop.thumbnailUrl ? thumbnailMap.get(prop.thumbnailUrl) : null,
            promptText: prop.promptText,
            isStock: false,
        }));
    }

    /**
     * Upload a custom prop (with image)
     */
    async uploadProp(
        file: Express.Multer.File | undefined,
        userId: string,
        name: string,
        promptText?: string,
        category?: string
    ) {
        let r2Url: string | null = null;

        // Upload image if provided
        if (file) {
            const fileName = `${uuidv4()}-prop.${file.mimetype.split('/')[1] || 'jpg'}`;
            const r2Key = `studio/${userId}/props/${fileName}`;
            r2Url = await uploadFile(file.buffer, r2Key, file.mimetype);
        }

        // Save to database
        const [prop] = await db.insert(studioProps).values({
            userId,
            name: name || 'My Prop',
            category: category || 'custom',
            thumbnailUrl: r2Url,
            imageUrl: r2Url,
            promptText: promptText || name,
            isStock: false,
        }).returning();

        // Get signed URL if we have an image
        const signedUrl = r2Url ? await getAuthenticatedUrl(r2Url) : null;

        return {
            id: prop.id,
            name: prop.name,
            category: prop.category,
            thumbnailUrl: signedUrl,
            promptText: prop.promptText,
            isStock: false,
        };
    }

    /**
     * Create a text-only prop (no image)
     */
    async createTextProp(userId: string, name: string, promptText: string, category?: string) {
        const [prop] = await db.insert(studioProps).values({
            userId,
            name,
            category: category || 'custom',
            promptText,
            isStock: false,
        }).returning();

        return {
            id: prop.id,
            name: prop.name,
            category: prop.category,
            thumbnailUrl: null,
            promptText: prop.promptText,
            isStock: false,
        };
    }

    /**
     * Delete a user prop
     */
    async deleteProp(propId: string, userId: string) {
        await db.delete(studioProps)
            .where(and(
                eq(studioProps.id, propId),
                eq(studioProps.userId, userId)
            ));
    }
}

export const propsService = new PropsService();
