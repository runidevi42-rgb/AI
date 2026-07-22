import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import { asyncHandler, AppError } from '../lib/errors.js';

export const authRouter = Router();

authRouter.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const emailMatch = email.toLowerCase() === config.ADMIN_EMAIL.toLowerCase();
  const passwordMatch = config.ADMIN_PASSWORD.startsWith('$2')
    ? await bcrypt.compare(password, config.ADMIN_PASSWORD)
    : password === config.ADMIN_PASSWORD;
  if (!emailMatch || !passwordMatch) throw new AppError(401, 'Incorrect email or password');
  const token = jwt.sign({ email, role: 'admin' }, config.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { email, name: 'College Administrator' } });
}));

authRouter.get('/me', (req, res) => res.json({ ok: true }));
