import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/errors.js';
import { requireStudent, type AuthRequest } from '../middleware/auth.js';
import { answerStudentProfile, getWebConversation, getWebSessionId } from '../services/assistant.js';
import { findStudentById } from '../services/knowledge.js';

export const chatRouter = Router();
chatRouter.use(requireStudent);

chatRouter.get('/history', asyncHandler(async (req, res) => {
  const auth = req as AuthRequest;
  try {
    res.json(await getWebConversation(auth.student!.student_id));
  } catch {
    res.status(503).json({ error: 'The college database is temporarily unavailable. Please try again later.' });
  }
}));

chatRouter.post('/', asyncHandler(async (req, res) => {
  const { message } = z.object({ message: z.string().trim().min(1).max(2000) }).parse(req.body);
  const auth = req as AuthRequest;
  let student;
  try { student = await findStudentById(auth.student!.student_id); }
  catch { return res.status(503).json({ error: 'The college database is temporarily unavailable. Please try again later.' }); }
  if (!student) return res.status(401).json({ error: 'Student session is no longer valid' });
  const reply = await answerStudentProfile(student, message, getWebSessionId(student.student_id));
  res.json({ reply: reply.text, intent: reply.intent });
}));
