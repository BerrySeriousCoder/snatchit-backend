import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { logger } from '../utils/logger';

const client = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);
const isProduction = process.env.NODE_ENV === 'production';

export interface AuthRequest extends Request {
    user?: any;
}

/**
 * Middleware: Authenticate user
 * 
 * Supports two authentication methods:
 * 1. Google ID Token (production): Authorization: Bearer <googleIdToken>
 * 2. User ID (development/temporary): Authorization: Bearer <userId> (UUID format)
 * 
 * The UUID-based auth is temporary until proper Google Sign-In is fully integrated.
 * In production, this should be replaced with proper JWT tokens.
 */
export async function authenticateUser(req: AuthRequest, res: Response, next: NextFunction) {
    const authStart = Date.now();
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid Authorization header' });
        }

        const token = authHeader.split(' ')[1];

        // Check if token is a UUID (userId-based auth)
        // This is used when the client stores userId after OAuth login
        // The user was already authenticated during /auth/google flow
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (uuidRegex.test(token)) {
            // userId-based authentication - user was already OAuth verified during login
            const user = await db.query.users.findFirst({
                where: eq(users.id, token),
            });

            if (!user) {
                return res.status(401).json({ error: 'User not found' });
            }

            req.user = user;
            logger.debug({ userId: user.id, duration: Date.now() - authStart }, 'Auth (userId)');
            return next();
        }

        // Google ID Token verification
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_WEB_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload || !payload.sub) {
            return res.status(401).json({ error: 'Invalid Token' });
        }

        const googleId = payload.sub;

        // Find user in DB by Google ID
        const user = await db.query.users.findFirst({
            where: eq(users.googleId, googleId),
        });

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Attach user to request
        req.user = user;
        logger.debug({ userId: user.id, duration: Date.now() - authStart }, 'Auth (Google)');
        next();
    } catch (error: any) {
        logger.error({ error: error.message }, 'Auth Middleware Error');
        res.status(401).json({ error: 'Authentication failed' });
    }
}

/**
 * Middleware: Optional authentication
 * 
 * Attempts to authenticate the user if a token is present.
 * If no token is present or authentication fails, the request proceeds without req.user.
 * This allows endpoints to serve public content while still identifying logged-in users.
 */
export async function authenticateOptional(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    // If no header, proceed as guest
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    // Attempt auth, but ignore errors
    try {
        const token = authHeader.split(' ')[1];
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (uuidRegex.test(token)) {
            const user = await db.query.users.findFirst({
                where: eq(users.id, token),
            });
            if (user) req.user = user;
            return next();
        }

        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_WEB_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (payload && payload.sub) {
            const user = await db.query.users.findFirst({
                where: eq(users.googleId, payload.sub),
            });
            if (user) req.user = user;
        }
    } catch (error) {
        // Ignore auth errors for optional auth - just treat as guest
        // logger.debug('Optional auth failed, proceeding as guest');
    }

    next();
}
