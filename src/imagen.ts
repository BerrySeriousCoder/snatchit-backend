import { getVertexAccessToken } from './vertex-auth';
import axios from 'axios';
import { logger } from './utils/logger';

/**
 * Generate image using Vertex AI Imagen 3
 * Model: image-generation@006 (or latest available)
 */
export async function generateImage(
    prompt: string,
    aspectRatio: string = '3:4',
    sampleCount: number = 1
): Promise<string[]> {
    const start = Date.now();

    try {
        logger.info({ prompt, aspectRatio }, 'Starting Imagen generation');

        const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
        const region = process.env.GOOGLE_CLOUD_REGION || 'us-central1';

        if (!projectId) {
            throw new Error('GOOGLE_CLOUD_PROJECT_ID is not set');
        }

        const accessToken = await getVertexAccessToken();

        // Endpoint for Imagen 3 (imagen-3.0-generate-002)
        const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/imagen-3.0-generate-002:predict`;

        const requestBody = {
            instances: [
                {
                    prompt: prompt
                }
            ],
            parameters: {
                sampleCount: sampleCount,
                aspectRatio: aspectRatio,
                // safetySettings: ...
            }
        };

        const response = await axios.post(endpoint, requestBody, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=utf-8'
            },
            timeout: 60000
        });

        if (!response.data.predictions || response.data.predictions.length === 0) {
            throw new Error('No predictions returned from Imagen');
        }

        const base64Images = response.data.predictions.map((p: any) => p.bytesBase64Encoded);

        logger.info({ duration: Date.now() - start, count: base64Images.length }, 'Imagen generation complete');
        return base64Images;

    } catch (error: any) {
        logger.error({ error: error.message, details: error.response?.data }, 'Error generating image with Imagen');
        throw error;
    }
}

/**
 * Edit image using Vertex AI Imagen 3 Capability Model
 * Model: imagen-3.0-capability-001
 */
export async function editImage(
    imageBase64: string,
    prompt: string,
    editMode: 'background-swap' | 'inpainting' | 'outpainting' = 'background-swap',
    maskBase64?: string
): Promise<string[]> {
    const start = Date.now();

    try {
        logger.info({ prompt, editMode }, 'Starting Imagen editing');

        const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
        const region = process.env.GOOGLE_CLOUD_REGION || 'us-central1';

        if (!projectId) {
            throw new Error('GOOGLE_CLOUD_PROJECT_ID is not set');
        }

        const accessToken = await getVertexAccessToken();

        // Endpoint for Imagen 3 Capability
        const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/imagen-3.0-capability-001:predict`;

        const instance: any = {
            image: { bytesBase64Encoded: imageBase64 },
            prompt: prompt,
        };

        if (maskBase64) {
            instance.mask = { bytesBase64Encoded: maskBase64 };
        }

        const parameters: any = {
            sampleCount: 1,
            editConfig: {
                editMode: editMode
            }
        };

        const requestBody = {
            instances: [instance],
            parameters: parameters
        };

        const response = await axios.post(endpoint, requestBody, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=utf-8'
            },
            timeout: 60000
        });

        if (!response.data.predictions || response.data.predictions.length === 0) {
            throw new Error('No predictions returned from Imagen Editing');
        }

        const base64Images = response.data.predictions.map((p: any) => p.bytesBase64Encoded);

        logger.info({ duration: Date.now() - start, count: base64Images.length }, 'Imagen editing complete');
        return base64Images;

    } catch (error: any) {
        logger.error({ error: error.message, details: error.response?.data }, 'Error editing image with Imagen');
        throw error;
    }
}
