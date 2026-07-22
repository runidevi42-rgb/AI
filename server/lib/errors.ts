import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

export class AppError extends Error {
  constructor(public status: number, message: string, public code = 'APP_ERROR') {
    super(message);
  }
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => void fn(req, res, next).catch(next);
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) return res.status(400).json({ error: 'Invalid request', details: error.flatten() });
  const status = error instanceof AppError ? error.status : 500;
  const message = error instanceof Error ? error.message : 'Unexpected error';
  logger.error({ err: error, path: req.path }, 'Request failed');
  return res.status(status).json({ error: status === 500 ? 'Something went wrong' : message });
}
