/**
 * Users Service
 * Business logic for user operations
 */

import { eq, desc, and, sql, ne } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db';
import { users, userImages, looks, follows, User } from '../../db/schema';
import { uploadFile, getAuthenticatedUrl, getAuthenticatedUrls } from '../../storage';
import { cacheService } from '../../services/cache.service';
import { logger } from '../../utils/logger';

interface CreateUserData {
    phone?: string;
    name?: string;
    aspectRatio?: string;
}

interface UpdateProfileData {
    name?: string;
    username?: string;
    bio?: string;
}

interface UploadImageOptions {
    isActive: boolean;
    aspectRatio: string;
}

export class UsersService {
    /**
     * Get user by ID with caching
     */
    async getUserById(userId: string): Promise<User | null> {
        // Try cache first
        const cached = await cacheService.getUser(userId);
        if (cached) {
            // Sign profilePhotoUrl if present (cached user might have internal URL)
            if (cached.profilePhotoUrl) {
                cached.profilePhotoUrl = await getAuthenticatedUrl(cached.profilePhotoUrl);
            }
            return cached;
        }

        // Fetch from DB
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (user) {
            await cacheService.setUser(userId, user);
            // Sign profilePhotoUrl for the response
            if (user.profilePhotoUrl) {
                user.profilePhotoUrl = await getAuthenticatedUrl(user.profilePhotoUrl);
            }
        }

        return user || null;
    }

    /**
     * Create new user with body photo
     */
    async createUser(data: CreateUserData, file: Express.Multer.File) {
        // Upload to R2
        const fileName = `users/${uuidv4()}_${Date.now()}.jpg`;
        const imageUrl = await uploadFile(file.buffer, fileName, file.mimetype, true);

        // Get signed URL
        const authenticatedUrl = await getAuthenticatedUrl(imageUrl);

        // Create user in transaction
        const user = await db.transaction(async (tx) => {
            const [createdUser] = await tx.insert(users).values({
                id: uuidv4(),
                phone: data.phone || null,
                name: data.name || null,
                bodyPhotoUrl: imageUrl,
                profilePhotoUrl: imageUrl,
            }).returning();

            // Add to user images gallery
            await tx.insert(userImages).values({
                userId: createdUser.id,
                imageUrl: imageUrl,
                aspectRatio: data.aspectRatio || '3:4',
                isActive: true,
            });

            return createdUser;
        });

        logger.info({ userId: user.id }, 'New user created');

        return {
            ...user,
            bodyPhotoUrl: authenticatedUrl,
        };
    }

    /**
     * Get user profile with stats
     */
    async getUserProfile(userId: string, viewerId?: string) {
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (!user) return null;

        // Get follower count
        const [followerCount] = await db.select({ count: sql<number>`count(*)` })
            .from(follows)
            .where(eq(follows.followingId, userId));

        // Get following count
        const [followingCount] = await db.select({ count: sql<number>`count(*)` })
            .from(follows)
            .where(eq(follows.followerId, userId));

        // Get looks count
        const [looksCount] = await db.select({ count: sql<number>`count(*)` })
            .from(looks)
            .where(eq(looks.userId, userId));

        // Check if viewer is following this user
        let isFollowing = false;
        if (viewerId && viewerId !== userId) {
            const [follow] = await db.select()
                .from(follows)
                .where(and(eq(follows.followerId, viewerId), eq(follows.followingId, userId)))
                .limit(1);
            isFollowing = !!follow;
        }

        // Get authenticated profile photo URL
        const profilePhotoUrl = user.profilePhotoUrl
            ? await getAuthenticatedUrl(user.profilePhotoUrl)
            : null;

        return {
            id: user.id,
            name: user.name,
            username: user.username,
            bio: user.bio,
            profilePhotoUrl,
            followerCount: Number(followerCount.count),
            followingCount: Number(followingCount.count),
            looksCount: Number(looksCount.count),
            isFollowing,
            streakCurrent: user.streakCurrent,
        };
    }

    /**
     * Update user profile
     */
    async updateProfile(userId: string, data: UpdateProfileData) {
        const user = await this.getUserById(userId);
        if (!user) {
            return { success: false, error: 'User not found', status: 404 };
        }

        const updates: Partial<User> = {};

        // Handle name update
        if (data.name !== undefined) {
            updates.name = data.name.trim().slice(0, 50) || null;
        }

        // Handle username update with cooldown
        if (data.username !== undefined) {
            const normalizedUsername = data.username.toLowerCase().trim();

            // Check username format
            if (normalizedUsername && !/^[a-z0-9_]{3,20}$/.test(normalizedUsername)) {
                return {
                    success: false,
                    error: 'Username must be 3-20 characters, lowercase letters, numbers, and underscores only',
                    status: 400,
                };
            }

            // Check cooldown (14 days)
            if (user.usernameChangedAt) {
                const lastChanged = new Date(user.usernameChangedAt);
                const cooldownEnd = new Date(lastChanged.getTime() + 14 * 24 * 60 * 60 * 1000);
                if (new Date() < cooldownEnd) {
                    const minutesLeft = Math.ceil((cooldownEnd.getTime() - Date.now()) / (1000 * 60));
                    return {
                        success: false,
                        error: 'Username can only be changed once every 14 days',
                        status: 403,
                        cooldownMinutes: minutesLeft,
                    };
                }
            }

            // Check availability
            if (normalizedUsername) {
                const existing = await db.query.users.findFirst({
                    where: and(
                        eq(users.username, normalizedUsername),
                        ne(users.id, userId)
                    ),
                });

                if (existing) {
                    return { success: false, error: 'Username is already taken', status: 409 };
                }
            }

            updates.username = normalizedUsername || null;
            updates.usernameChangedAt = new Date();
        }

        // Handle bio update
        if (data.bio !== undefined) {
            updates.bio = data.bio.trim().slice(0, 160) || null;
        }

        if (Object.keys(updates).length === 0) {
            return { success: true, user, message: 'No changes made' };
        }

        const [updatedUser] = await db.update(users)
            .set(updates)
            .where(eq(users.id, userId))
            .returning();

        // Invalidate cache
        await cacheService.invalidateUser(userId);

        return { success: true, user: updatedUser, message: 'Profile updated' };
    }

    /**
     * Check username availability
     */
    async checkUsernameAvailability(username: string, excludeUserId?: string) {
        const normalizedUsername = username.toLowerCase().trim();

        // Check format
        if (!/^[a-z0-9_]{3,20}$/.test(normalizedUsername)) {
            return {
                available: false,
                reason: 'Username must be 3-20 characters, lowercase letters, numbers, and underscores only',
            };
        }

        // Check if taken
        const whereClause = excludeUserId
            ? and(eq(users.username, normalizedUsername), ne(users.id, excludeUserId))
            : eq(users.username, normalizedUsername);

        const existing = await db.query.users.findFirst({ where: whereClause });

        return {
            available: !existing,
            reason: existing ? 'Username is already taken' : undefined,
        };
    }

    /**
     * Get user images (gallery)
     */
    async getUserImages(userId: string) {
        const images = await db.query.userImages.findMany({
            where: eq(userImages.userId, userId),
            orderBy: [desc(userImages.createdAt)],
        });

        // Batch get authenticated URLs
        const imageUrls = images.map(img => img.imageUrl);
        const authenticatedUrls = await getAuthenticatedUrls(imageUrls);

        return images.map((img, index) => ({
            ...img,
            imageUrl: authenticatedUrls[index],
        }));
    }

    /**
     * Upload user image
     */
    async uploadUserImage(userId: string, file: Express.Multer.File, options: UploadImageOptions) {
        // Upload to R2
        const fileName = `users/${userId}/${uuidv4()}_${Date.now()}.jpg`;
        const imageUrl = await uploadFile(file.buffer, fileName, file.mimetype, true);

        // Get signed URL
        const authenticatedUrl = await getAuthenticatedUrl(imageUrl);

        // Consolidated transaction
        const savedImage = await db.transaction(async (tx) => {
            // Check if user has any images
            const [countResult] = await tx.select({ count: sql<number>`count(*)` })
                .from(userImages)
                .where(eq(userImages.userId, userId));

            const isFirstImage = Number(countResult.count) === 0;
            const shouldBeActive = options.isActive || isFirstImage;

            // If setting as active, deactivate others
            if (shouldBeActive) {
                await tx.update(userImages)
                    .set({ isActive: false })
                    .where(eq(userImages.userId, userId));

                await tx.update(users)
                    .set({ bodyPhotoUrl: imageUrl })
                    .where(eq(users.id, userId));
            }

            // Insert new image
            const [newImage] = await tx.insert(userImages).values({
                userId,
                imageUrl,
                aspectRatio: options.aspectRatio,
                isActive: shouldBeActive,
            }).returning();

            return newImage;
        });

        // Invalidate cache
        await cacheService.invalidateUser(userId);

        return {
            ...savedImage,
            imageUrl: authenticatedUrl,
        };
    }

    /**
     * Set active image
     */
    async setActiveImage(userId: string, imageId: string) {
        // Verify image belongs to user
        const image = await db.query.userImages.findFirst({
            where: and(eq(userImages.id, imageId), eq(userImages.userId, userId)),
        });

        if (!image) {
            return { success: false, error: 'Image not found', status: 404 };
        }

        // Deactivate all user images
        await db.update(userImages)
            .set({ isActive: false })
            .where(eq(userImages.userId, userId));

        // Activate selected image
        const [updatedImage] = await db.update(userImages)
            .set({ isActive: true })
            .where(eq(userImages.id, imageId))
            .returning();

        // Update main user record
        await db.update(users)
            .set({ bodyPhotoUrl: image.imageUrl })
            .where(eq(users.id, userId));

        // Invalidate cache
        await cacheService.invalidateUser(userId);

        return { success: true, image: updatedImage };
    }

    /**
     * Delete user image
     */
    async deleteUserImage(userId: string, imageId: string) {
        // Verify image belongs to user
        const image = await db.query.userImages.findFirst({
            where: and(eq(userImages.id, imageId), eq(userImages.userId, userId)),
        });

        if (!image) {
            return { success: false, error: 'Image not found', status: 404 };
        }

        // Count remaining images
        const [countResult] = await db.select({ count: sql<number>`count(*)` })
            .from(userImages)
            .where(eq(userImages.userId, userId));

        if (Number(countResult.count) <= 1) {
            return {
                success: false,
                error: 'Cannot delete your only image. Please upload another first.',
                status: 400,
            };
        }

        // Delete the image
        await db.delete(userImages).where(eq(userImages.id, imageId));

        // If deleted image was active, set newest as active
        if (image.isActive) {
            const [newestImage] = await db.select()
                .from(userImages)
                .where(eq(userImages.userId, userId))
                .orderBy(desc(userImages.createdAt))
                .limit(1);

            if (newestImage) {
                await db.update(userImages)
                    .set({ isActive: true })
                    .where(eq(userImages.id, newestImage.id));

                await db.update(users)
                    .set({ bodyPhotoUrl: newestImage.imageUrl })
                    .where(eq(users.id, userId));
            }
        }

        // Invalidate cache
        await cacheService.invalidateUser(userId);

        logger.info({ userId, imageId }, 'Gallery image deleted');

        return { success: true };
    }
}
