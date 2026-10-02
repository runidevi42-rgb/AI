import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { requireStudent, type AuthRequest } from '../middleware/auth.js';
import { answerStudentProfile, getWebConversation, getWebSessionId } from '../services/assistant.js';
import { findStudentById, getStudentTimetable } from '../services/knowledge.js';

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

chatRouter.get('/timetable', asyncHandler(async (req, res) => {
  const auth = req as AuthRequest;
  try {
    const student = await findStudentById(auth.student!.student_id);
    if (!student) return res.status(401).json({ error: 'Student session is no longer valid' });
    const rows = await getStudentTimetable(student);
    res.json({ timetable: rows.map((row: any) => ({
      day_of_week: row.day_of_week,
      start_time: row.start_time,
      end_time: row.end_time,
      subject: row.subject,
      teacher: row.teacher ?? null,
      batch_group: row.batch_group ?? null,
      room: row.room ?? null,
    })) });
  } catch (error) {
    logger.error({ err: error, studentId: auth.student!.student_id }, 'Student timetable request failed');
    res.status(503).json({ error: 'The college database is temporarily unavailable. Please try again later.' });
  }
}));

chatRouter.post('/', asyncHandler(async (req, res) => {
  const { message } = z.object({ message: z.string().trim().min(1).max(2000) }).parse(req.body);
  const auth = req as AuthRequest;
  let student;
  try { student = await findStudentById(auth.student!.student_id); }
  catch (error) {
    logger.error({ err: error, studentId: auth.student!.student_id }, 'Authenticated chat student lookup failed');
    return res.status(503).json({ error: 'The college database is temporarily unavailable. Please try again later.' });
  }
  if (!student) return res.status(401).json({ error: 'Student session is no longer valid' });
  const reply = await answerStudentProfile(student, message, getWebSessionId(student.student_id));
  res.json({ reply: reply.text, intent: reply.intent });
}));
