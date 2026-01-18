/**
 * Auth Routes
 * Handles Google OAuth authentication
 */

import { Router } from 'express';
import { AuthController } from './auth.controller';

const router = Router();
const controller = new AuthController();

// Google OAuth login
router.post('/google', controller.googleLogin);

export default router;
