/**
 * Auth Service
 * Business logic for authentication
 */

import { OAuth2Client } from 'google-auth-library';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { db } from '../../db';
import { users, NewUser } from '../../db/schema';
import { logger } from '../../utils/logger';
import { CreditsService } from '../credits/credits.service';

interface GoogleUserInfo {
    googleId: string;
    email: string;
    name?: string;
    picture?: string;
}

interface AuthResult {
    success: boolean;
    user?: {
        id: string;
        name: string | null;
        email: string | null;
        profilePhotoUrl: string | null;
        bodyPhotoUrl: string | null;
    };
    error?: string;
    status?: number;
}

export class AuthService {
    private googleClient: OAuth2Client;

    constructor() {
        this.googleClient = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);
    }

    /**
     * Authenticate user with Google OAuth
     */
    async authenticateWithGoogle(idToken?: string, accessToken?: string): Promise<AuthResult> {
        // Get user info from Google
        const userInfo = idToken
            ? await this.verifyIdToken(idToken)
            : await this.verifyAccessToken(accessToken!);

        if (!userInfo) {
            return { success: false, error: 'Invalid Token', status: 401 };
        }

        if (!userInfo.googleId || !userInfo.email) {
            return { success: false, error: 'Incomplete Google Profile', status: 400 };
        }

        // Find or create user
        const user = await this.findOrCreateUser(userInfo);

        return {
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                profilePhotoUrl: user.profilePhotoUrl,
                bodyPhotoUrl: user.bodyPhotoUrl,
            },
        };
    }

    /**
     * Verify Google ID token
     */
    private async verifyIdToken(idToken: string): Promise<GoogleUserInfo | null> {
        try {
            const ticket = await this.googleClient.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_WEB_CLIENT_ID,
            });

            const payload = ticket.getPayload();
            if (!payload) return null;

            return {
                googleId: payload.sub,
                email: payload.email!,
                name: payload.name,
                picture: payload.picture,
            };
        } catch (err) {
            logger.error({ error: err }, 'Failed to verify ID token');
            return null;
        }
    }

    /**
     * Verify Google access token
     */
    private async verifyAccessToken(accessToken: string): Promise<GoogleUserInfo | null> {
        try {
            const response = await axios.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            const userInfo = response.data;
            return {
                googleId: userInfo.sub,
                email: userInfo.email,
                name: userInfo.name,
                picture: userInfo.picture,
            };
        } catch (err) {
            logger.error({ error: err }, 'Failed to verify access token');
            return null;
        }
    }

    /**
     * Find existing user or create new one
     */
    private async findOrCreateUser(userInfo: GoogleUserInfo) {
        // Check if user exists by Google ID
        let user = await db.query.users.findFirst({
            where: eq(users.googleId, userInfo.googleId),
        });

        if (user) {
            return user;
        }

        // Check if email exists (link account)
        user = await db.query.users.findFirst({
            where: eq(users.email, userInfo.email),
        });

        if (user) {
            // Link Google account to existing user
            const [updatedUser] = await db.update(users)
                .set({
                    googleId: userInfo.googleId,
                    name: userInfo.name || user.name,
                    profilePhotoUrl: user.profilePhotoUrl || userInfo.picture,
                })
                .where(eq(users.id, user.id))
                .returning();
            return updatedUser;
        }

        // Generate unique username
        const baseName = userInfo.name || userInfo.email.split('@')[0];
        const username = await this.generateUniqueUsername(baseName);

        // Create new user
        const newUser: NewUser = {
            googleId: userInfo.googleId,
            email: userInfo.email,
            name: userInfo.name,
            username: username,
            profilePhotoUrl: userInfo.picture,
        };

        const [createdUser] = await db.insert(users).values(newUser).returning();

        // Grant signup bonus - log the transaction (credits are already 6 from schema default)
        const creditsService = new CreditsService();
        await creditsService.grantSignupBonus(createdUser.id);

        logger.info({ userId: createdUser.id }, 'New user created with 3 free credits');
        return createdUser;
    }

    /**
     * Generate unique username from base name
     */
    private async generateUniqueUsername(baseName: string): Promise<string> {
        // Normalize: lowercase, remove special chars, replace spaces with underscores
        let username = baseName
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .trim()
            .replace(/\s+/g, '_')
            .slice(0, 15); // Leave room for suffix

        // Ensure minimum length
        if (username.length < 3) {
            username = `user_${username}`;
        }

        // Check availability
        const existing = await db.query.users.findFirst({
            where: eq(users.username, username),
        });

        if (!existing) {
            return username;
        }

        // If taken, append random numbers until unique
        let attempts = 0;
        while (attempts < 10) {
            const suffix = Math.floor(1000 + Math.random() * 9000); // 4 digit number
            const newUsername = `${username}_${suffix}`;

            const check = await db.query.users.findFirst({
                where: eq(users.username, newUsername),
            });

            if (!check) {
                return newUsername;
            }
            attempts++;
        }

        // Fallback to uuid segment if really unlucky
        return `user_${uuidv4().slice(0, 8)}`;
    }
}
