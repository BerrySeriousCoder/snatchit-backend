/**
 * Generation Routes
 * AI generation, link parsing, and upscaling endpoints
 */

import { Router } from 'express';
import { GenerationController } from './generation.controller';
import { authenticateUser } from '../../middleware/auth';
import { validate } from '../../middleware/validation';
import { Schemas } from '../../middleware/schemas';
import { aiRateLimiter } from '../../middleware/rateLimiter';
import { requirePremium } from '../../middleware/requirePremium';

const router = Router();
const controller = new GenerationController();

// Parse product link (Protected)
router.post('/parse-link', authenticateUser, aiRateLimiter, validate(Schemas.parseLink), controller.parseLink);

// Parse product link for outfit mode (Protected + Premium)
router.post('/parse-link-outfit', authenticateUser, requirePremium, aiRateLimiter, validate(Schemas.parseLink), controller.parseLinkForOutfit);

// Generate virtual try-on (Protected)
router.post('/generate', authenticateUser, aiRateLimiter, validate(Schemas.generateWithOutfit), controller.generate);

// Upscale image (Protected + Premium)
router.post('/upscale', authenticateUser, requirePremium, aiRateLimiter, controller.upscale);

export default router;
