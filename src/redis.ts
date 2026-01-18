import { Redis } from '@upstash/redis';

/**
 * Upstash Redis Client
 * 
 * Uses REST-based connection which is perfect for serverless environments.
 * Automatically reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from env.
 */
export const redis = Redis.fromEnv();

console.log('✅ Upstash Redis client initialized');

/**
 * Cache Keys
 */
export const CACHE_KEYS = {
    USER_PROFILE: (userId: string) => `user:profile:${userId}`,
};

/**
 * Cache TTLs (in seconds)
 */
export const CACHE_TTL = {
    USER_PROFILE: 60 * 60 * 24, // 24 hours
};
