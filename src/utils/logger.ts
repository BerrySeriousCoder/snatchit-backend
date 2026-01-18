import pino from 'pino';

/**
 * Structured Logger using Pino
 * 
 * In development, it uses pino-pretty for readable console output.
 * In production, it outputs raw JSON for easy ingestion by log management systems.
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
            },
        }
        : undefined,
});

export default logger;
