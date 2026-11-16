import { Router } from 'express';
import { asyncHandler, AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { requireStudent, type AuthRequest } from '../middleware/auth.js';
import { findStudentById, getStudentTimetable } from '../services/knowledge.js';
import { config } from '../config.js';
import { assertWebPushConfigured } from '../services/web-push.js';
import { z } from 'zod';

export const studentRouter = Router();

// Student-private endpoints enforce student JWT authorization
studentRouter.use(requireStudent);

studentRouter.get('/push/config', asyncHandler(async (_req, res) => {
  assertWebPushConfigured();
  res.json({ publicKey: config.WEB_PUSH_VAPID_PUBLIC_KEY });
}));

studentRouter.post('/push/status', asyncHandler(async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().url().max(2048) }).parse(req.body);
  const result = await supabase.from('web_push_subscriptions').select('active').eq('student_id', (req as AuthRequest).student!.student_id).eq('endpoint', endpoint).maybeSingle();
  if (result.error) throw result.error;
  res.json({ enabled: Boolean(result.data?.active) });
}));

studentRouter.post('/push/subscription', asyncHandler(async (req, res) => {
  const studentId = (req as AuthRequest).student!.student_id;
  if (!await findStudentById(studentId)) throw new AppError(401, 'Student session is no longer valid');
  assertWebPushConfigured();
  const subscription = z.object({ endpoint: z.string().url().max(2048), keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }) }).parse(req.body);
  const existing = await supabase.from('web_push_subscriptions').select('student_id').eq('endpoint', subscription.endpoint).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data && String(existing.data.student_id) !== String(studentId)) throw new AppError(409, 'This browser subscription belongs to another student.');
  const result = await supabase.from('web_push_subscriptions').upsert({ student_id: studentId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, active: true, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' });
  if (result.error) throw result.error;
  const consent = await supabase.from('students').update({ web_push_opt_in: true }).eq('student_id', studentId);
  if (consent.error) throw consent.error;
  res.json({ enabled: true });
}));

studentRouter.post('/push/unsubscribe', asyncHandler(async (req, res) => {
  const studentId = (req as AuthRequest).student!.student_id;
  const { endpoint } = z.object({ endpoint: z.string().url().max(2048) }).parse(req.body);
  const result = await supabase.from('web_push_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('student_id', studentId).eq('endpoint', endpoint);
  if (result.error) throw result.error;
  res.json({ enabled: false });
}));

studentRouter.get('/profile', asyncHandler(async (req, res) => {
  const auth = req as AuthRequest;
  const student = await findStudentById(auth.student!.student_id);
  if (!student) throw new AppError(401, 'Student session is no longer valid');
  res.json({
    profile: {
      student_id: student.student_id,
      full_name: student.full_name,
      roll_number: student.roll_number,
      department: student.department,
      course: student.course,
      semester: student.semester,
      whatsapp_number: student.whatsapp_number,
      section: student.section ?? null,
      batch_group: student.batch_group ?? null,
    },
  });
}));

studentRouter.get('/attendance', asyncHandler(async (req, res) => {
  const auth = req as AuthRequest;
  const student = await findStudentById(auth.student!.student_id);
  if (!student) throw new AppError(401, 'Student session is no longer valid');

  const { data, error } = await supabase
    .from('attendance_summary')
    .select('subject,total_classes,present_classes,percentage')
    .eq('student_id', student.student_id)
    .order('subject');

  if (error) {
    logger.warn({ error: error.message }, 'Failed to fetch attendance summary');
    return res.json({ attendance: [], overallPercentage: null });
  }

  const records = data ?? [];
  const totals = records.reduce((acc, r) => ({
    present: acc.present + Number(r.present_classes || 0),
    total: acc.total + Number(r.total_classes || 0),
  }), { present: 0, total: 0 });

  const manual = await supabase.from('attendance_percentages').select('attendance_percentage').eq('student_id', student.student_id).maybeSingle();
  if (manual.error && !['PGRST205', '42P01'].includes(manual.error.code ?? '')) throw manual.error;
  const overallPercentage = manual.data ? Number(manual.data.attendance_percentage) : totals.total ? Math.round((totals.present / totals.total) * 100) : null;

  res.json({
    attendance: records,
    overallPercentage,
  });
}));

studentRouter.get('/timetable', asyncHandler(async (req, res) => {
  const auth = req as AuthRequest;
  const student = await findStudentById(auth.student!.student_id);
  if (!student) throw new AppError(401, 'Student session is no longer valid');

  const rows = await getStudentTimetable(student);
  res.json({
    timetable: rows.map((row: any) => ({
      day_of_week: row.day_of_week,
      start_time: row.start_time,
      end_time: row.end_time,
      subject: row.subject,
      teacher: row.teacher ?? null,
      batch_group: row.batch_group ?? null,
      room: row.room ?? null,
    })),
  });
}));
