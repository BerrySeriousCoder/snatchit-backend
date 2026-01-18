/**
 * Users Controller
 * Handles HTTP requests for user operations
 */

import { Request, Response } from 'express';
import { UsersService } from './users.service';
import { AuthRequest } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const isProduction = process.env.NODE_ENV === 'production';

function sanitizeErrorDetails(error: any): string | undefined {
    return isProduction ? undefined : error?.message || String(error);
}

export class UsersController {
    private service = new UsersService();

    /**
     * Create new user with body photo
     */
    create = async (req: Request, res: Response) => {
        try {
            const { phone, name, aspectRatio } = req.body;
            const bodyPhoto = req.file;

            if (!bodyPhoto) {
                return res.status(400).json({ error: 'Body photo is required' });
            }

            const result = await this.service.createUser({ phone, name, aspectRatio }, bodyPhoto);
            res.json({ success: true, user: result });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error creating user');
            res.status(500).json({ error: 'Failed to create user', details: sanitizeErrorDetails(error) });
        }
    };

    /**
     * Get user by ID
     */
    getById = async (req: Request, res: Response) => {
        try {
            const { userId } = req.params;
            const user = await this.service.getUserById(userId);

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({ success: true, user });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.params.userId }, 'Error fetching user');
            res.status(500).json({ error: 'Failed to fetch user' });
        }
    };

    /**
     * Get user profile with stats
     */
    getProfile = async (req: AuthRequest, res: Response) => {
        try {
            const { userId } = req.params;
            const viewerId = req.user?.id;

            const result = await this.service.getUserProfile(userId, viewerId);

            if (!result) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({ success: true, user: result });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.params.userId }, 'Error fetching user profile');
            res.status(500).json({ error: 'Failed to fetch user profile' });
        }
    };

    /**
     * Update user profile
     */
    updateProfile = async (req: AuthRequest, res: Response) => {
        try {
            const { userId } = req.params;
            const { name, username, bio } = req.body;

            // SECURITY: Verify authenticated user is updating their own profile
            if (req.user?.id !== userId) {
                return res.status(403).json({ error: 'Not authorized to update this profile' });
            }

            const result = await this.service.updateProfile(userId, { name, username, bio });

            if (!result.success) {
                return res.status(result.status || 400).json({
                    error: result.error,
                    cooldownMinutes: result.cooldownMinutes
                });
            }

            res.json({ success: true, user: result.user, message: result.message });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.params.userId }, 'Error updating profile');
            res.status(500).json({ error: 'Failed to update profile' });
        }
    };

    /**
     * Check username availability
     */
    checkUsername = async (req: AuthRequest, res: Response) => {
        try {
            const { username } = req.params;
            const excludeUserId = req.user?.id;

            const result = await this.service.checkUsernameAvailability(username, excludeUserId);
            res.json(result);
        } catch (error: any) {
            logger.error({ error: error.message, username: req.params.username }, 'Error checking username');
            res.status(500).json({ error: 'Failed to check username' });
        }
    };

    /**
     * Get user images
     */
    getImages = async (req: AuthRequest, res: Response) => {
        try {
            const { userId } = req.params;

            // SECURITY: Only allow users to view their own body photos
            if (req.user?.id !== userId) {
                return res.status(403).json({ error: 'Not authorized to view these images' });
            }

            const images = await this.service.getUserImages(userId);
            res.json({ success: true, images });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.params.userId }, 'Error fetching user images');
            res.status(500).json({ error: 'Failed to fetch user images' });
        }
    };

    /**
     * Upload user image
     */
    uploadImage = async (req: AuthRequest, res: Response) => {
        try {
            const { userId } = req.params;
            const { isActive, aspectRatio } = req.body;
            const bodyPhoto = req.file;

            // SECURITY: Verify authenticated user owns this account
            if (req.user?.id !== userId) {
                return res.status(403).json({ error: 'Not authorized to upload images for this user' });
            }

            if (!bodyPhoto) {
                return res.status(400).json({ error: 'Body photo is required' });
            }

            const image = await this.service.uploadUserImage(userId, bodyPhoto, {
                isActive: isActive === 'true',
                aspectRatio: aspectRatio || '3:4',
            });

            res.json({ success: true, image });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.params.userId }, 'Error uploading user image');
            res.status(500).json({ error: 'Failed to upload user image', details: sanitizeErrorDetails(error) });
        }
    };

    /**
     * Set active image
     */
    setActiveImage = async (req: AuthRequest, res: Response) => {
        try {
            const { userId, imageId } = req.params;

            // SECURITY: Verify authenticated user owns this account
            if (req.user?.id !== userId) {
                return res.status(403).json({ error: "Not authorized to modify this user's images" });
            }

            const result = await this.service.setActiveImage(userId, imageId);

            if (!result.success) {
                return res.status(result.status || 404).json({ error: result.error });
            }

            res.json({ success: true, image: result.image });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.params.userId }, 'Error setting active image');
            res.status(500).json({ error: 'Failed to set active image' });
        }
    };

    /**
     * Delete user image
     */
    deleteImage = async (req: AuthRequest, res: Response) => {
        try {
            const { userId, imageId } = req.params;

            // SECURITY: Verify authenticated user owns this account
            if (req.user?.id !== userId) {
                return res.status(403).json({ error: 'Not authorized to delete this image' });
            }

            const result = await this.service.deleteUserImage(userId, imageId);

            if (!result.success) {
                return res.status(result.status || 400).json({ error: result.error });
            }

            res.json({ success: true, message: 'Image deleted successfully' });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.params.userId }, 'Error deleting image');
            res.status(500).json({ error: 'Failed to delete image' });
        }
    };
}
