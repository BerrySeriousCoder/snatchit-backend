/**
 * Social Controller
 * Handles HTTP requests for social features
 */

import { Response } from 'express';
import { SocialService } from './social.service';
import { AuthRequest } from '../../middleware/auth';
import { logger } from '../../utils/logger';

export class SocialController {
    private service = new SocialService();

    /**
     * Get feed (global or friends)
     */
    getFeed = async (req: AuthRequest, res: Response) => {
        const totalStart = Date.now();
        try {
            const { type = 'global', page = 1, limit = 20 } = req.query;
            const userId = req.user?.id;

            const result = await this.service.getFeed(
                String(type),
                Number(page),
                Math.min(Number(limit), 50),
                userId
            );

            res.json({ success: true, looks: result });
            logger.info({ userId, duration: Date.now() - totalStart }, 'Total Feed Request');
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error fetching feed');
            res.status(500).json({ error: 'Failed to fetch feed' });
        }
    };

    /**
     * Toggle reaction on a look
     */
    toggleReaction = async (req: AuthRequest, res: Response) => {
        try {
            const { lookId } = req.params;
            const { type } = req.body;
            const userId = req.user!.id;

            const result = await this.service.toggleReaction(lookId, userId, type);
            res.json({ success: true, ...result });
        } catch (error: any) {
            logger.error({ error: error.message, lookId: req.params.lookId }, 'Error toggling reaction');
            res.status(500).json({ error: 'Failed to toggle reaction' });
        }
    };

    /**
     * Get user's public looks
     */
    getUserPublicLooks = async (req: AuthRequest, res: Response) => {
        try {
            const { userId } = req.params;
            const { page = 1, limit = 20 } = req.query;
            const viewerId = req.user?.id;

            const looks = await this.service.getUserPublicLooks(
                userId,
                Number(page),
                Math.min(Number(limit), 50),
                viewerId
            );

            res.json({ success: true, looks });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.params.userId }, 'Error fetching user looks');
            res.status(500).json({ error: 'Failed to fetch looks' });
        }
    };

    /**
     * Get user's liked looks
     */
    getUserLikedLooks = async (req: AuthRequest, res: Response) => {
        try {
            const { userId } = req.params;
            const { page = 1, limit = 20 } = req.query;
            const viewerId = req.user?.id;

            // SECURITY: Only allow users to view their own liked looks
            if (viewerId !== userId) {
                return res.status(403).json({ error: 'Not authorized to view liked looks' });
            }

            const looks = await this.service.getUserLikedLooks(userId, Number(page), Number(limit));
            res.json({ success: true, looks });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.params.userId }, 'Error fetching liked looks');
            res.status(500).json({ error: 'Failed to fetch liked looks' });
        }
    };

    /**
     * Toggle follow
     */
    toggleFollow = async (req: AuthRequest, res: Response) => {
        try {
            const { userId } = req.params; // User being followed
            const followerId = req.user!.id;

            if (followerId === userId) {
                return res.status(400).json({ error: 'Cannot follow yourself' });
            }

            const result = await this.service.toggleFollow(followerId, userId);
            res.json({ success: true, ...result });
        } catch (error: any) {
            logger.error({ error: error.message, targetUserId: req.params.userId }, 'Error following user');
            res.status(500).json({ error: 'Failed to follow user' });
        }
    };

    /**
     * Get followers
     */
    getFollowers = async (req: AuthRequest, res: Response) => {
        try {
            const { userId } = req.params;
            const { page = 1, limit = 50 } = req.query;

            const followers = await this.service.getFollowers(userId, Number(page), Number(limit));
            res.json({ success: true, followers });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.params.userId }, 'Error fetching followers');
            res.status(500).json({ error: 'Failed to fetch followers' });
        }
    };

    /**
     * Get following
     */
    getFollowing = async (req: AuthRequest, res: Response) => {
        try {
            const { userId } = req.params;
            const { page = 1, limit = 50 } = req.query;

            const following = await this.service.getFollowing(userId, Number(page), Number(limit));
            res.json({ success: true, following });
        } catch (error: any) {
            logger.error({ error: error.message, userId: req.params.userId }, 'Error fetching following');
            res.status(500).json({ error: 'Failed to fetch following' });
        }
    };

    /**
     * Get leaderboard
     */
    getLeaderboard = async (req: AuthRequest, res: Response) => {
        try {
            const leaderboard = await this.service.getLeaderboard();
            res.json({ success: true, leaderboard });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error fetching leaderboard');
            res.status(500).json({ error: 'Failed to fetch leaderboard' });
        }
    };
}
