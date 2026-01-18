import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

/**
 * Middleware: Validate request data using Zod
 * 
 * @param schema Zod schema to validate against
 */
export const validate = (schema: z.ZodObject<any, any>) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        await schema.parseAsync({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        next();
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: error.issues.map((e: z.ZodIssue) => ({
                    path: e.path.join('.'),
                    message: e.message
                }))
            });
        }
        next(error);
    }
};
