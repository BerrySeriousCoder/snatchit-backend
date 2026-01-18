import { getVertexAccessToken } from './vertex-auth';
import axios from 'axios';
import { logger } from './utils/logger';

/**
 * Upscale an image using Vertex AI Imagen 4.0 upscale API
 * Model: imagen-4.0-upscale-preview
 * 
 * @param imageBase64 - Base64 encoded image to upscale
 * @param factor - Upscale factor: 'x2' or 'x3' (x4 available but may exceed 17MP limit)
 * @returns Base64 encoded upscaled image
 */
export async function upscaleImage(
    imageBase64: string,
    factor: 'x2' | 'x3' = 'x2'
): Promise<string> {
    const start = Date.now();

    try {
        logger.info({ factor }, 'Starting image upscale');

        // 1. Validate Environment
        const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
        const region = process.env.GOOGLE_CLOUD_REGION || 'us-central1';

        if (!projectId) {
            throw new Error('GOOGLE_CLOUD_PROJECT_ID is not set in .env');
        }

        // 2. Get Access Token
        const accessToken = await getVertexAccessToken();

        // 3. Build API Request
        const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/imagen-4.0-upscale-preview:predict`;

        const requestBody = {
            instances: [
                {
                    prompt: "Upscale the image",
                    image: {
                        bytesBase64Encoded: imageBase64
                    }
                }
            ],
            parameters: {
                mode: "upscale",
                outputOptions: {
                    mimeType: "image/jpeg",
                    compressionQuality: 90
                },
                upscaleConfig: {
                    upscaleFactor: factor
                }
            }
        };

        // 4. Call Vertex AI API
        logger.debug({ region, factor }, 'Sending upscale request to Vertex AI');

        const response = await axios.post(endpoint, requestBody, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=utf-8'
            },
            timeout: 60000 // 60s timeout for image processing
        });

        // 5. Extract Result
        if (!response.data.predictions || response.data.predictions.length === 0) {
            throw new Error('No predictions returned from Vertex AI upscale');
        }

        const prediction = response.data.predictions[0];
        const upscaledBase64 = prediction.bytesBase64Encoded;

        if (!upscaledBase64) {
            throw new Error('Empty image data in Vertex AI upscale response');
        }

        logger.info({ duration: Date.now() - start, factor }, 'Image upscale complete');
        return upscaledBase64;

    } catch (error: any) {
        logger.error({
            error: error.message,
            details: error.response?.data,
            factor
        }, 'Error upscaling image');
        throw error;
    }
}

/**
 * Download image from URL and return as base64
 */
export async function downloadImageAsBase64(imageUrl: string): Promise<string> {
    const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    return Buffer.from(response.data).toString('base64');
}
