import { Router } from 'express';
import { asyncHandler, AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { requireStudent, type AuthRequest } from '../middleware/auth.js';
import { findStudentById, getStudentTimetable } from '../services/knowledge.js';

export const studentRouter = Router();

// Student-private endpoints enforce student JWT authorization
studentRouter.use(requireStudent);

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

  const overallPercentage = totals.total ? Math.round((totals.present / totals.total) * 100) : null;

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
