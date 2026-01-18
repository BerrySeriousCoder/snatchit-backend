import { eq, desc, and, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db';
import { studioPoses } from '../../db/schema';
import { uploadFile, getAuthenticatedUrl, getAuthenticatedUrls } from '../../storage';
import { logger } from '../../utils/logger';

export class PosesService {

    /**
     * Get all stock poses
     */
    async getStockPoses() {
        const poses = await db.query.studioPoses.findMany({
            where: eq(studioPoses.isStock, true),
            orderBy: [desc(studioPoses.createdAt)],
        });

        if (poses.length === 0) return [];

        // Get signed URLs
        const thumbnailUrls = poses.map(p => p.thumbnailUrl).filter(Boolean) as string[];
        const signedThumbnails = thumbnailUrls.length > 0
            ? await getAuthenticatedUrls(thumbnailUrls)
            : [];

        const thumbnailMap = new Map<string, string>();
        thumbnailUrls.forEach((url, i) => thumbnailMap.set(url, signedThumbnails[i]));

        return poses.map(pose => ({
            id: pose.id,
            name: pose.name,
            category: pose.category,
            thumbnailUrl: pose.thumbnailUrl ? thumbnailMap.get(pose.thumbnailUrl) : null,
            isStock: pose.isStock,
        }));
    }

    /**
     * Get user's custom poses
     */
    async getUserPoses(userId: string) {
        const poses = await db.query.studioPoses.findMany({
            where: and(
                eq(studioPoses.userId, userId),
                eq(studioPoses.isStock, false)
            ),
            orderBy: [desc(studioPoses.createdAt)],
        });

        if (poses.length === 0) return [];

        // Get signed URLs
        const thumbnailUrls = poses.map(p => p.thumbnailUrl).filter(Boolean) as string[];
        const signedThumbnails = thumbnailUrls.length > 0
            ? await getAuthenticatedUrls(thumbnailUrls)
            : [];

        const thumbnailMap = new Map<string, string>();
        thumbnailUrls.forEach((url, i) => thumbnailMap.set(url, signedThumbnails[i]));

        return poses.map(pose => ({
            id: pose.id,
            name: pose.name,
            category: pose.category,
            thumbnailUrl: pose.thumbnailUrl ? thumbnailMap.get(pose.thumbnailUrl) : null,
            isStock: false,
        }));
    }

    /**
     * Upload a custom pose
     */
    async uploadPose(
        file: Express.Multer.File,
        userId: string,
        name: string,
        category?: string
    ) {
        // Upload to R2
        const fileName = `${uuidv4()}-pose.${file.mimetype.split('/')[1] || 'jpg'}`;
        const r2Key = `studio/${userId}/poses/${fileName}`;

        const r2Url = await uploadFile(file.buffer, r2Key, file.mimetype);

        // Save to database (same image for thumbnail and control)
        const [pose] = await db.insert(studioPoses).values({
            userId,
            name: name || 'My Pose',
            category: category || 'custom',
            thumbnailUrl: r2Url,
            controlImageUrl: r2Url,
            isStock: false,
        }).returning();

        // Get signed URL
        const signedUrl = await getAuthenticatedUrl(r2Url);

        return {
            id: pose.id,
            name: pose.name,
            category: pose.category,
            thumbnailUrl: signedUrl,
            isStock: false,
        };
    }

    /**
     * Get pose control image URL for generation
     */
    async getPoseControlImage(poseId: string): Promise<string | null> {
        const pose = await db.query.studioPoses.findFirst({
            where: eq(studioPoses.id, poseId),
        });

        if (!pose) return null;

        return pose.controlImageUrl;
    }

    /**
     * Delete a user pose
     */
    async deletePose(poseId: string, userId: string) {
        await db.delete(studioPoses)
            .where(and(
                eq(studioPoses.id, poseId),
                eq(studioPoses.userId, userId)
            ));
    }
}

export const posesService = new PosesService();
