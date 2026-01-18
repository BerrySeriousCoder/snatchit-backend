import { getVertexAccessToken } from './vertex-auth';
import { getAuthenticatedUrl } from './storage';
import axios from 'axios';
import { logger } from './utils/logger';

/**
 * Generate virtual try-on image using Vertex AI Virtual Try-On API
 * Model: virtual-try-on-preview-08-04
 */
export async function generateVirtualTryOn(
    bodyPhotoUrl: string,
    productBase64s: string[],
    productName: string,
    aspectRatio: string = '3:4'
): Promise<string> {
    const totalStart = Date.now();

    try {
        logger.info({ productName, aspectRatio }, 'Starting Vertex AI try-on');

        // 1. Validate Environment
        const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
        const region = process.env.GOOGLE_CLOUD_REGION || 'us-central1';

        if (!projectId) {
            throw new Error('GOOGLE_CLOUD_PROJECT_ID is not set in .env');
        }

        // 2. Download Body Photo (if needed) or use URL if public (Vertex needs GCS or Base64)
        // For simplicity and reliability, we will download and base64 encode it, 
        // as Vertex API accepts base64.
        const downloadStart = Date.now();
        let finalBodyUrl = bodyPhotoUrl;
        if (bodyPhotoUrl.startsWith('r2://') || bodyPhotoUrl.includes('backblazeb2.com')) {
            finalBodyUrl = await getAuthenticatedUrl(bodyPhotoUrl);
        }

        const bodyResponse = await axios.get(finalBodyUrl, {
            responseType: 'arraybuffer',
            timeout: 15000
        });
        const bodyBase64 = Buffer.from(bodyResponse.data).toString('base64');
        logger.info({ duration: Date.now() - downloadStart }, 'Body image downloaded');

        // 3. Prepare Product Image (Use the first one as the main product)
        if (productBase64s.length === 0) {
            throw new Error('No product images provided');
        }
        const productBase64 = productBase64s[0]; // Vertex Try-On takes one product image per request usually, or we can try to composite.
        // The API spec takes "productImages" array, but usually optimal results are with one clear image.
        // We will pass the first one.

        // 4. Get Access Token
        const tokenStart = Date.now();
        const accessToken = await getVertexAccessToken();
        logger.debug({ duration: Date.now() - tokenStart }, 'Access token retrieved');

        // 5. Call Vertex AI API
        const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/virtual-try-on-preview-08-04:predict`;

        const requestBody = {
            instances: [
                {
                    personImage: {
                        image: {
                            bytesBase64Encoded: bodyBase64
                        }
                    },
                    productImages: [
                        {
                            image: {
                                bytesBase64Encoded: productBase64
                            }
                        }
                    ]
                }
            ],
            parameters: {
                sampleCount: 1,
                // Optional parameters
                // seed: 12345,
                // personGeneration: "allow_adult", 
            }
        };

        const apiStart = Date.now();
        logger.debug({ region }, 'Sending request to Vertex AI');

        // Retry logic: try once more on failure
        const maxRetries = 1;
        let lastError: any;
        let response: any;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    logger.info({ attempt: attempt + 1 }, 'Retrying Vertex AI request...');
                }

                response = await axios.post(endpoint, requestBody, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json; charset=utf-8'
                    },
                    timeout: 60000 // Give it time, image gen is slow
                });

                // Success - break out of retry loop
                break;
            } catch (err: any) {
                lastError = err;
                const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
                const isRetryable = isTimeout || (err.response?.status >= 500 && err.response?.status < 600);

                if (attempt < maxRetries && isRetryable) {
                    logger.warn({ attempt: attempt + 1, error: err.message }, 'Vertex AI request failed, will retry...');
                    // Small delay before retry
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    // No more retries or not a retryable error
                    throw err;
                }
            }
        }

        if (!response) {
            throw lastError || new Error('Unknown error during Vertex AI call');
        }

        const apiMs = Date.now() - apiStart;
        logger.info({ duration: apiMs }, 'Vertex API call complete');

        // 6. Extract Image
        if (!response.data.predictions || response.data.predictions.length === 0) {
            throw new Error('No predictions returned from Vertex AI');
        }

        const prediction = response.data.predictions[0];
        const outputBase64 = prediction.bytesBase64Encoded;

        if (!outputBase64) {
            throw new Error('Empty image data in Vertex AI response');
        }

        logger.info({ duration: Date.now() - totalStart }, 'Vertex try-on complete');
        return outputBase64;

    } catch (error: any) {
        logger.error({ error: error.message, details: error.response?.data }, 'Error generating virtual try-on');
        throw error;
    }
}


/**
 * Pose/Scene/Lighting generation using Imagen 3 Capability API
 * Model: imagen-3.0-capability-001
 * 
 * Docs: https://cloud.google.com/vertex-ai/generative-ai/docs/image/customize-images
 */
export interface PoseGenerationOptions {
    modelImageUrl: string;       // The model/person image
    poseImageUrl?: string;       // Optional pose reference (control image)
    scenePrompt?: string;        // Scene/background description
    lightingPrompt?: string;     // Lighting description
    propsPrompt?: string;        // Props description (text)
    // Pose metadata for better prompts
    poseName?: string;           // e.g., "Over the Shoulder", "S Curve"
    poseCategory?: string;       // e.g., "editorial", "casual", "action"
    // Model metadata for better subject description
    modelGender?: string;        // "male", "female", "non-binary"
    modelDescription?: string;   // Additional model context
    // Prop metadata for style reference
    propName?: string;           // Prop name for prompt context
    propImageUrl?: string;       // Optional prop image for style reference
    // Output settings
    aspectRatio?: string;        // e.g., "3:4", "9:16"
}

export async function generateWithPose(options: PoseGenerationOptions): Promise<string> {
    const {
        modelImageUrl,
        poseImageUrl,
        scenePrompt,
        lightingPrompt,
        propsPrompt,
        // Pose metadata
        poseName,
        poseCategory,
        // Model metadata
        modelGender,
        modelDescription,
        // Prop metadata
        propName,
        propImageUrl,
        // Output settings
        aspectRatio = '3:4'
    } = options;
    const totalStart = Date.now();

    try {
        logger.info({
            hasPose: !!poseImageUrl,
            poseName,
            poseCategory,
            hasScene: !!scenePrompt,
            hasLighting: !!lightingPrompt,
            hasProp: !!propsPrompt || !!propImageUrl,
            propName,
            modelGender,
            aspectRatio
        }, 'Starting Imagen 3 pose generation');

        // 1. Validate Environment
        const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
        const region = process.env.GOOGLE_CLOUD_REGION || 'us-central1';

        if (!projectId) {
            throw new Error('GOOGLE_CLOUD_PROJECT_ID is not set in .env');
        }

        // 2. Download images and convert to base64
        let modelBase64: string;
        let poseBase64: string | null = null;

        // Download model image
        let finalModelUrl = modelImageUrl;
        if (modelImageUrl.startsWith('r2://') || modelImageUrl.includes('backblazeb2.com')) {
            finalModelUrl = await getAuthenticatedUrl(modelImageUrl);
        }
        const modelResponse = await axios.get(finalModelUrl, {
            responseType: 'arraybuffer',
            timeout: 30000
        });
        modelBase64 = Buffer.from(modelResponse.data).toString('base64');
        logger.debug('Model image downloaded');

        // Download pose image if provided
        if (poseImageUrl) {
            let finalPoseUrl = poseImageUrl;
            if (poseImageUrl.startsWith('r2://') || poseImageUrl.includes('backblazeb2.com')) {
                finalPoseUrl = await getAuthenticatedUrl(poseImageUrl);
            }
            const poseResponse = await axios.get(finalPoseUrl, {
                responseType: 'arraybuffer',
                timeout: 30000
            });
            poseBase64 = Buffer.from(poseResponse.data).toString('base64');
            logger.debug('Pose image downloaded');
        }

        // Download prop image if provided (for style reference)
        let propBase64: string | null = null;
        if (propImageUrl) {
            try {
                let finalPropUrl = propImageUrl;
                if (propImageUrl.startsWith('r2://') || propImageUrl.includes('backblazeb2.com')) {
                    finalPropUrl = await getAuthenticatedUrl(propImageUrl);
                }
                const propResponse = await axios.get(finalPropUrl, {
                    responseType: 'arraybuffer',
                    timeout: 30000
                });
                propBase64 = Buffer.from(propResponse.data).toString('base64');
                logger.debug('Prop image downloaded for style reference');
            } catch (err: any) {
                logger.warn({ error: err.message }, 'Failed to download prop image, continuing without style reference');
            }
        }

        // 3. Build dynamic subject description
        const subjectParts: string[] = [];
        if (modelGender && modelGender !== 'non-binary') {
            subjectParts.push(modelGender);
        }
        subjectParts.push('fashion model');
        if (modelDescription) {
            subjectParts.push(modelDescription);
        }
        const subjectDescription = subjectParts.join(' ');

        // 4. Build pose context for prompt
        let poseContext = '';
        if (poseName || poseCategory) {
            const poseParts: string[] = [];
            if (poseName) poseParts.push(poseName.toLowerCase());
            if (poseCategory) poseParts.push(`${poseCategory} style`);
            poseContext = poseParts.join(' ');
        }

        // 5. Build full description with scene and lighting
        let description = 'a high quality professional fashion photograph';
        const descParts: string[] = [];
        if (scenePrompt) descParts.push(scenePrompt);
        if (lightingPrompt) descParts.push(lightingPrompt);
        // Add propsPrompt only if no prop image (text-only props go in description)
        if (propsPrompt && !propBase64) descParts.push(propsPrompt);
        if (descParts.length > 0) {
            description += ' with ' + descParts.join(', ');
        }

        // 6. Build final prompt with pose context and product reference
        let prompt: string;
        // Product reference text - use image reference [3] if available
        const propDescription = propName || 'the accessory';
        const propProductRef = propBase64
            ? ` holding ${propDescription} [3]`
            : '';

        if (poseBase64) {
            // With pose control - include pose name/category for better guidance
            if (poseContext) {
                prompt = `Create an image of a ${subjectDescription} [1]${propProductRef} performing a ${poseContext} pose matching the body position in control image [2]. ${description}. Full body portrait, maintain exact pose from reference, professional studio lighting, high resolution, sharp focus, 8k quality.`;
            } else {
                prompt = `Create an image of a ${subjectDescription} [1]${propProductRef} in the exact body pose shown in control image [2]. ${description}. Full body portrait, professional studio lighting, high resolution, sharp focus, 8k quality.`;
            }
        } else {
            // Without pose, just use subject with scene/lighting and product
            prompt = `Create an image of a ${subjectDescription} [1]${propProductRef}. ${description}. Full body portrait, professional studio lighting, high resolution, sharp focus, 8k quality.`;
        }

        logger.info({ prompt, subjectDescription, hasPropProduct: !!propBase64, propName }, 'Built generation prompt');

        // 7. Build reference images array (per official docs)
        const referenceImages: any[] = [];

        // Subject 1: The model/person - referenceId: 1
        referenceImages.push({
            referenceType: 'REFERENCE_TYPE_SUBJECT',
            referenceId: 1,
            referenceImage: {
                bytesBase64Encoded: modelBase64
            },
            subjectImageConfig: {
                subjectDescription: subjectDescription,
                subjectType: 'SUBJECT_TYPE_PERSON'
            }
        });

        // Control: The pose (if provided) - referenceId: 2
        // Using CANNY for body pose control
        if (poseBase64) {
            referenceImages.push({
                referenceType: 'REFERENCE_TYPE_CONTROL',
                referenceId: 2,
                referenceImage: {
                    bytesBase64Encoded: poseBase64
                },
                controlImageConfig: {
                    controlType: 'CONTROL_TYPE_CANNY',
                    enableControlImageComputation: true  // Let API compute edges from the reference
                }
            });
        }

        // Subject 2: Prop/Product (if image provided) - referenceId: 3
        // This adds the actual product to the scene for the model to hold/use
        if (propBase64) {
            referenceImages.push({
                referenceType: 'REFERENCE_TYPE_SUBJECT',
                referenceId: 3,
                referenceImage: {
                    bytesBase64Encoded: propBase64
                },
                subjectImageConfig: {
                    subjectDescription: propName || 'fashion accessory',
                    subjectType: 'SUBJECT_TYPE_PRODUCT'
                }
            });
        }

        // 8. Get Access Token
        const tokenStart = Date.now();
        const accessToken = await getVertexAccessToken();
        logger.debug({ duration: Date.now() - tokenStart }, 'Access token retrieved');

        // 9. Call Imagen 3 Capability API
        const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/imagen-3.0-capability-001:predict`;

        const requestBody = {
            instances: [{
                prompt,
                referenceImages
            }],
            parameters: {
                sampleCount: 1,
                aspectRatio: aspectRatio,
                negativePrompt: 'wrinkles, noise, Low quality, dirty, low res, multi face, rough texture, messy, messy background, deformed, blurry, duplicate, watermark, text, logo, cropped, out of frame, bad anatomy, ugly, disfigured',
                language: 'en',
                seed: Math.floor(Math.random() * 100000) // Random seed for variety
            }
        };

        const apiStart = Date.now();
        logger.info({ region, endpoint, promptLength: prompt.length, refCount: referenceImages.length }, 'Sending request to Imagen 3 Capability API');

        const response = await axios.post(endpoint, requestBody, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=utf-8'
            },
            timeout: 180000 // 3 minutes for image gen
        });

        const apiMs = Date.now() - apiStart;
        logger.info({ duration: apiMs }, 'Imagen 3 Capability API call complete');

        // 7. Extract Image
        if (!response.data.predictions || response.data.predictions.length === 0) {
            logger.error({ responseData: JSON.stringify(response.data) }, 'No predictions returned');
            throw new Error('No predictions returned from Imagen 3 Capability API');
        }

        const prediction = response.data.predictions[0];
        const outputBase64 = prediction.bytesBase64Encoded;

        if (!outputBase64) {
            logger.error({ prediction: JSON.stringify(prediction) }, 'Empty image data');
            throw new Error('Empty image data in Imagen 3 response');
        }

        logger.info({ duration: Date.now() - totalStart }, 'Imagen 3 pose generation complete');
        return outputBase64;

    } catch (error: any) {
        // Enhanced error logging for debugging API issues
        const errorDetails = {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data ? JSON.stringify(error.response.data) : undefined,
            code: error.code
        };
        logger.error(errorDetails, 'Error in pose generation');
        throw error;
    }
}
