/**
 * Auth Controller
 * Handles request/response for authentication endpoints
 */

import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { logger } from '../../utils/logger';

export class AuthController {
    private authService = new AuthService();

    /**
     * Handle Google OAuth login
     */
    googleLogin = async (req: Request, res: Response) => {
        try {
            const { idToken, accessToken } = req.body;

            if (!idToken && !accessToken) {
                return res.status(400).json({ error: 'Missing ID Token or Access Token' });
            }

            const result = await this.authService.authenticateWithGoogle(idToken, accessToken);

            if (!result.success) {
                return res.status(result.status || 401).json({ error: result.error });
            }

            res.json({
                success: true,
                user: result.user,
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Google Auth Error');
            res.status(500).json({ error: 'Authentication failed' });
        }
    };
}
