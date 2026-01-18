import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../../db';
import { studioProjects, studioAssets, studioGenerations, studioModels, studioModelImages, userModels, studioPoses, studioProps, studioScenePresets, studioLightingPresets } from '../../db/schema';
import { generateVirtualTryOn, generateWithPose } from '../../gemini';
import { generateImage, editImage } from '../../imagen';
import { uploadFile, getAuthenticatedUrl, getAuthenticatedUrls } from '../../storage';
import { logger } from '../../utils/logger';

export class StudioService {

    /**
     * Get available system models from database
     */
    /**
     * Get available system models from database
     */
    async getModels(page: number = 1, limit: number = 20) {
        const offset = (page - 1) * limit;

        // Fetch active models with pagination
        const models = await db.query.studioModels.findMany({
            where: eq(studioModels.isActive, true),
            limit,
            offset,
        });

        // Get primary images for all models
        const modelIds = models.map(m => m.id);
        if (modelIds.length === 0) return [];

        const images = await db.query.studioModelImages.findMany({
            where: eq(studioModelImages.isPrimary, true),
        });

        // Build image map
        const imageMap = new Map<string, string>();
        images.forEach(img => {
            imageMap.set(img.modelId, img.url);
        });

        // Get signed URLs for all images
        const r2Urls = Array.from(imageMap.values());
        const signedUrls = await getAuthenticatedUrls(r2Urls);

        // Create signed URL map
        const signedUrlMap = new Map<string, string>();
        r2Urls.forEach((url, i) => {
            signedUrlMap.set(url, signedUrls[i]);
        });

        // Format response
        return models.map(model => ({
            id: model.id,
            name: model.name,
            url: signedUrlMap.get(imageMap.get(model.id) || '') || '',
            ethnicity: model.ethnicity || '',
            gender: model.gender || '',
        }));
    }

    /**
     * Create a new studio project
     */
    async createProject(userId: string, name: string, description?: string) {
        const [project] = await db.insert(studioProjects).values({
            userId,
            name,
            description,
        }).returning();
        return project;
    }

    /**
     * Update project details
     */
    async updateProject(projectId: string, userId: string, updates: { name?: string, description?: string }) {
        const [project] = await db.update(studioProjects)
            .set({
                ...updates,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(studioProjects.id, projectId),
                    eq(studioProjects.userId, userId)
                )
            )
            .returning();
        return project;
    }

    /**
     * Get user projects
     */
    async getUserProjects(userId: string) {
        return await db.query.studioProjects.findMany({
            where: eq(studioProjects.userId, userId),
            orderBy: [desc(studioProjects.updatedAt)],
            with: {
                // assets: true
            }
        });
    }

    /**
     * Generate Studio Image (Try-On or Pose Generation)
     */
    async generate(
        userId: string,
        projectId: string,
        modelUrl: string,
        garmentUrl: string | null,
        studioOptions?: {
            poseId?: string;
            scenePresetId?: string;
            sceneCustom?: string;
            lightingPresetId?: string;
            lightingCustom?: string;
            propsId?: string;
            modelGender?: string;
        }
    ) {
        const hasPose = !!studioOptions?.poseId;
        const hasScene = !!studioOptions?.scenePresetId || !!studioOptions?.sceneCustom;
        const hasLighting = !!studioOptions?.lightingPresetId || !!studioOptions?.lightingCustom;
        const hasProps = !!studioOptions?.propsId;
        const usesPoseGeneration = hasPose || hasScene || hasLighting || hasProps;

        logger.info({
            userId,
            projectId,
            hasGarment: !!garmentUrl,
            hasPose,
            hasScene,
            hasLighting,
            hasProps,
            usesPoseGeneration
        }, 'Starting Studio Generation');

        // 1. Create a pending generation record
        const [generation] = await db.insert(studioGenerations).values({
            userId,
            projectId,
            inputAssets: JSON.stringify({ modelUrl, garmentUrl, ...studioOptions }),
            status: 'processing',
        }).returning();

        // 2. Trigger Generation (Async)
        if (usesPoseGeneration) {
            // Use Imagen 3 Capability API for pose/scene/lighting
            this.processPoseGeneration(generation.id, userId, projectId, modelUrl, garmentUrl, studioOptions);
        } else if (garmentUrl) {
            // Standard try-on
            this.processGeneration(generation.id, userId, projectId, modelUrl, garmentUrl);
        } else {
            // No garment and no pose options - just return model
            await db.update(studioGenerations).set({
                status: 'completed',
                outputUrl: modelUrl,
            }).where(eq(studioGenerations.id, generation.id));
        }

        return generation;
    }

    /**
     * Generate Background Asset
     */
    /**
     * Generate Background Asset (or Replace Background)
     */
    async generateBackground(userId: string, projectId: string, prompt: string, sourceImageUrl?: string) {
        logger.info({ userId, projectId, prompt, hasSourceImage: !!sourceImageUrl }, 'Starting Background Generation');

        const [generation] = await db.insert(studioGenerations).values({
            userId,
            projectId,
            inputAssets: JSON.stringify({ prompt, type: 'background', sourceImageUrl }),
            status: 'processing',
        }).returning();

        this.processBackgroundGeneration(generation.id, userId, projectId, prompt, sourceImageUrl);

        return generation;
    }

    /**
     * Process Try-On Generation
     */
    private async processGeneration(generationId: string, userId: string, projectId: string, modelUrl: string, garmentUrl: string) {
        try {
            // Fetch garment image
            const garmentRes = await axios.get(garmentUrl, { responseType: 'arraybuffer' });
            const garmentBase64 = Buffer.from(garmentRes.data).toString('base64');

            const outputBase64 = await generateVirtualTryOn(
                modelUrl,
                [garmentBase64],
                'Studio Garment',
                '3:4' // Default aspect ratio
            );

            // 3. Upload Result
            const buffer = Buffer.from(outputBase64, 'base64');
            const fileName = `studio/${projectId}/${uuidv4()}.jpg`;
            const uploadedUrl = await uploadFile(buffer, fileName, 'image/jpeg', true);

            // 4. Update Generation Record
            await db.update(studioGenerations)
                .set({
                    status: 'completed',
                    outputUrl: uploadedUrl,
                })
                .where(eq(studioGenerations.id, generationId));

            // 5. Create Asset Record
            await db.insert(studioAssets).values({
                userId,
                projectId,
                type: 'generated', // We might need to add this to enum or use 'model'/'garment'
                url: uploadedUrl,
                name: 'Generated Look',
            });

            logger.info({ generationId }, 'Studio Generation Completed');

        } catch (error: any) {
            logger.error({ generationId, error: error.message }, 'Studio Generation Failed');
            await db.update(studioGenerations)
                .set({
                    status: 'failed',
                    errorMessage: error.message,
                })
                .where(eq(studioGenerations.id, generationId));
        }
    }

    /**
     * Process Pose/Scene/Lighting Generation using Imagen 3 Capability API
     */
    private async processPoseGeneration(
        generationId: string,
        userId: string,
        projectId: string,
        modelUrl: string,
        garmentUrl: string | null,
        studioOptions?: {
            poseId?: string;
            scenePresetId?: string;
            sceneCustom?: string;
            lightingPresetId?: string;
            lightingCustom?: string;
            propsId?: string;
            // Model metadata for better generation
            modelGender?: string;
        }
    ) {
        try {
            // 1. Build Scene Prompt
            let scenePrompt: string | undefined;
            if (studioOptions?.scenePresetId) {
                const scenePreset = await db.query.studioScenePresets.findFirst({
                    where: eq(studioScenePresets.id, studioOptions.scenePresetId),
                });
                scenePrompt = scenePreset?.prompt;
            } else if (studioOptions?.sceneCustom) {
                scenePrompt = studioOptions.sceneCustom;
            }

            // 2. Build Lighting Prompt
            let lightingPrompt: string | undefined;
            if (studioOptions?.lightingPresetId) {
                const lightingPreset = await db.query.studioLightingPresets.findFirst({
                    where: eq(studioLightingPresets.id, studioOptions.lightingPresetId),
                });
                lightingPrompt = lightingPreset?.prompt;
            } else if (studioOptions?.lightingCustom) {
                lightingPrompt = studioOptions.lightingCustom;
            }

            // 3. Get Pose details (image URL, name, category) if provided
            let poseImageUrl: string | undefined;
            let poseName: string | undefined;
            let poseCategory: string | undefined;

            if (studioOptions?.poseId) {
                const pose = await db.query.studioPoses.findFirst({
                    where: eq(studioPoses.id, studioOptions.poseId),
                });
                if (pose) {
                    if (pose.controlImageUrl) {
                        // Get signed URL
                        poseImageUrl = await getAuthenticatedUrl(pose.controlImageUrl);
                    }
                    // Extract pose metadata for prompt enhancement
                    poseName = pose.name;
                    poseCategory = pose.category || undefined;
                }
            }

            // 4. Build Props data (prompt + optional image)
            let propsPrompt: string | undefined;
            let propName: string | undefined;
            let propImageUrl: string | undefined;

            if (studioOptions?.propsId) {
                const prop = await db.query.studioProps.findFirst({
                    where: eq(studioProps.id, studioOptions.propsId),
                });
                if (prop) {
                    propsPrompt = prop.promptText || undefined;
                    propName = prop.name;
                    // If prop has an image, get signed URL for style reference
                    if (prop.imageUrl) {
                        propImageUrl = await getAuthenticatedUrl(prop.imageUrl);
                    }
                }
            }

            logger.info({
                generationId,
                hasPose: !!poseImageUrl,
                poseName,
                poseCategory,
                modelGender: studioOptions?.modelGender,
                scenePrompt,
                lightingPrompt,
                propsPrompt,
                propName,
                hasPropImage: !!propImageUrl,
                hasGarment: !!garmentUrl
            }, 'Starting Imagen 3 pose generation');

            // 5. Call Imagen 3 Capability API for pose/scene/lighting
            const poseOutputBase64 = await generateWithPose({
                modelImageUrl: modelUrl,
                poseImageUrl,
                scenePrompt,
                lightingPrompt,
                propsPrompt,
                // Pass pose metadata for better prompts
                poseName,
                poseCategory,
                // Pass model metadata
                modelGender: studioOptions?.modelGender,
                // Pass prop metadata for style reference
                propName,
                propImageUrl,
            });

            let finalOutputBase64 = poseOutputBase64;

            // 6. If garment is selected, chain virtual try-on on the pose result
            if (garmentUrl) {
                logger.info({ generationId }, 'Chaining Virtual Try-On after pose generation');

                // Download garment image
                const garmentRes = await axios.get(garmentUrl, { responseType: 'arraybuffer' });
                const garmentBase64 = Buffer.from(garmentRes.data).toString('base64');

                // Upload intermediate pose result to get a URL for try-on
                const intermediateBuffer = Buffer.from(poseOutputBase64, 'base64');
                const intermediateFileName = `studio/${projectId}/${uuidv4()}_intermediate.jpg`;
                const intermediateUrl = await uploadFile(intermediateBuffer, intermediateFileName, 'image/jpeg', true);

                // Call Virtual Try-On with the pose-generated image
                finalOutputBase64 = await generateVirtualTryOn(
                    intermediateUrl, // The posed model image
                    [garmentBase64],
                    'Studio Garment',
                    '3:4'
                );

                logger.info({ generationId }, 'Virtual Try-On chaining completed');
            }

            // 7. Upload Final Result
            const buffer = Buffer.from(finalOutputBase64, 'base64');
            const fileName = `studio/${projectId}/${uuidv4()}.jpg`;
            const uploadedUrl = await uploadFile(buffer, fileName, 'image/jpeg', true);

            // 8. Update Generation Record
            await db.update(studioGenerations)
                .set({
                    status: 'completed',
                    outputUrl: uploadedUrl,
                })
                .where(eq(studioGenerations.id, generationId));

            // 9. Create Asset Record
            await db.insert(studioAssets).values({
                userId,
                projectId,
                type: 'generated',
                url: uploadedUrl,
                name: garmentUrl ? 'Generated Studio Look' : 'Generated Studio Image',
            });

            logger.info({ generationId, hadGarment: !!garmentUrl }, 'Pose Generation Pipeline Completed');

        } catch (error: any) {
            logger.error({ generationId, error: error.message }, 'Pose Generation Failed');
            await db.update(studioGenerations)
                .set({
                    status: 'failed',
                    errorMessage: error.message,
                })
                .where(eq(studioGenerations.id, generationId));
        }
    }

    /**
     * Process Background Generation
     */
    /**
     * Process Background Generation
     */
    private async processBackgroundGeneration(generationId: string, userId: string, projectId: string, prompt: string, sourceImageUrl?: string) {
        try {
            let base64: string;

            if (sourceImageUrl) {
                // Background Replacement Mode
                // 1. Download source image
                const imageRes = await axios.get(sourceImageUrl, { responseType: 'arraybuffer' });
                const imageBase64 = Buffer.from(imageRes.data).toString('base64');

                // 2. Call Edit Image (Background Swap)
                const [editedBase64] = await editImage(imageBase64, prompt, 'background-swap');
                base64 = editedBase64;
            } else {
                // Text-to-Image Mode
                const [genBase64] = await generateImage(prompt, '3:4');
                base64 = genBase64;
            }

            const buffer = Buffer.from(base64, 'base64');
            const fileName = `studio/${projectId}/bg_${uuidv4()}.jpg`;
            const uploadedUrl = await uploadFile(buffer, fileName, 'image/jpeg', true);

            await db.update(studioGenerations)
                .set({
                    status: 'completed',
                    outputUrl: uploadedUrl,
                })
                .where(eq(studioGenerations.id, generationId));

            await db.insert(studioAssets).values({
                userId,
                projectId,
                type: 'background',
                url: uploadedUrl,
                name: `BG: ${prompt.substring(0, 20)}...`,
            });

            logger.info({ generationId }, 'Background Generation Completed');

        } catch (error: any) {
            logger.error({ generationId, error: error.message }, 'Background Generation Failed');
            await db.update(studioGenerations)
                .set({
                    status: 'failed',
                    errorMessage: error.message,
                })
                .where(eq(studioGenerations.id, generationId));
        }
    }

    /**
     * Upload Studio Asset
     */
    async uploadAsset(userId: string, projectId: string, file: Express.Multer.File, type: 'garment' | 'model' | 'background') {
        const fileName = `studio/${projectId}/${uuidv4()}_${file.originalname}`;
        // Skip optimization for studio assets to preserve quality and format (e.g. PNG transparency)
        const r2Url = await uploadFile(file.buffer, fileName, file.mimetype, false, true);

        const [asset] = await db.insert(studioAssets).values({
            userId,
            projectId,
            type,
            url: r2Url, // Store the r2:// URL in DB
            name: file.originalname,
        }).returning();

        // Return a signed URL for immediate display
        const signedUrl = await getAuthenticatedUrl(r2Url);

        return {
            ...asset,
            url: signedUrl, // Override with signed URL for client
        };
    }
    /**
     * Get Generation by ID
     */
    async getGeneration(id: string) {
        const [generation] = await db.select().from(studioGenerations).where(eq(studioGenerations.id, id));

        if (!generation) return null;

        // Return signed URL for output if exists
        let signedOutputUrl = generation.outputUrl;
        if (generation.outputUrl && generation.outputUrl.startsWith('r2://')) {
            signedOutputUrl = await getAuthenticatedUrl(generation.outputUrl);
        }

        return {
            ...generation,
            r2Url: generation.outputUrl,
            outputUrl: signedOutputUrl,
        };
    }
    /**
     * Get Project Assets
     */
    /**
     * Get Project Assets
     */
    async getProjectAssets(projectId: string, type?: 'garment' | 'model' | 'background', page: number = 1, limit: number = 20) {
        const offset = (page - 1) * limit;

        let query = db.select().from(studioAssets).where(eq(studioAssets.projectId, projectId));

        if (type) {
            query = db.select().from(studioAssets).where(
                eq(studioAssets.projectId, projectId) && eq(studioAssets.type, type)
            );
        }

        const assets = await query.orderBy(desc(studioAssets.createdAt))
            .limit(limit)
            .offset(offset);

        // Sign URLs
        const r2Urls = assets.map(a => a.url).filter(url => url.startsWith('r2://'));
        if (r2Urls.length > 0) {
            const signedUrls = await getAuthenticatedUrls(r2Urls);
            const urlMap = new Map<string, string>();
            r2Urls.forEach((url, i) => urlMap.set(url, signedUrls[i]));

            return assets.map(asset => ({
                ...asset,
                r2Url: asset.url,
                url: urlMap.get(asset.url) || asset.url
            }));
        }

        return assets;
    }

    /**
     * Get Project Generations
     */
    async getProjectGenerations(projectId: string, page: number = 1, limit: number = 20) {
        const offset = (page - 1) * limit;

        const generations = await db.select()
            .from(studioGenerations)
            .where(eq(studioGenerations.projectId, projectId))
            .orderBy(desc(studioGenerations.createdAt))
            .limit(limit)
            .offset(offset);

        // Sign URLs
        const r2Urls = generations
            .map(g => g.outputUrl)
            .filter((url): url is string => !!url && url.startsWith('r2://'));

        if (r2Urls.length > 0) {
            const signedUrls = await getAuthenticatedUrls(r2Urls);
            const urlMap = new Map<string, string>();
            r2Urls.forEach((url, i) => urlMap.set(url, signedUrls[i]));

            return generations.map(gen => ({
                ...gen,
                r2Url: gen.outputUrl,
                outputUrl: gen.outputUrl ? (urlMap.get(gen.outputUrl) || gen.outputUrl) : null
            }));
        }

        return generations;
    }

    /**
     * Get Download URL
     */
    async getDownloadUrl(url: string) {
        // If it's already a signed URL, we can't easily re-sign it with content-disposition
        // But if it's an R2 URL, we can
        if (url.startsWith('r2://')) {
            const fileKey = url.replace('r2://' + process.env.R2_BUCKET_NAME + '/', '');
            const fileName = fileKey.split('/').pop() || 'download.png';
            // Import dynamically to avoid circular dependency if needed, or just use imported function
            const { getSignedDownloadUrlForAttachment } = await import('../../storage');
            return await getSignedDownloadUrlForAttachment(fileKey, fileName);
        }

        // If it's a public URL or already signed, try to extract key and re-sign
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('r2.cloudflarestorage.com')) {
                // Extract key from path (remove leading slash)
                const fileKey = decodeURIComponent(urlObj.pathname.substring(1));
                const fileName = fileKey.split('/').pop() || 'download.png';
                const { getSignedDownloadUrlForAttachment } = await import('../../storage');
                return await getSignedDownloadUrlForAttachment(fileKey, fileName);
            }
        } catch (e) {
            // Not a valid URL or parsing failed, ignore
        }

        return url;
    }

    /**
     * Remove background from an image
     * Uses @imgly/background-removal-node for local processing
     * If generationId is provided, checks for cached transparent URL first
     */
    async removeBackground(
        imageUrl: string,
        userId: string,
        projectId: string,
        generationId?: string
    ): Promise<{ transparentUrl: string; r2Url: string; wasCached: boolean }> {
        const { removeBackground } = await import('@imgly/background-removal-node');

        try {
            // Check cache if generationId provided
            if (generationId) {
                const existing = await db.query.studioGenerations.findFirst({
                    where: eq(studioGenerations.id, generationId)
                });

                if (existing?.transparentUrl) {
                    logger.info({ generationId }, 'Using cached transparent URL');
                    const signedUrl = await getAuthenticatedUrl(existing.transparentUrl);
                    return { transparentUrl: signedUrl, r2Url: existing.transparentUrl, wasCached: true };
                }
            }

            logger.info({ imageUrl }, 'Starting background removal');

            // Get signed URL if it's an R2 URL
            let processUrl = imageUrl;
            if (imageUrl.startsWith('r2://')) {
                processUrl = await getAuthenticatedUrl(imageUrl);
            }

            // Remove background using ONNX model - pass URL directly
            const resultBlob = await removeBackground(processUrl);

            // Convert blob to buffer
            const arrayBuffer = await resultBlob.arrayBuffer();
            const outputBuffer = Buffer.from(arrayBuffer);

            // Upload to R2 - skip optimization since it's already processed
            const fileName = `${uuidv4()}-nobg.png`;
            const r2Key = `studio/${userId}/${projectId}/processed/${fileName}`;

            const r2Url = await uploadFile(outputBuffer, r2Key, 'image/png', false, true);

            // Save to generation record if generationId provided
            if (generationId) {
                await db.update(studioGenerations)
                    .set({ transparentUrl: r2Url })
                    .where(eq(studioGenerations.id, generationId));
                logger.info({ generationId, r2Url }, 'Cached transparent URL to generation');
            }

            // Convert to signed URL for browser display
            const signedUrl = await getAuthenticatedUrl(r2Url);

            logger.info({ r2Url, signedUrl }, 'Background removed successfully');

            return { transparentUrl: signedUrl, r2Url: r2Url, wasCached: false };
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to remove background');
            throw new Error('Background removal failed');
        }
    }

    /**
     * Composite a transparent PNG with a solid color background
     */
    async compositeWithColor(
        transparentUrl: string,
        backgroundColor: string,
        userId: string,
        projectId: string,
        sourceTransparentR2Url?: string  // R2 URL of the source transparent image to copy to new generation
    ): Promise<{ signedUrl: string; r2Url: string; generationId: string }> {
        const sharp = (await import('sharp')).default;

        try {
            logger.info({ transparentUrl, backgroundColor }, 'Starting color compositing');

            // Download transparent image
            const response = await axios.get(transparentUrl, { responseType: 'arraybuffer' });
            const foregroundBuffer = Buffer.from(response.data);

            // Get image dimensions
            const metadata = await sharp(foregroundBuffer).metadata();
            const width = metadata.width || 1024;
            const height = metadata.height || 1365;

            // Parse hex color to RGB
            const hex = backgroundColor.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);

            // Create solid color background and composite
            const compositedBuffer = await sharp({
                create: {
                    width,
                    height,
                    channels: 3,
                    background: { r, g, b }
                }
            })
                .composite([{ input: foregroundBuffer, gravity: 'center' }])
                .jpeg({ quality: 90 })
                .toBuffer();

            // Upload to R2
            const fileName = `${uuidv4()}-composited.jpg`;
            const r2Key = `studio/${userId}/${projectId}/composited/${fileName}`;

            const r2Url = await uploadFile(compositedBuffer, r2Key, 'image/jpeg', false, true);

            // Get signed URL for display
            const signedUrl = await getAuthenticatedUrl(r2Url);

            // Save as a generation record (so it appears in history)
            // Also copy the source transparent URL so user can edit this image later without re-processing
            const generationId = uuidv4();
            await db.insert(studioGenerations).values({
                id: generationId,
                userId,
                projectId,
                status: 'completed',
                outputUrl: signedUrl,
                transparentUrl: sourceTransparentR2Url || null,  // Carry forward the transparent version
            });

            logger.info({ r2Url, generationId }, 'Color compositing successful');

            return { signedUrl, r2Url, generationId };
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to composite with color');
            throw new Error('Color compositing failed');
        }
    }

    /**
     * Get user's custom uploaded models for a project
     */
    async getUserModels(userId: string, projectId: string) {
        const models = await db.query.userModels.findMany({
            where: and(
                eq(userModels.userId, userId),
                eq(userModels.projectId, projectId)
            ),
            orderBy: [desc(userModels.createdAt)],
        });

        // Get signed URLs
        const r2Urls = models.map(m => m.url);
        if (r2Urls.length === 0) return [];

        const signedUrls = await getAuthenticatedUrls(r2Urls);

        return models.map((model, i) => ({
            id: model.id,
            name: model.name || 'My Model',
            url: signedUrls[i],
            isUserModel: true,
            createdAt: model.createdAt,
        }));
    }

    /**
     * Upload a custom user model
     */
    async uploadUserModel(
        file: Express.Multer.File,
        userId: string,
        projectId: string,
        name?: string
    ) {
        // Upload to R2
        const fileName = `${uuidv4()}-user-model.${file.mimetype.split('/')[1] || 'jpg'}`;
        const r2Key = `studio/${userId}/${projectId}/models/${fileName}`;

        const r2Url = await uploadFile(file.buffer, r2Key, file.mimetype);

        // Save to database
        const [model] = await db.insert(userModels).values({
            userId,
            projectId,
            name: name || 'My Model',
            url: r2Url,
        }).returning();

        // Get signed URL
        const signedUrl = await getAuthenticatedUrl(r2Url);

        return {
            id: model.id,
            name: model.name || 'My Model',
            url: signedUrl,
            isUserModel: true,
        };
    }

    /**
     * Delete a user model
     */
    async deleteUserModel(modelId: string, userId: string) {
        await db.delete(userModels)
            .where(and(
                eq(userModels.id, modelId),
                eq(userModels.userId, userId)
            ));
    }
}

export const studioService = new StudioService();
