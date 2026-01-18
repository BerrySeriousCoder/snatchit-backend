/**
 * Server Entry Point
 * 
 * This file starts the Express server.
 * All app configuration is in app.ts.
 */

import app from './app';
import { logger } from './utils/logger';
import { authorize as authorizeB2 } from './storage';

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Authorize B2/R2 storage
        await authorizeB2();
        logger.info('Storage authorized');

        // Start listening
        app.listen(PORT, () => {
            logger.info({ port: PORT }, `🚀 Server is running on port ${PORT}`);
        });
    } catch (error) {
        logger.error({ error }, 'Failed to start server');
        process.exit(1);
    }
}

startServer();
