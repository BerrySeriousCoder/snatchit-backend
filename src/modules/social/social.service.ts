/**
 * Social Service
 * Business logic for social features (feed, reactions, follows)
 */

import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { users, looks, reactions, follows, NewReaction, NewFollow } from '../../db/schema';
import { getAuthenticatedUrls } from '../../storage';
import { redis } from '../../redis';
import { logger } from '../../utils/logger';

// Cache Keys
const SOCIAL_CACHE = {
    GLOBAL_FEED: (page: number, limit: number) => `social:feed:global:${page}:${limit}`,
    LEADERBOARD: 'social:leaderboard',
};

// Cache TTLs
const SOCIAL_TTL = {
    GLOBAL_FEED: 60 * 5, // 5 minutes
    LEADERBOARD: 60 * 60, // 1 hour
};

export class SocialService {
    /**
     * Get feed (global or friends)
     */
    async getFeed(type: string, page: number, limit: number, userId?: string) {
        const offset = (page - 1) * limit;

        // Build where clause
        const whereClause = type === 'friends' && userId
            ? and(
                eq(looks.isPublic, true),
                inArray(looks.userId,
                    db.select({ id: follows.followingId })
                        .from(follows)
                        .where(eq(follows.followerId, userId))
                )
            )
            : eq(looks.isPublic, true);

        // Get feed looks with creator info
        const feedLooks = await db.select({
            look: looks,
            creator: {
                id: users.id,
                name: users.name,
                username: users.username,
                profilePhotoUrl: users.profilePhotoUrl,
            },
            reactionCount: sql<number>`(SELECT COUNT(*) FROM ${reactions} WHERE ${reactions.lookId} = ${looks.id})`.mapWith(Number),
            hasReacted: userId
                ? sql<boolean>`EXISTS(SELECT 1 FROM ${reactions} WHERE ${reactions.lookId} = ${looks.id} AND ${reactions.userId} = ${String(userId)})`
                : sql<boolean>`false`,
        })
            .from(looks)
            .innerJoin(users, eq(looks.userId, users.id))
            .where(whereClause)
            .orderBy(desc(looks.createdAt))
            .limit(limit)
            .offset(offset);

        // Batch get authenticated URLs
        const generatedImageUrls = feedLooks.map(f => f.look.generatedImageUrl).filter((url): url is string => !!url);
        const creatorPhotoUrls = feedLooks.map(f => f.creator.profilePhotoUrl).filter((url): url is string => !!url);
        const allUrls = [...generatedImageUrls, ...creatorPhotoUrls];

        const authenticatedUrls = await getAuthenticatedUrls(allUrls);

        // Map URLs back
        let authIndex = 0;
        const genUrlMap = new Map<string, string>();
        generatedImageUrls.forEach(url => genUrlMap.set(url, authenticatedUrls[authIndex++]));

        const creatorUrlMap = new Map<string, string>();
        creatorPhotoUrls.forEach(url => creatorUrlMap.set(url, authenticatedUrls[authIndex++]));

        // Sign baseImageUrls
        const baseImageUrls = feedLooks.map(f => f.look.baseImageUrl).filter((url): url is string => !!url);
        const signedBaseUrls = await getAuthenticatedUrls(baseImageUrls);
        const baseUrlMap = new Map<string, string>();
        let baseIndex = 0;
        baseImageUrls.forEach(url => baseUrlMap.set(url, signedBaseUrls[baseIndex++]));

        return feedLooks.map(f => ({
            ...f.look,
            generatedImageUrl: f.look.generatedImageUrl ? genUrlMap.get(f.look.generatedImageUrl) : null,
            baseImageUrl: f.look.baseImageUrl ? baseUrlMap.get(f.look.baseImageUrl) : null,
            creator: {
                ...f.creator,
                profilePhotoUrl: f.creator.profilePhotoUrl ? creatorUrlMap.get(f.creator.profilePhotoUrl) : null,
            },
            reactionCount: f.reactionCount,
            hasReacted: f.hasReacted,
        }));
    }

    /**
     * Toggle reaction (like/unlike)
     */
    async toggleReaction(lookId: string, userId: string, type: 'heart' | 'fire' | 'ice' | 'skull' | 'cap') {
        // Check if reaction exists
        const [existingReaction] = await db.select()
            .from(reactions)
            .where(and(eq(reactions.lookId, lookId), eq(reactions.userId, userId)))
            .limit(1);

        if (existingReaction) {
            // Remove reaction (unlike)
            await db.delete(reactions)
                .where(and(eq(reactions.lookId, lookId), eq(reactions.userId, userId)));

            const [countResult] = await db.select({
                count: sql<number>`count(*)`.mapWith(Number),
            }).from(reactions).where(eq(reactions.lookId, lookId));

            return { action: 'removed', hasReacted: false, reactionCount: countResult?.count || 0 };
        } else {
            // Add reaction (like)
            const newReaction: NewReaction = { userId, lookId, type };
            await db.insert(reactions).values(newReaction);

            const [countResult] = await db.select({
                count: sql<number>`count(*)`.mapWith(Number),
            }).from(reactions).where(eq(reactions.lookId, lookId));

            return { action: 'added', hasReacted: true, reactionCount: countResult?.count || 0 };
        }
    }

    /**
     * Get user's public looks
     */
    async getUserPublicLooks(userId: string, page: number, limit: number, viewerId?: string) {
        const offset = (page - 1) * limit;

        // If viewer is the owner, show all looks (including private)
        // Otherwise, only show public looks
        const isOwner = viewerId === userId;

        const userLooks = await db.select({
            look: looks,
            creator: {
                id: users.id,
                name: users.name,
                username: users.username,
                profilePhotoUrl: users.profilePhotoUrl,
            },
            reactionCount: sql<number>`(SELECT COUNT(*) FROM ${reactions} WHERE ${reactions.lookId} = ${looks.id})`.mapWith(Number),
            hasReacted: viewerId
                ? sql<boolean>`EXISTS(SELECT 1 FROM ${reactions} WHERE ${reactions.lookId} = ${looks.id} AND ${reactions.userId} = ${String(viewerId)})`
                : sql<boolean>`false`,
        })
            .from(looks)
            .innerJoin(users, eq(looks.userId, users.id))
            .where(isOwner
                ? eq(looks.userId, userId)
                : and(eq(looks.userId, userId), eq(looks.isPublic, true))
            )
            .orderBy(desc(looks.createdAt))
            .limit(limit)
            .offset(offset);

        // Batch get authenticated URLs
        const imageUrls = userLooks.map(l => l.look.generatedImageUrl).filter((url): url is string => !!url);
        const authUrls = await getAuthenticatedUrls(imageUrls);

        let authIndex = 0;
        return userLooks.map(l => ({
            ...l.look,
            generatedImageUrl: l.look.generatedImageUrl ? authUrls[authIndex++] : null,
            creator: l.creator,
            reactionCount: l.reactionCount,
            hasReacted: l.hasReacted,
        }));
    }

    /**
     * Get user's liked looks
     */
    async getUserLikedLooks(userId: string, page: number, limit: number) {
        const offset = (page - 1) * limit;

        const likedLooks = await db.select({
            look: looks,
            creator: {
                id: users.id,
                name: users.name,
                username: users.username,
                profilePhotoUrl: users.profilePhotoUrl,
            },
            reactionCount: sql<number>`(SELECT COUNT(*) FROM ${reactions} WHERE ${reactions.lookId} = ${looks.id})`.mapWith(Number),
        })
            .from(reactions)
            .innerJoin(looks, eq(reactions.lookId, looks.id))
            .innerJoin(users, eq(looks.userId, users.id))
            .where(eq(reactions.userId, userId))
            .orderBy(desc(reactions.createdAt))
            .limit(limit)
            .offset(offset);

        // Batch get authenticated URLs
        const generatedUrls = likedLooks.map(l => l.look.generatedImageUrl).filter((url): url is string => !!url);
        const profileUrls = likedLooks.map(l => l.creator.profilePhotoUrl).filter((url): url is string => !!url);
        const allUrls = [...generatedUrls, ...profileUrls];
        const authUrls = await getAuthenticatedUrls(allUrls);

        let authIndex = 0;
        const genUrlMap = new Map<string, string>();
        generatedUrls.forEach(url => genUrlMap.set(url, authUrls[authIndex++]));

        const profileUrlMap = new Map<string, string>();
        profileUrls.forEach(url => profileUrlMap.set(url, authUrls[authIndex++]));

        return likedLooks.map(l => ({
            ...l.look,
            generatedImageUrl: l.look.generatedImageUrl ? genUrlMap.get(l.look.generatedImageUrl) : null,
            creator: {
                ...l.creator,
                profilePhotoUrl: l.creator.profilePhotoUrl ? profileUrlMap.get(l.creator.profilePhotoUrl) : null,
            },
            reactionCount: l.reactionCount,
            hasReacted: true, // User liked this, so always true
        }));
    }

    /**
     * Toggle follow
     */
    async toggleFollow(followerId: string, followingId: string) {
        // Check if already following
        const [existing] = await db.select()
            .from(follows)
            .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
            .limit(1);

        if (existing) {
            // Unfollow
            await db.delete(follows)
                .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
            return { action: 'unfollowed', isFollowing: false };
        } else {
            // Follow
            const newFollow: NewFollow = { followerId, followingId };
            await db.insert(follows).values(newFollow);
            return { action: 'followed', isFollowing: true };
        }
    }

    /**
     * Get followers
     */
    async getFollowers(userId: string, page: number, limit: number) {
        const offset = (page - 1) * limit;

        const followersList = await db.select({
            id: users.id,
            name: users.name,
            username: users.username,
            profilePhotoUrl: users.profilePhotoUrl,
        })
            .from(follows)
            .innerJoin(users, eq(follows.followerId, users.id))
            .where(eq(follows.followingId, userId))
            .limit(limit)
            .offset(offset);

        // Get authenticated profile URLs
        const profileUrls = followersList.map(f => f.profilePhotoUrl).filter((url): url is string => !!url);
        const authUrls = await getAuthenticatedUrls(profileUrls);

        let authIndex = 0;
        return followersList.map(f => ({
            ...f,
            profilePhotoUrl: f.profilePhotoUrl ? authUrls[authIndex++] : null,
        }));
    }

    /**
     * Get following
     */
    async getFollowing(userId: string, page: number, limit: number) {
        const offset = (page - 1) * limit;

        const followingList = await db.select({
            id: users.id,
            name: users.name,
            username: users.username,
            profilePhotoUrl: users.profilePhotoUrl,
        })
            .from(follows)
            .innerJoin(users, eq(follows.followingId, users.id))
            .where(eq(follows.followerId, userId))
            .limit(limit)
            .offset(offset);

        // Get authenticated profile URLs
        const profileUrls = followingList.map(f => f.profilePhotoUrl).filter((url): url is string => !!url);
        const authUrls = await getAuthenticatedUrls(profileUrls);

        let authIndex = 0;
        return followingList.map(f => ({
            ...f,
            profilePhotoUrl: f.profilePhotoUrl ? authUrls[authIndex++] : null,
        }));
    }

    /**
     * Get leaderboard
     */
    async getLeaderboard() {
        // Try cache first
        try {
            const cached = await redis.get(SOCIAL_CACHE.LEADERBOARD);
            if (cached) return cached;
        } catch (err) {
            logger.warn({ err }, 'Redis error: Get leaderboard');
        }

        const leaderboard = await db.select({
            id: users.id,
            name: users.name,
            username: users.username,
            profilePhotoUrl: users.profilePhotoUrl,
            streakCurrent: users.streakCurrent,
        })
            .from(users)
            .orderBy(desc(users.streakCurrent))
            .limit(50);

        // Get authenticated profile URLs
        const profileUrls = leaderboard.map(u => u.profilePhotoUrl).filter((url): url is string => !!url);
        const authUrls = await getAuthenticatedUrls(profileUrls);

        let authIndex = 0;
        const result = leaderboard.map(u => ({
            ...u,
            profilePhotoUrl: u.profilePhotoUrl ? authUrls[authIndex++] : null,
        }));

        // Cache result
        try {
            await redis.set(SOCIAL_CACHE.LEADERBOARD, result, { ex: SOCIAL_TTL.LEADERBOARD });
        } catch (err) {
            logger.warn({ err }, 'Redis error: Set leaderboard');
        }

        return result;
    }
}
