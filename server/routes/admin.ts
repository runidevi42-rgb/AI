import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { asyncHandler, AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { requireAdmin } from '../middleware/auth.js';
import { dispatchNotification, notifyTimetableChange } from '../services/notifications.js';
import { timetableSchema, validatedPayload } from './admin-validation.js';
import { interpretAdminPrompt } from '../services/admin-prompt.js';
import { attendanceEntrySchema } from '../services/attendance-entry.js';
import { matchAttendanceRows, type ImportRow } from '../services/attendance-import.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(20), auth: z.string().min(8) }),
});

adminRouter.get('/messaging/config', (_req, res) => res.json({
  webPushPublicKey: config.WEB_PUSH_VAPID_PUBLIC_KEY || null,
  whatsappTemplateLanguage: config.WHATSAPP_TEMPLATE_LANGUAGE,
  notificationTemplateConfigured: Boolean(config.WHATSAPP_NOTIFICATION_TEMPLATE),
}));

adminRouter.post('/students/:studentId/web-push-subscriptions', asyncHandler(async (req, res) => {
  const studentId = z.coerce.number().int().positive().parse(req.params.studentId);
  const subscription = pushSubscriptionSchema.parse(req.body);
  const { data, error } = await supabase.from('web_push_subscriptions').upsert({
    student_id: studentId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' }).select('id,student_id,active,created_at,updated_at').single();
  if (error) throw new AppError(400, error.message);
  res.status(201).json(data);
}));

adminRouter.delete('/web-push-subscriptions/:id', asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { error } = await supabase.from('web_push_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new AppError(400, error.message);
  res.sendStatus(204);
}));

const resources = new Set(['students','timetables','assignments','exams','attendance','faculty','notices','events','emergency_contacts','college_info','faqs','notifications']);
const resource = (value: string) => {
  if (!resources.has(value)) throw new AppError(404, 'Unknown resource');
  return value;
};

adminRouter.get('/dashboard', asyncHandler(async (_req, res) => {
  const now = new Date().toISOString();
  const [students, assignments, exams, notices, logs, activity] = await Promise.all([
    supabase.from('students').select('student_id', { count: 'exact', head: true }),
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

const timetableColumns = 'id,day_of_week,start_time,end_time,subject,teacher,batch_group,is_recess';
const timetableTime = (value: string) => value.length === 5 ? `${value}:00` : value;

adminRouter.get('/timetables', asyncHandler(async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const day = String(req.query.day ?? '').trim();
  const batch = String(req.query.batch_group ?? '').trim();
  let query = supabase.from('timetables').select(timetableColumns, { count: 'exact' });
  if (day) query = query.eq('day_of_week', day);
  if (batch) query = query.eq('batch_group', batch);
  if (search) query = query.or(`subject.ilike.%${search.replace(/[%(),]/g, '')}%,teacher.ilike.%${search.replace(/[%(),]/g, '')}%,batch_group.ilike.%${search.replace(/[%(),]/g, '')}%`);
  const { data, error, count } = await query.order('day_of_week').order('start_time');
  if (error) throw new AppError(500, 'Unable to load timetables');
  res.json({ data: data ?? [], total: count ?? 0, page: 1, pageSize: data?.length ?? 0 });
}));

async function ensureTimetableNoConflict(payload: Record<string, unknown>, id?: string) {
  const batch = payload.batch_group as string | null;
  if (!batch) return;
  let query = supabase.from('timetables').select('id,subject,start_time,end_time').eq('day_of_week', payload.day_of_week).eq('batch_group', batch)
    .lt('start_time', timetableTime(String(payload.end_time))).gt('end_time', timetableTime(String(payload.start_time)));
  if (id) query = query.neq('id', id);
  const { data, error } = await query.limit(1);
  if (error) throw new AppError(400, 'Unable to check timetable conflicts');
  if (data?.length) throw new AppError(409, `This entry overlaps with ${data[0].subject || 'another class'} for batch ${batch}.`);
}

adminRouter.post('/timetables', asyncHandler(async (req, res) => {
  const payload = timetableSchema.parse(req.body);
  await ensureTimetableNoConflict(payload);
  const { data, error } = await supabase.from('timetables').insert(payload).select(timetableColumns).single();
  if (error) throw new AppError(400, error.message);
  res.status(201).json(data);
}));

adminRouter.put('/timetables/:id', asyncHandler(async (req, res) => {
  const payload = timetableSchema.parse(req.body);
  await ensureTimetableNoConflict(payload, String(req.params.id));
  const { data, error } = await supabase.from('timetables').update(payload).eq('id', req.params.id).select(timetableColumns).single();
  if (error) throw new AppError(400, error.message);
  res.json(data);
}));

adminRouter.delete('/timetables/:id', asyncHandler(async (req, res) => {
  const { error } = await supabase.from('timetables').delete().eq('id', req.params.id);
  if (error) throw new AppError(400, error.message);
  res.sendStatus(204);
}));

// Natural-language prompt interpretation for AI data management
adminRouter.post('/interpret-prompt', asyncHandler(async (req, res) => {
  const { prompt } = z.object({
    prompt: z.string().trim().min(2, 'Please enter a prompt of at least 2 characters'),
  }).parse(req.body);

  const result = await interpretAdminPrompt(prompt);
  res.json(result);
}));

// Apply reviewed and confirmed changes to Supabase
adminRouter.post('/confirm-changes', asyncHandler(async (req, res) => {
  const input = z.object({
    action: z.enum(['insert', 'update', 'delete']),
    target_resource: z.string().trim(),
    target_id: z.union([z.string(), z.number()]).optional(),
    record: z.record(z.string(), z.unknown()).default({}),
  }).parse(req.body);

  const table = resource(input.target_resource);
  const primaryKey = table === 'students' ? 'student_id' : 'id';

  if (input.action === 'delete') {
    if (!input.target_id) throw new AppError(400, 'Target record ID is required for deletion');
    const { error } = await supabase.from(table).delete().eq(primaryKey, input.target_id);
    if (error) throw new AppError(400, error.message);
    return res.json({ success: true, message: `Record deleted successfully from ${table}`, action: 'delete' });
  }

  // insert or update
  const payload = validatedPayload(table, input.record);

  if (input.action === 'insert') {
    if (table === 'timetables') {
      await ensureTimetableNoConflict(payload);
    }
    const { data, error } = await supabase.from(table).insert(payload).select().single();
    if (error) throw new AppError(400, error.message);
    if (table === 'timetables') void notifyTimetableChange(data).catch((err) => logger.error({ err }, 'Timetable notification failed'));
    return res.status(201).json({ success: true, message: `Record created successfully in ${table}`, data, action: 'insert' });
  }

  if (input.action === 'update') {
    if (!input.target_id) throw new AppError(400, 'Target record ID is required to update an existing record');
    if (table === 'timetables') {
      await ensureTimetableNoConflict(payload, String(input.target_id));
    }
    const updateBody = { ...payload } as Record<string, unknown>;
    delete updateBody.id;
    delete updateBody.created_at;
    const { data, error } = await supabase.from(table).update({ ...updateBody, updated_at: new Date().toISOString() }).eq(primaryKey, input.target_id).select().single();
    if (error) throw new AppError(400, error.message);
    if (table === 'timetables') void notifyTimetableChange(data).catch((err) => logger.error({ err }, 'Timetable notification failed'));
    return res.json({ success: true, message: `Record updated successfully in ${table}`, data, action: 'update' });
  }
}));


const importRowsSchema = z.object({ rows: z.array(z.object({ student_id: z.string().max(100), student_name: z.string().max(200), attendance_percentage: z.string().max(30) })).min(1).max(1000) });
async function checkImport(rows: ImportRow[]) {
  const ids = [...new Set(rows.map((row) => row.student_id.trim()).filter((id) => /^[1-9]\d*$/.test(id) && BigInt(id) <= BigInt(Number.MAX_SAFE_INTEGER)))];
  const students: { student_id: number; full_name: string }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const result = await supabase.from('students').select('student_id,full_name').in('student_id', ids.slice(i, i + 100));
    if (result.error) throw result.error;
    students.push(...(result.data ?? []));
  }
  return matchAttendanceRows(rows, students);
}
adminRouter.post('/attendance/import/preview', asyncHandler(async (req, res) => res.json(await checkImport(importRowsSchema.parse(req.body).rows))));
adminRouter.post('/attendance/import/confirm', asyncHandler(async (req, res) => {
  const result = await checkImport(importRowsSchema.parse(req.body).rows);
  if (result.accepted.length) {
    const records = result.accepted.map((row) => ({ student_id: row.student_id.trim(), attendance_percentage: Number(row.attendance_percentage.trim().replace(/%$/, '')), updated_at: new Date().toISOString() }));
    const saved = await supabase.from('attendance_percentages').upsert(records, { onConflict: 'student_id' });
    if (saved.error) throw saved.error;
  }
  return res.json({ saved: result.accepted.length, skipped: result.skipped });
}));

adminRouter.get('/attendance', asyncHandler(async (req, res) => {
  const { page, pageSize, search } = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), search: z.string().default('') }).parse(req.query);
  let query = supabase.from('attendance_percentages').select('id,student_id,attendance_percentage,students!inner(full_name)', { count: 'exact' });
  if (search.trim()) query = query.ilike('students.full_name', `%${search.trim().replace(/[%(),]/g, '')}%`);
  const { data, error, count } = await query.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return res.json({ data: (data ?? []).map((row: any) => ({ ...row, student_name: row.students?.full_name })), total: count ?? 0, page, pageSize });
}));

async function saveAttendance(input: unknown, id?: string) {
  const parsed = attendanceEntrySchema.safeParse(input);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid attendance entry');
  const entry = parsed.data;
  const student = await supabase.from('students').select('student_id,full_name').eq('student_id', entry.student_id).maybeSingle();
  if (student.error) throw student.error;
  if (!student.data) throw new AppError(400, 'Student ID was not found. Check the complete ID from your PDF.');
  if (student.data.full_name.trim().toLowerCase() !== entry.student_name.trim().toLowerCase()) throw new AppError(400, 'Student name does not match the registered name for this ID.');
  const payload = { student_id: entry.student_id, attendance_percentage: entry.attendance_percentage, updated_at: new Date().toISOString() };
  const result = id ? await supabase.from('attendance_percentages').update(payload).eq('id', id).select().single() : await supabase.from('attendance_percentages').insert(payload).select().single();
  if (result.error?.code === '23505') throw new AppError(409, 'An attendance record already exists for this student. Edit the existing record.');
  if (result.error) throw result.error;
  return result.data;
}
adminRouter.post('/attendance', asyncHandler(async (req, res) => res.status(201).json(await saveAttendance(req.body))));
adminRouter.put('/attendance/:id', asyncHandler(async (req, res) => res.json(await saveAttendance(req.body, String(req.params.id)))));
adminRouter.delete('/attendance/:id', asyncHandler(async (req, res) => {
  const { error } = await supabase.from('attendance_percentages').delete().eq('id', req.params.id);
  if (error) throw error;
  return res.sendStatus(204);
}));

adminRouter.get('/:resource', asyncHandler(async (req, res) => {
  const table = resource(String(req.params.resource));
  const { page, pageSize, search } = z.object({ page: z.coerce.number().min(1).default(1), pageSize: z.coerce.number().min(1).max(100).default(20), search: z.string().optional() }).parse(req.query);
  const isStudents = table === 'students';
  const selectedColumns: Record<string, string> = {
    students: 'student_id,full_name,whatsapp_number,roll_number,department,course,semester,active,whatsapp_opt_in,web_push_opt_in',
    assignments: 'id,title,subject,description,department,semester,due_at,created_at,updated_at',
    exams: 'id,title,subject,department,semester,exam_date,start_time,end_time,instructions,created_at,updated_at',
    college_info: 'id,title,content,category,created_at,updated_at',
    emergency_contacts: 'id,contact_name,phone_number,role_or_service,emergency_type,description,priority,active,contact_type,created_at,updated_at',
  };
  const columns = selectedColumns[table] ?? '*';
  let query = supabase.from(table).select(columns, { count: 'exact' });
  const normalizedSearch = search?.trim().replace(/[%(),]/g, '') ?? '';

  if (normalizedSearch) {
    const fields: Record<string, string[]> = { students: ['student_id','full_name','whatsapp_number','department','course'], timetables: ['subject','department','section','day_of_week','room'], attendance: ['subject','status'], faculty: ['full_name','department'], notices: ['title','content'], assignments: ['title','subject','department'], exams: ['title','subject','department'], events: ['title','venue'], emergency_contacts: ['contact_name','phone_number','role_or_service','emergency_type'], college_info: ['title','content','category'], faqs: ['question','answer','category'] };
    const list = fields[table];
    if (list) query = query.or(list.map((field) => `${field}.ilike.%${normalizedSearch}%`).join(','));
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const orderedQuery = isStudents
    ? query.order('student_id', { ascending: true })
    : table === 'emergency_contacts'
      ? query.order('priority', { ascending: true })
      : query.order('created_at', { ascending: false });
  const { data, error, count } = await orderedQuery.range(from, to);

  if (error) {
    logger.error({
      table,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    }, 'Supabase list query failed');
    return res.status(500).json({
      error: `Unable to load ${table}`,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
  }

  return res.json({ data: data ?? [], total: count ?? 0, page, pageSize });
}));

adminRouter.post('/:resource', asyncHandler(async (req, res) => {
  const table = resource(String(req.params.resource));

  let payload = validatedPayload(table, req.body);

  if (table === 'students') {
    const {
      student_id,
      full_name,
      whatsapp_number,
      roll_number,
      department,
      course,
      semester,
      active,
      whatsapp_opt_in,
      web_push_opt_in,
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

    const normalizedStudentId = Number(student_id);
    const normalizedRollNumber = Number(roll_number);
    const normalizedSemester = Number(semester);

    payload = {
      student_id: normalizedStudentId,
      full_name: String(full_name).trim(),
      whatsapp_number: String(whatsapp_number).replace(/\D/g, ''),
      roll_number: normalizedRollNumber,
      department: String(department).trim(),
      course: String(course).trim(),
      semester: normalizedSemester,
      active: active === undefined ? true : Boolean(active),
      whatsapp_opt_in: Boolean(whatsapp_opt_in),
      web_push_opt_in: Boolean(web_push_opt_in),
    };

    if (
      !Number.isInteger(normalizedStudentId) ||
      !Number.isSafeInteger(normalizedStudentId) ||
      normalizedStudentId <= 0 ||
      !Number.isInteger(normalizedRollNumber) ||
      !Number.isInteger(normalizedSemester)
    ) {
      return res.status(400).json({
        error: 'student_id, roll_number and semester must be valid whole numbers',
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

  if (table === 'timetables') void notifyTimetableChange(data).catch((err) => logger.error({ err }, 'Timetable update notification failed'));

  return res.status(201).json(data);
}));

adminRouter.put('/:resource/:id', asyncHandler(async (req, res) => {
  const table = resource(String(req.params.resource));
  const primaryKey = table === 'students' ? 'student_id' : 'id';
  const changes = { ...validatedPayload(table, req.body) } as Record<string, unknown>;
  delete changes.id;
  delete changes.created_at;
  delete changes.updated_at;
  const payload = table === 'students' ? changes : { ...changes, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from(table).update(payload).eq(primaryKey, req.params.id).select().single();
  if (error) throw new AppError(400, error.message);
  if (table === 'timetables') void notifyTimetableChange(data).catch((err) => logger.error({ err }, 'Timetable update notification failed'));
  res.json(data);
}));

adminRouter.delete('/:resource/:id', asyncHandler(async (req, res) => {
  const table = resource(String(req.params.resource));
  const primaryKey = table === 'students' ? 'student_id' : 'id';
  const { error } = await supabase.from(table).delete().eq(primaryKey, req.params.id);
  if (error) throw new AppError(400, error.message);
  res.sendStatus(204);
}));

adminRouter.post('/notifications/:id/send', asyncHandler(async (req, res) => res.json(await dispatchNotification(String(req.params.id)))));
