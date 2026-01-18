/**
 * Cache Service
 * Provides Redis caching operations for the application
 */

import { redis, CACHE_KEYS, CACHE_TTL } from '../redis';
import { logger } from '../utils/logger';
import { User } from '../db/schema';

export class CacheService {
    /**
     * Get user profile from cache
     */
    async getUser(userId: string): Promise<User | null> {
        try {
            const cached = await redis.get<User>(CACHE_KEYS.USER_PROFILE(userId));
            if (cached) {
                logger.debug({ userId }, 'Cache Hit: User Profile');
                return cached;
            }
        } catch (err) {
            logger.warn({ err, userId }, 'Redis Error: Get User');
        }
        return null;
    }

    /**
     * Set user profile in cache
     */
    async setUser(userId: string, user: User): Promise<void> {
        try {
            await redis.set(CACHE_KEYS.USER_PROFILE(userId), user, { ex: CACHE_TTL.USER_PROFILE });
        } catch (err) {
            logger.warn({ err, userId }, 'Redis Error: Set User');
        }
    }

    /**
     * Invalidate user cache
     */
    async invalidateUser(userId: string): Promise<void> {
        try {
            await redis.del(CACHE_KEYS.USER_PROFILE(userId));
            await redis.del(`social:profile:${userId}`);
            logger.debug({ userId }, 'Cache Invalidated: User Profile');
        } catch (err) {
            logger.warn({ err, userId }, 'Redis Error: Invalidate User');
        }
    }

    /**
     * Generic get from cache
     */
    async get<T>(key: string): Promise<T | null> {
        try {
            return await redis.get<T>(key);
        } catch (err) {
            logger.warn({ err, key }, 'Redis Error: Get');
            return null;
        }
    }

    /**
     * Generic set to cache
     */
    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        try {
            await redis.set(key, value, ttlSeconds ? { ex: ttlSeconds } : undefined);
        } catch (err) {
            logger.warn({ err, key }, 'Redis Error: Set');
        }
    }

    /**
     * Delete from cache
     */
    async del(key: string): Promise<void> {
        try {
            await redis.del(key);
        } catch (err) {
            logger.warn({ err, key }, 'Redis Error: Del');
        }
    }
}

// Singleton instance
export const cacheService = new CacheService();
