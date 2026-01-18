/**
 * Credits Routes
 * Endpoints for credit operations
 */

import { Router } from 'express';
import { CreditsController } from './credits.controller';
import { authenticateUser } from '../../middleware/auth';

const router = Router();
const controller = new CreditsController();

// Get credit balance and plan (Protected)
router.get('/balance', authenticateUser, controller.getBalance);

// Get available pricing plans (Public - for display)
router.get('/plans', controller.getPlans);

// Get transaction history (Protected)
router.get('/history', authenticateUser, controller.getHistory);

// Attempt to purchase credits (Protected)
router.post('/purchase', authenticateUser, controller.purchase);

// Record purchase intent - for lead tracking (Protected)
router.post('/intent', authenticateUser, controller.recordIntent);

export default router;
