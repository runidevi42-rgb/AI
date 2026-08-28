import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

export interface AuthRequest extends Request { admin?: { email: string }; student?: { student_id: number; email?: string } }

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

export function requireStudent(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next(new AppError(401, 'Authentication required'));
  try {
    const claims = jwt.verify(token, config.JWT_SECRET) as { role?: string; student_id?: number; email?: string };
    if (claims.role !== 'student' || !Number.isSafeInteger(claims.student_id) || Number(claims.student_id) <= 0) throw new Error('Not a student session');
    req.student = { student_id: Number(claims.student_id), email: claims.email };
    next();
  } catch {
    next(new AppError(401, 'Student session expired or invalid'));
  }
}
