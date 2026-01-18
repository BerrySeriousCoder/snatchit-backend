/**
 * Waitlist Routes
 * Public routes for waitlist management
 */

import { Router } from 'express';
import { WaitlistController } from './waitlist.controller';
import { validate } from '../../middleware/validation';
import { Schemas } from '../../middleware/schemas';

const router = Router();
const controller = new WaitlistController();

// Submit to waitlist (sends OTP)
router.post('/', validate(Schemas.waitlistSubmit), controller.submit);

// Verify email with OTP
router.post('/verify', validate(Schemas.waitlistVerify), controller.verify);

// Get waitlist stats
router.get('/stats', controller.getStats);

export default router;
