/**
 * Express App Configuration
 * 
 * This file sets up the Express application with middleware and routes.
 * The actual server startup is in server.ts.
 */

import './env'; // Load environment variables first

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { globalRateLimiter, authRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// ==================== TRUST PROXY ====================
if (isProduction) {
    app.set('trust proxy', 1);
}

// ==================== SECURITY MIDDLEWARE ====================

// Security headers
app.use(helmet({
    contentSecurityPolicy: isProduction ? undefined : false,
    crossOriginEmbedderPolicy: false,
}));

// ==================== CORS ====================

export const getAllowedOrigins = (): string[] => {
    const origins: string[] = ['snatched://'];
    const envOrigin = process.env.ALLOWED_ORIGIN || 'https://snatched.com';

    origins.push(envOrigin);

    if (envOrigin.includes('://www.')) {
        origins.push(envOrigin.replace('://www.', '://'));
    } else if (envOrigin.includes('://')) {
        origins.push(envOrigin.replace('://', '://www.'));
    }

    return origins;
};

const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3002',
            'http://localhost:3003',
            ...getAllowedOrigins()
        ];

        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1 || !isProduction) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
};

// ==================== APPLY MIDDLEWARE ====================

app.use(globalRateLimiter);
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ==================== HEALTH CHECK ====================

app.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        message: 'Snatched Backend is running!',
        timestamp: new Date().toISOString(),
    });
});

// ==================== MOUNT ROUTES ====================

// Import routes from modules
import authRoutes from './modules/auth/auth.routes';
import waitlistRoutes from './modules/waitlist/waitlist.routes';
import usersRoutes from './modules/users/users.routes';
import looksRoutes from './modules/looks/looks.routes';
import outfitsRoutes from './modules/outfits/outfits.routes';
import generationRoutes from './modules/generation/generation.routes';
import socialRoutes from './modules/social/social.routes';
import demoRoutes from './modules/demo/demo.routes';

import studioRoutes from './modules/studio/studio.routes';
import creditsRoutes from './modules/credits/credits.routes';

// Mount route modules
app.use('/auth', authRateLimiter, authRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/looks', looksRoutes);
app.use('/api/outfits', outfitsRoutes);
app.use('/api', generationRoutes);  // parse-link, generate, upscale
app.use('/api', socialRoutes);       // feed, reactions, follows, leaderboard
app.use('/api/demo', demoRoutes);
app.use('/api/studio', studioRoutes);
app.use('/api/credits', creditsRoutes);

// ==================== ERROR HANDLING ====================

app.use(errorHandler);

export default app;
