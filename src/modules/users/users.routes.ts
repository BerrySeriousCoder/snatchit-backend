/**
 * Users Routes
 * User management and image gallery endpoints
 */

import { Router } from 'express';
import multer from 'multer';
import { UsersController } from './users.controller';
import { authenticateUser } from '../../middleware/auth';
import { validate } from '../../middleware/validation';
import { Schemas } from '../../middleware/schemas';
import { writeRateLimiter } from '../../middleware/rateLimiter';

const router = Router();
const controller = new UsersController();

// Multer config for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Create user with body photo (Public)
router.post('/create', upload.single('bodyPhoto'), validate(Schemas.createUser), controller.create);

// Get user by ID (Public)
router.get('/:userId', validate(Schemas.userIdParam), controller.getById);

// Get user profile with stats (Protected)
router.get('/:userId/profile', authenticateUser, controller.getProfile);

// Update user profile (Protected)
router.put('/:userId/profile', authenticateUser, writeRateLimiter, validate(Schemas.userIdParam), validate(Schemas.updateProfile), controller.updateProfile);

// Check username availability (Protected)
router.get('/check-username/:username', authenticateUser, controller.checkUsername);

// Image gallery endpoints
router.get('/:userId/images', authenticateUser, controller.getImages);
router.post('/:userId/images', authenticateUser, writeRateLimiter, upload.single('bodyPhoto'), validate(Schemas.uploadUserImage), controller.uploadImage);
router.put('/:userId/images/:imageId/active', authenticateUser, writeRateLimiter, validate(Schemas.imageIdParam), controller.setActiveImage);
router.delete('/:userId/images/:imageId', authenticateUser, writeRateLimiter, validate(Schemas.imageIdParam), controller.deleteImage);

export default router;
