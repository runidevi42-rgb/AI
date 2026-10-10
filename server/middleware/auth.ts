import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

export interface AuthRequest extends Request {
  admin?: { email: string };
  student?: { student_id: string | number; email?: string };
}

export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next(new AppError(401, 'Authentication required'));
  try {
    const claims = jwt.verify(token, config.JWT_SECRET) as { email?: string; role?: string };
    if (claims.role !== 'admin' || !claims.email) {
      return next(new AppError(403, 'Administrator access required'));
    }
    req.admin = { email: claims.email };
    next();
  } catch {
    next(new AppError(401, 'Session expired or invalid'));
  }
}

export function requireStudent(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next(new AppError(401, 'Authentication required'));
  try {
    const claims = jwt.verify(token, config.JWT_SECRET) as { role?: string; student_id?: string | number; email?: string };
    const rawId = claims.student_id;
    const isValidId = (typeof rawId === 'string' && rawId.trim().length > 0) || (typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId > 0);
    if (claims.role !== 'student' || !isValidId) {
      throw new Error('Not a valid student session');
    }
    req.student = { student_id: rawId, email: claims.email };
    next();
  } catch {
    next(new AppError(401, 'Student session expired or invalid'));
  }
}

