import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import { asyncHandler, AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { normalizePhone } from '../services/whatsapp.js';

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

// Additive student login for the website chat. Credentials are checked against
// the existing students table; no student identity is accepted by /api/chat.
authRouter.post('/student-login', asyncHandler(async (req, res) => {
  const input = z.object({ student_id: z.coerce.number().int().positive(), whatsapp_number: z.string().min(10) }).parse(req.body);
  const phone = normalizePhone(input.whatsapp_number);
  const candidates = phone.startsWith('91') && phone.length === 12 ? [phone, phone.slice(2)] : [phone];
  const { data, error } = await supabase.from('students').select('student_id,full_name,whatsapp_number').eq('student_id', input.student_id).in('whatsapp_number', candidates).maybeSingle();
  if (error) {
    logger.error({ message: error.message, code: error.code, details: error.details, hint: error.hint }, 'Student authentication Supabase lookup failed');
    throw new AppError(503, 'Student authentication is temporarily unavailable');
  }
  if (!data) throw new AppError(401, 'Student ID or WhatsApp number is incorrect');
  const token = jwt.sign({ role: 'student', student_id: data.student_id }, config.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { student_id: data.student_id, name: data.full_name } });
}));
