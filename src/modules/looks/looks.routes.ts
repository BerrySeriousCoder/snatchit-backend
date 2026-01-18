/**
 * Looks Routes
 * Look management endpoints
 */

import { Router } from 'express';
import { LooksController } from './looks.controller';
import { authenticateUser } from '../../middleware/auth';
import { validate } from '../../middleware/validation';
import { Schemas } from '../../middleware/schemas';
import { writeRateLimiter } from '../../middleware/rateLimiter';

const router = Router();
const controller = new LooksController();

// Save a look (Protected)
router.post('/save', authenticateUser, writeRateLimiter, validate(Schemas.saveLook), controller.save);

// Get user's looks (Protected - wardrobe)
router.get('/user/:userId', authenticateUser, controller.getUserLooks);

// Toggle look privacy (Protected)
router.put('/:lookId/privacy', authenticateUser, writeRateLimiter, validate(Schemas.lookIdParam), validate(Schemas.privacy), controller.togglePrivacy);

// Delete a look (Protected)
router.delete('/:lookId', authenticateUser, writeRateLimiter, validate(Schemas.lookIdParam), controller.delete);

export default router;
