/**
 * Outfits Routes
 * Outfit mode endpoints
 */

import { Router } from 'express';
import { OutfitsController } from './outfits.controller';
import { authenticateUser } from '../../middleware/auth';
import { validate } from '../../middleware/validation';
import { Schemas } from '../../middleware/schemas';
import { writeRateLimiter } from '../../middleware/rateLimiter';

const router = Router();
const controller = new OutfitsController();

// Create new outfit (Protected)
router.post('/create', authenticateUser, writeRateLimiter, validate(Schemas.createOutfit), controller.create);

// Get user's outfits (Protected)
router.get('/user/:userId', authenticateUser, validate(Schemas.userOutfitsPagination), controller.getUserOutfits);

// Get single outfit with generations (Protected)
router.get('/:outfitId', authenticateUser, validate(Schemas.outfitIdParam), controller.getById);

// Delete outfit (Protected)
router.delete('/:outfitId', authenticateUser, writeRateLimiter, validate(Schemas.outfitIdParam), controller.delete);

export default router;
