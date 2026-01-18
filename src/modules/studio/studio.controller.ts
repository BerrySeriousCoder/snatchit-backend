import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { studioService } from './studio.service';
import { logger } from '../../utils/logger';

export class StudioController {

    /**
     * Get available models
     */
    async getModels(req: Request, res: Response) {
        try {
            const { page, limit } = req.query;
            const pageNum = page ? parseInt(page as string) : 1;
            const limitNum = limit ? parseInt(limit as string) : 20;

            const models = await studioService.getModels(pageNum, limitNum);
            res.json({ models });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to fetch models');
            res.status(500).json({ error: 'Failed to fetch models' });
        }
    }

    /**
     * Create a new project
     */
    async createProject(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id; // Assumes auth middleware populates req.user
            const { name, description } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Project name is required' });
            }

            const project = await studioService.createProject(userId, name, description);
            res.status(201).json({ project });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to create project');
            res.status(500).json({ error: 'Failed to create project' });
        }
    }

    /**
     * Update a project
     */
    async updateProject(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const { projectId } = req.params;
            const { name, description } = req.body;

            if (!projectId) {
                return res.status(400).json({ error: 'Project ID is required' });
            }

            const project = await studioService.updateProject(projectId, userId, { name, description });

            if (!project) {
                return res.status(404).json({ error: 'Project not found' });
            }

            res.json({ project });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to update project');
            res.status(500).json({ error: 'Failed to update project' });
        }
    }

    /**
     * Get user projects
     */
    async getUserProjects(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const projects = await studioService.getUserProjects(userId);
            res.json({ projects });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to fetch projects');
            res.status(500).json({ error: 'Failed to fetch projects' });
        }
    }

    /**
     * Generate Studio Image
     */
    async generate(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const {
                projectId,
                type,
                modelUrl,
                garmentUrl,
                prompt,
                sourceImageUrl,
                // Virtual Photo Studio params
                poseId,
                scenePresetId,
                sceneCustom,
                lightingPresetId,
                lightingCustom,
                propsId,
                // Model metadata for better generation
                modelGender
            } = req.body;

            if (!projectId) {
                return res.status(400).json({ error: 'Missing required field: projectId' });
            }

            let generation;

            if (type === 'background') {
                if (!prompt) {
                    return res.status(400).json({ error: 'Prompt is required for background generation' });
                }
                generation = await studioService.generateBackground(userId, projectId, prompt, sourceImageUrl);
            } else {
                // Default to Try-On or Pose Generation
                if (!modelUrl) {
                    return res.status(400).json({ error: 'Missing required field: modelUrl' });
                }
                generation = await studioService.generate(
                    userId,
                    projectId,
                    modelUrl,
                    garmentUrl || null,
                    {
                        poseId,
                        scenePresetId,
                        sceneCustom,
                        lightingPresetId,
                        lightingCustom,
                        propsId,
                        modelGender
                    }
                );
            }

            res.status(202).json({ generation, message: 'Generation started' });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to start generation');
            res.status(500).json({ error: 'Failed to start generation' });
        }
    }
    /**
     * Upload Studio Asset
     */
    async uploadAsset(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const { projectId, type } = req.body;
            const file = req.file;

            if (!projectId || !type || !file) {
                return res.status(400).json({ error: 'Missing required fields: projectId, type, file' });
            }

            if (!['garment', 'model', 'background'].includes(type)) {
                return res.status(400).json({ error: 'Invalid asset type' });
            }

            const asset = await studioService.uploadAsset(userId, projectId, file, type as any);
            res.status(201).json({ asset });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to upload asset');
            res.status(500).json({ error: 'Failed to upload asset' });
        }
    }
    /**
     * Get Generation Status
     */
    async getGeneration(req: AuthRequest, res: Response) {
        try {
            const { generationId } = req.params;
            const generation = await studioService.getGeneration(generationId);

            if (!generation) {
                return res.status(404).json({ error: 'Generation not found' });
            }

            res.json({ generation });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to fetch generation');
            res.status(500).json({ error: 'Failed to fetch generation' });
        }
    }
    /**
     * Get Project Assets
     */
    async getProjectAssets(req: AuthRequest, res: Response) {
        try {
            const { projectId } = req.params;
            const { type, page, limit } = req.query;

            if (!projectId) {
                return res.status(400).json({ error: 'Project ID is required' });
            }

            const pageNum = page ? parseInt(page as string) : 1;
            const limitNum = limit ? parseInt(limit as string) : 20;

            const assets = await studioService.getProjectAssets(
                projectId,
                type as 'garment' | 'model' | 'background',
                pageNum,
                limitNum
            );
            res.json({ assets });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to fetch project assets');
            res.status(500).json({ error: 'Failed to fetch project assets' });
        }
    }

    /**
     * Get Project Generations
     */
    async getProjectGenerations(req: AuthRequest, res: Response) {
        try {
            const { projectId } = req.params;
            const { page, limit } = req.query;

            if (!projectId) {
                return res.status(400).json({ error: 'Project ID is required' });
            }

            const pageNum = page ? parseInt(page as string) : 1;
            const limitNum = limit ? parseInt(limit as string) : 20;

            const generations = await studioService.getProjectGenerations(projectId, pageNum, limitNum);
            res.json({ generations });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to fetch project generations');
            res.status(500).json({ error: 'Failed to fetch project generations' });
        }
    }

    async getDownloadUrl(req: AuthRequest, res: Response) {
        try {
            const { url } = req.query;
            if (!url || typeof url !== 'string') {
                return res.status(400).json({ error: 'URL is required' });
            }

            const downloadUrl = await studioService.getDownloadUrl(url);
            res.json({ downloadUrl });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to get download URL');
            res.status(500).json({ error: 'Failed to get download URL' });
        }
    }

    /**
     * Remove background from an image
     */
    async removeBackground(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const { imageUrl, projectId, generationId } = req.body;

            if (!imageUrl) {
                return res.status(400).json({ error: 'Image URL is required' });
            }

            if (!projectId) {
                return res.status(400).json({ error: 'Project ID is required' });
            }

            const result = await studioService.removeBackground(imageUrl, userId, projectId, generationId);
            res.json({
                transparentUrl: result.transparentUrl,
                transparentR2Url: result.r2Url,  // R2 URL for passing to compositeWithColor
                wasCached: result.wasCached
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to remove background');
            res.status(500).json({ error: 'Failed to remove background' });
        }
    }

    /**
     * Composite transparent image with solid color background and save
     */
    async compositeWithColor(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const { transparentUrl, backgroundColor, projectId, sourceTransparentR2Url } = req.body;

            if (!transparentUrl) {
                return res.status(400).json({ error: 'Transparent URL is required' });
            }

            if (!backgroundColor) {
                return res.status(400).json({ error: 'Background color is required' });
            }

            if (!projectId) {
                return res.status(400).json({ error: 'Project ID is required' });
            }

            const result = await studioService.compositeWithColor(
                transparentUrl,
                backgroundColor,
                userId,
                projectId,
                sourceTransparentR2Url  // Pass to save with new generation
            );
            res.json({
                compositedUrl: result.signedUrl,
                generationId: result.generationId
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to composite with color');
            res.status(500).json({ error: 'Failed to composite with color' });
        }
    }

    /**
     * Get user's custom uploaded models for a project
     */
    async getUserModels(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const { projectId } = req.params;

            if (!projectId) {
                return res.status(400).json({ error: 'Project ID is required' });
            }

            const models = await studioService.getUserModels(userId, projectId);
            res.json({ models });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to get user models');
            res.status(500).json({ error: 'Failed to get user models' });
        }
    }

    /**
     * Upload a custom user model
     */
    async uploadUserModel(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const { projectId } = req.params;
            const { name } = req.body;
            const file = req.file;

            if (!projectId) {
                return res.status(400).json({ error: 'Project ID is required' });
            }

            if (!file) {
                return res.status(400).json({ error: 'File is required' });
            }

            const model = await studioService.uploadUserModel(file, userId, projectId, name);
            res.json({ model });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to upload user model');
            res.status(500).json({ error: 'Failed to upload user model' });
        }
    }

    /**
     * Delete a user model
     */
    async deleteUserModel(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const { modelId } = req.params;

            if (!modelId) {
                return res.status(400).json({ error: 'Model ID is required' });
            }

            await studioService.deleteUserModel(modelId, userId);
            res.json({ success: true });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to delete user model');
            res.status(500).json({ error: 'Failed to delete user model' });
        }
    }
}

export const studioController = new StudioController();
