/**
 * Social Routes
 * Feed, reactions, follows, and leaderboard endpoints
 */

import { Router } from 'express';
import { SocialController } from './social.controller';
import { authenticateUser, authenticateOptional } from '../../middleware/auth';
import { validate } from '../../middleware/validation';
import { Schemas } from '../../middleware/schemas';
import { writeRateLimiter } from '../../middleware/rateLimiter';

const router = Router();
const controller = new SocialController();

// Feed (Publicly accessible, personalized if logged in)
router.get('/feed', authenticateOptional, validate(Schemas.feedPagination), controller.getFeed);

// Reactions (Protected)
router.post('/looks/:lookId/react', authenticateUser, writeRateLimiter, validate(Schemas.lookIdParam), validate(Schemas.react), controller.toggleReaction);

// Get user's looks (public profile view)
router.get('/users/:userId/looks', authenticateOptional, controller.getUserPublicLooks);

// Get user's liked looks (Protected - private to user)
router.get('/users/:userId/liked', authenticateUser, controller.getUserLikedLooks);

// Follow/Unfollow (Protected)
router.post('/users/:userId/follow', authenticateUser, writeRateLimiter, controller.toggleFollow);

// Get followers/following (Public)
router.get('/users/:userId/followers', authenticateOptional, controller.getFollowers);
router.get('/users/:userId/following', authenticateOptional, controller.getFollowing);

// Leaderboard (Public)
router.get('/leaderboard', authenticateOptional, controller.getLeaderboard);

export default router;
