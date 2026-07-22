import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

export interface AuthRequest extends Request { admin?: { email: string } }

export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next(new AppError(401, 'Authentication required'));
  try {
    req.admin = jwt.verify(token, config.JWT_SECRET) as { email: string };
    next();
  } catch {
    next(new AppError(401, 'Session expired or invalid'));
  }
}
