import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { logger } from './utils/logger';
import { redis } from './redis';

// Lazy-initialized R2 client (created after env vars are loaded)
let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
    if (!r2Client) {
        r2Client = new S3Client({
            region: 'us-east-1', // Force region to avoid 'auto' lookup latency
            endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID!,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
            },
        });
    }
    return r2Client;
}

function getBucketName(): string {
    return process.env.R2_BUCKET_NAME!;
}

// Signed URL cache to avoid regenerating for same files
interface SignedUrlCache {
    url: string;
    expiresAt: number;
}

const signedUrlCache = new Map<string, SignedUrlCache>();
const SIGNED_URL_CACHE_DURATION = 50 * 60 * 1000; // 50 minutes (URLs valid for 1 hour, 10 min buffer)
const SIGNED_URL_EXPIRY = 3600; // 1 hour in seconds
const SAFETY_BUFFER_MS = 5 * 60 * 1000; // 5 minute safety buffer

/**
 * Initialize R2 - validates credentials are present
 */
export async function authorize(): Promise<string> {
    // Force client creation to validate credentials
    getR2Client();
    logger.info('✅ Cloudflare R2 configured');
    return 'r2-ready';
}

/**
 * Upload file to R2 (with Sharp optimization)
 */
// Whitelist of allowed image MIME types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function uploadFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string = 'image/jpeg',
    background: boolean = false,
    skipOptimization: boolean = false
): Promise<string> {
    const startTime = Date.now();

    try {
        // 1. Validate MIME type against whitelist
        if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
            throw new Error(`Invalid image type '${mimeType}'. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`);
        }

        // 2. Image Optimization: Resize and compress (Fast)
        let optimizedBuffer = buffer;
        let contentType = mimeType;

        if (!skipOptimization) {
            try {
                optimizedBuffer = await sharp(buffer)
                    .resize(1024, null, { withoutEnlargement: true })
                    .jpeg({ quality: 80 })
                    .toBuffer();

                contentType = 'image/jpeg'; // Force JPEG content type if optimized

                logger.info({
                    fileName,
                    originalSize: buffer.length,
                    optimizedSize: optimizedBuffer.length,
                    reduction: `${Math.round((1 - optimizedBuffer.length / buffer.length) * 100)}%`
                }, 'Image Optimized');
            } catch (sharpError: any) {
                // Sharp failed - likely invalid/corrupted image data
                logger.error({ fileName, error: sharpError.message }, 'Sharp processing failed');
                throw new Error('Invalid image file. Please upload a valid JPEG, PNG, WebP, or GIF image.');
            }
        } else {
            logger.info({ fileName, size: buffer.length }, 'Image Optimization Skipped');
        }

        const command = new PutObjectCommand({
            Bucket: getBucketName(),
            Key: fileName,
            Body: optimizedBuffer,
            ContentType: contentType,
        });

        // 2. Upload to R2
        const uploadPromise = getR2Client().send(command);

        const fileUrl = `r2://${getBucketName()}/${fileName}`;

        if (background) {
            // Handle upload in background
            uploadPromise
                .then(() => {
                    logger.info({ fileName, duration: Date.now() - startTime }, '🚀 Background R2 Upload Success');
                })
                .catch(error => {
                    logger.error({ fileName, error: error.message }, '❌ Background R2 Upload Failed');
                });

            return fileUrl;
        }

        // Wait for upload to complete
        await uploadPromise;
        logger.info({ fileName, duration: Date.now() - startTime }, 'R2 Upload Success');
        return fileUrl;
    } catch (error: any) {
        logger.error({ fileName, error: error.message }, 'R2 Upload Failed');
        throw error;
    }
}

/**
 * Delete file from R2
 */
export async function deleteFile(fileName: string): Promise<void> {
    try {
        const command = new DeleteObjectCommand({
            Bucket: getBucketName(),
            Key: fileName,
        });

        await getR2Client().send(command);
        logger.info({ fileName }, '✅ R2 deleted');
    } catch (error: any) {
        logger.error({ fileName, error: error.message }, '❌ R2 delete error');
        throw error;
    }
}

/**
 * Get signed URL for file download (for private bucket access)
 */
export async function getSignedDownloadUrl(fileKey: string): Promise<string> {
    // 1. Check Memory Cache (Fastest) - with proper expiry validation
    const memCached = signedUrlCache.get(fileKey);
    if (memCached && memCached.expiresAt > Date.now() + SAFETY_BUFFER_MS) {
        return memCached.url;
    }

    // 2. Check Redis Cache - store expiry timestamp WITH URL
    const cacheKey = `signed_url:${fileKey}`;
    try {
        const cached = await redis.get<{ url: string; expiresAt: number }>(cacheKey);
        if (cached && typeof cached === 'object' && cached.expiresAt > Date.now() + SAFETY_BUFFER_MS) {
            // Backfill memory cache with ACTUAL expiry from Redis
            signedUrlCache.set(fileKey, {
                url: cached.url,
                expiresAt: cached.expiresAt,
            });
            return cached.url;
        }

        // 3. Generate New Signed URL (cache miss or expired)
        const command = new GetObjectCommand({
            Bucket: getBucketName(),
            Key: fileKey,
        });

        const signedUrl = await getSignedUrl(getR2Client(), command, {
            expiresIn: SIGNED_URL_EXPIRY,
        });

        // Calculate actual expiry time
        const expiresAt = Date.now() + SIGNED_URL_CACHE_DURATION;

        // 4. Update Memory Cache
        signedUrlCache.set(fileKey, {
            url: signedUrl,
            expiresAt: expiresAt,
        });

        // 5. Update Redis Cache with expiry timestamp included
        await redis.set(cacheKey, { url: signedUrl, expiresAt }, { ex: SIGNED_URL_EXPIRY - 300 });

        return signedUrl;
    } catch (error: any) {
        logger.error({ fileKey, error: error.message }, '❌ R2 signed URL error');
        throw error;
    }
}

/**
 * Get signed URL specifically for file download (attachment)
 */
export async function getSignedDownloadUrlForAttachment(fileKey: string, fileName: string): Promise<string> {
    try {
        const command = new GetObjectCommand({
            Bucket: getBucketName(),
            Key: fileKey,
            ResponseContentDisposition: `attachment; filename="${fileName}"`,
        });

        const signedUrl = await getSignedUrl(getR2Client(), command, {
            expiresIn: 3600, // 1 hour
        });

        return signedUrl;
    } catch (error: any) {
        logger.error({ fileKey, error: error.message }, '❌ R2 attachment signed URL error');
        throw error;
    }
}

/**
 * Parse R2 URL to get file key
 * Format: r2://bucket-name/path/to/file.jpg
 */
function parseR2Url(url: string): string | null {
    if (url.startsWith('r2://')) {
        const parts = url.replace('r2://', '').split('/');
        parts.shift(); // Remove bucket name
        return parts.join('/');
    }
    // Legacy B2 URL support during migration
    const match = url.match(/\/file\/[^\/]+\/(.+)$/);
    return match ? match[1] : null;
}

/**
 * Get authenticated URL for a stored file
 */
export async function getAuthenticatedUrl(fileUrl: string): Promise<string> {
    const fileKey = parseR2Url(fileUrl);
    if (!fileKey) return fileUrl;
    return getSignedDownloadUrl(fileKey);
}

/**
 * Batch get authenticated URLs (Optimized with MGET)
 */
export async function getAuthenticatedUrls(fileUrls: string[]): Promise<string[]> {
    if (fileUrls.length === 0) return [];
    const startTime = Date.now();

    try {
        // 1. Parse keys and check memory cache
        const keys = fileUrls.map(url => ({ original: url, key: parseR2Url(url) }));
        const results: string[] = new Array(fileUrls.length).fill('');
        const missingIndices: number[] = [];

        keys.forEach((item, index) => {
            if (!item.key) {
                results[index] = item.original;
                return;
            }
            const memCached = signedUrlCache.get(item.key);
            if (memCached && memCached.expiresAt > Date.now() + SAFETY_BUFFER_MS) {
                results[index] = memCached.url;
            } else {
                missingIndices.push(index);
            }
        });

        if (missingIndices.length === 0) return results;

        // 2. Batch check Redis for missing ones
        const missingKeys = missingIndices.map(i => `signed_url:${keys[i].key}`);

        const redisStart = Date.now();
        // Add timeout to Redis call (fail fast after 2s)
        const redisPromise = redis.mget<Array<{ url: string; expiresAt: number } | null>>(...missingKeys);
        const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), 2000));

        const redisValues = await Promise.race([redisPromise, timeoutPromise]) as Array<{ url: string; expiresAt: number } | null> | null;

        if (!redisValues) {
            logger.warn({ duration: Date.now() - redisStart }, '⚠️ Redis MGET timed out or failed');
        }

        const stillMissingIndices: number[] = [];
        if (redisValues) {
            redisValues.forEach((val, i) => {
                const originalIndex = missingIndices[i];
                // Check if valid object with non-expired URL
                if (val && typeof val === 'object' && val.expiresAt > Date.now() + SAFETY_BUFFER_MS) {
                    results[originalIndex] = val.url;
                    // Backfill memory cache with ACTUAL expiry
                    signedUrlCache.set(keys[originalIndex].key!, {
                        url: val.url,
                        expiresAt: val.expiresAt,
                    });
                } else {
                    stillMissingIndices.push(originalIndex);
                }
            });
        } else {
            // If Redis failed, all missing indices are still missing
            stillMissingIndices.push(...missingIndices);
        }

        if (stillMissingIndices.length === 0) {
            const duration = Date.now() - startTime;
            if (duration > 50) logger.info(`[TIMING] ⚡ R2 signed URLs (Batch Cache Hit): ${duration}ms`);
            return results;
        }

        // 3. Generate remaining ones in TRUE parallel (skip individual getSignedDownloadUrl overhead)
        const signStart = Date.now();
        const expiresAt = Date.now() + SIGNED_URL_CACHE_DURATION;

        const signPromises = stillMissingIndices.map(async (index) => {
            const fileKey = keys[index].key!;
            const command = new GetObjectCommand({
                Bucket: getBucketName(),
                Key: fileKey,
            });
            const signedUrl = await getSignedUrl(getR2Client(), command, {
                expiresIn: SIGNED_URL_EXPIRY,
            });

            // Update memory cache immediately
            signedUrlCache.set(fileKey, { url: signedUrl, expiresAt });
            results[index] = signedUrl;

            return { key: fileKey, url: signedUrl, expiresAt };
        });

        const signedResults = await Promise.all(signPromises);
        const signDuration = Date.now() - signStart;

        // 4. Batch write to Redis using pipeline (don't await - fire and forget)
        if (signedResults.length > 0) {
            const pipeline = redis.pipeline();
            signedResults.forEach(({ key, url, expiresAt: exp }) => {
                pipeline.set(`signed_url:${key}`, { url, expiresAt: exp }, { ex: SIGNED_URL_EXPIRY - 300 });
            });
            pipeline.exec().catch(err => logger.warn({ error: err }, 'Redis pipeline write failed'));
        }

        const duration = Date.now() - startTime;
        logger.info(`[TIMING] ⚡ R2 signed URLs (Total: ${duration}ms) | Redis: ${Date.now() - redisStart}ms | Signing: ${signDuration}ms (${stillMissingIndices.length} parallel) | Count: ${fileUrls.length}`);
        return results;
    } catch (error) {
        logger.error({ error }, 'Error in batch signed URLs');
        // Fallback to sequential if batch fails
        return Promise.all(fileUrls.map(url => getAuthenticatedUrl(url)));
    }
}

/**
 * Get download token for file (for compatibility with existing code)
 * Returns empty string since we use signed URLs instead
 */
export async function getDownloadToken(fileName: string): Promise<string> {
    // For R2, we use signed URLs, not tokens
    // This is kept for backward compatibility with gemini.ts
    return '';
}
