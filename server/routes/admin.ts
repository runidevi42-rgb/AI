import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../lib/errors.js';
import { supabase } from '../lib/supabase.js';
import { requireAdmin } from '../middleware/auth.js';
import { dispatchNotification } from '../services/notifications.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const resources = new Set(['students','timetables','assignments','exams','attendance','faculty','notices','events','study_materials','emergency_contacts','college_info','faqs','notifications']);
const resource = (value: string) => {
  if (!resources.has(value)) throw new AppError(404, 'Unknown resource');
  return value;
};

adminRouter.get('/dashboard', asyncHandler(async (_req, res) => {
  const now = new Date().toISOString();
  const [students, assignments, exams, notices, logs, activity] = await Promise.all([
    supabase.from('students').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('assignments').select('*', { count: 'exact', head: true }).gte('due_at', now),
    supabase.from('exams').select('*', { count: 'exact', head: true }).gte('exam_date', now.slice(0, 10)),
    supabase.from('notices').select('*', { count: 'exact', head: true }).or(`expires_at.is.null,expires_at.gte.${now}`),
    supabase.from('message_logs').select('status').eq('direction', 'outbound').limit(1000),
    supabase.from('notifications').select('id,title,status,created_at').order('created_at', { ascending: false }).limit(7),
  ]);
  const sentLogs = logs.data ?? [];
  const delivered = sentLogs.filter((l) => ['sent', 'delivered', 'read'].includes(l.status)).length;
  res.json({ students: students.count ?? 0, activeAssignments: assignments.count ?? 0, upcomingExams: exams.count ?? 0, unreadNotices: notices.count ?? 0, deliveryRate: sentLogs.length ? Math.round(delivered / sentLogs.length * 100) : 100, recentActivity: activity.data ?? [] });
}));

adminRouter.get('/:resource', asyncHandler(async (req, res) => {
  const table = resource(String(req.params.resource));
  const { page, pageSize, search } = z.object({ page: z.coerce.number().min(1).default(1), pageSize: z.coerce.number().min(1).max(100).default(20), search: z.string().optional() }).parse(req.query);
  let query = supabase.from(table).select('*', { count: 'exact' });
  if (search) {
    const fields: Record<string, string[]> = { students: ['full_name','roll_number','phone'], faculty: ['full_name','department'], notices: ['title','content'], assignments: ['title','subject'], exams: ['title','subject'], events: ['title','venue'], study_materials: ['title','subject'], emergency_contacts: ['name','role'] };
    const list = fields[table];
    if (list) query = query.or(list.map((f) => `${f}.ilike.%${search.replace(/[%(),]/g, '')}%`).join(','));
  }
  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw error;
  res.json({ data, count: count ?? 0, page, pageSize });
}));

adminRouter.post('/:resource', asyncHandler(async (req, res) => {
  const table = resource(String(req.params.resource));

  let payload = req.body;

  if (table === 'students') {
    const {
      student_id,
      full_name,
      whatsapp_number,
      roll_number,
      department,
      course,
      semester,
    } = req.body;

    if (
      !student_id ||
      !full_name ||
      !whatsapp_number ||
      !roll_number ||
      !department ||
      !course ||
      !semester
    ) {
      return res.status(400).json({
        error: 'Missing required student fields',
        requiredFields: [
          'student_id',
          'full_name',
          'whatsapp_number',
          'roll_number',
          'department',
          'course',
          'semester',
        ],
      });
    }

    payload = {
      student_id: String(student_id).trim(),
      full_name: String(full_name).trim(),
      whatsapp_number: String(whatsapp_number).replace(/\D/g, ''),
      roll_number: Number(roll_number),
      department: String(department).trim(),
      course: String(course).trim(),
      semester: Number(semester),
    };

    if (
      !Number.isInteger(payload.roll_number) ||
      !Number.isInteger(payload.semester)
    ) {
      return res.status(400).json({
        error: 'roll_number and semester must be whole numbers',
      });
    }
  }

  const { data, error } = await supabase
    .from(table)
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error(`Insert error for ${table}:`, error);

    return res.status(500).json({
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
  }

  return res.status(201).json(data);
}));

adminRouter.put('/:resource/:id', asyncHandler(async (req, res) => {
  const table = resource(String(req.params.resource));
  const changes = { ...req.body };
  delete changes.id;
  delete changes.created_at;
  delete changes.updated_at;
  const { data, error } = await supabase.from(table).update({ ...changes, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
  if (error) throw new AppError(400, error.message);
  res.json(data);
}));

adminRouter.delete('/:resource/:id', asyncHandler(async (req, res) => {
  const table = resource(String(req.params.resource));
  const { error } = await supabase.from(table).delete().eq('id', req.params.id);
  if (error) throw new AppError(400, error.message);
  res.sendStatus(204);
}));

adminRouter.post('/notifications/:id/send', asyncHandler(async (req, res) => res.json(await dispatchNotification(String(req.params.id)))));
