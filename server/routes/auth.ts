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

const handleAdminLogin = asyncHandler(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const emailMatch = email.toLowerCase() === config.ADMIN_EMAIL.toLowerCase();
  const passwordMatch = config.ADMIN_PASSWORD.startsWith('$2')
    ? await bcrypt.compare(password, config.ADMIN_PASSWORD)
    : password === config.ADMIN_PASSWORD;
  if (!emailMatch || !passwordMatch) throw new AppError(401, 'Incorrect email or password');
  const token = jwt.sign({ email, role: 'admin' }, config.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { email, name: 'College Administrator', role: 'admin' } });
});

authRouter.post('/login', handleAdminLogin);
authRouter.post('/admin-login', handleAdminLogin);

authRouter.get('/me', (req, res) => res.json({ ok: true }));

// Student authentication for the website chatbot. Credentials are verified against
// the students table in Supabase; JWT carries verified identity.
authRouter.post('/student-login', asyncHandler(async (req, res) => {
  const input = z.object({
    student_id: z.union([z.string().min(1), z.number()]).transform((v) => String(v).trim()),
    whatsapp_number: z.string().optional(),
    phone_number: z.string().optional(),
  }).refine((data) => Boolean(data.whatsapp_number || data.phone_number), {
    message: 'Registered phone number is required',
  }).parse(req.body);

  const rawPhone = (input.whatsapp_number || input.phone_number || '').trim();
  const phone = normalizePhone(rawPhone);
  const candidates = phone.startsWith('91') && phone.length === 12 ? [phone, phone.slice(2)] : [phone];

  let query = supabase
    .from('students')
    .select('student_id,full_name,whatsapp_number,department,course,semester')
    .eq('student_id', input.student_id)
    .in('whatsapp_number', candidates);

  let { data, error } = await query.maybeSingle();

  // If not found and input.student_id is all digits, also try matching with numeric representation
  if (!data && /^\d+$/.test(input.student_id)) {
    const numId = Number(input.student_id);
    const retry = await supabase
      .from('students')
      .select('student_id,full_name,whatsapp_number,department,course,semester')
      .eq('student_id', numId)
      .in('whatsapp_number', candidates)
      .maybeSingle();
    if (!retry.error && retry.data) {
      data = retry.data;
      error = null;
    }
  }

  if (error) {
    logger.error({ message: error.message, code: error.code, details: error.details, hint: error.hint }, 'Student authentication Supabase lookup failed');
    throw new AppError(503, 'Student authentication is temporarily unavailable');
  }

  if (!data) {
    throw new AppError(401, 'Student ID or registered phone number is incorrect. Please verify your credentials.');
  }

  const token = jwt.sign({ role: 'student', student_id: data.student_id }, config.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { student_id: data.student_id, name: data.full_name, role: 'student' } });
}));

