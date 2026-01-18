/**
 * Demo Routes
 * Public demo playground for waitlist users
 */

import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { DemoController } from './demo.controller';

const router = Router();
const controller = new DemoController();

// Multer config
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Rate limiter for demo endpoints
const demoRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// AI rate limiter for demo
const demoAiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many generation requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Upload user photo for demo
router.post('/upload', demoRateLimiter, upload.single('photo'), controller.uploadPhoto);

// Parse product link for demo
router.post('/parse-link', demoRateLimiter, controller.parseLink);

// Generate try-on for demo (limited generations)
router.post('/generate', demoRateLimiter, demoAiRateLimiter, controller.generate);

// Get demo status
router.get('/status', demoRateLimiter, controller.getStatus);

export default router;
