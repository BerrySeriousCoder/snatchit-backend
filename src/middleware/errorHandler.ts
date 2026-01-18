import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Global Error Handling Middleware
 * 
 * Catches all unhandled errors and returns a standardized JSON response.
 */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    // Log the error with request context
    logger.error({
        method: req.method,
        url: req.url,
        status,
        message,
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    }, 'Unhandled Error');

    res.status(status).json({
        success: false,
        error: message,
        code: err.code || 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
}
