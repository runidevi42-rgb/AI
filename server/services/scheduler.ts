import cron from 'node-cron';
import { config } from '../config.js';
import { settleInBatches } from '../lib/batch.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { dispatchNotification } from './notifications.js';
import { resolveTemplate, type WhatsAppTemplateKind } from './templates.js';
import { sendTemplate } from './whatsapp.js';
import { collegeDateBounds, formatCollegeTime } from '../utils/college-time.js';
import { getTodayTimetable } from './knowledge.js';

type DateParts = { date: string; day: string };
type ReminderStudent = { student_id: number; full_name?: string; whatsapp_number: string };

export function collegeDateParts(value = new Date()): DateParts {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.COLLEGE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => dateParts.find((item) => item.type === type)?.value ?? '';
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  const day = new Intl.DateTimeFormat('en-US', { timeZone: config.COLLEGE_TIMEZONE, weekday: 'long' }).format(value);
  return { date, day };
}

export function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function displayDate(date: string) {
  return new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: config.COLLEGE_TIMEZONE, dateStyle: 'medium' });
}

function displayDateTime(value: string) {
  return new Date(value).toLocaleString('en-IN', { timeZone: config.COLLEGE_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' });
}

export async function runClaimedOnce(task: () => Promise<void>, claim: () => Promise<boolean>, release: () => Promise<void>) {
  if (!await claim()) return false;
  try {
    await task();
    return true;
  } catch (failure) {
    await release();
    throw failure;
  }
}

export async function runScheduledOnce(key: string, task: () => Promise<void>) {
  return runClaimedOnce(task, async () => {
    const { error } = await supabase.from('scheduled_job_runs').insert({ job_key: key, completed_at: new Date().toISOString() });
    if (error?.code === '23505') return false;
    if (error) throw error;
    return true;
  }, async () => {
    await supabase.from('scheduled_job_runs').delete().eq('job_key', key);
  });
}

async function sendReminderBatch(students: ReminderStudent[], kind: WhatsAppTemplateKind, parameters: (student: ReminderStudent) => string[]) {
  if (students.length) resolveTemplate(kind, parameters(students[0]));
  const results = await settleInBatches(students, 10, (student) => sendTemplate(student.whatsapp_number, kind, parameters(student), { studentId: student.student_id }));
  const failures = results.filter((result) => result.status === 'rejected').length;
  if (failures) logger.warn({ kind, failures, total: results.length }, 'Some scheduled WhatsApp messages failed');
}

async function dailySchedules() {
  const { date } = collegeDateParts();
  await runScheduledOnce(`daily-schedule:${date}`, async () => {
    const { data: students, error } = await supabase.from('students').select('student_id,full_name,whatsapp_number,department,semester').match({ active: true, whatsapp_opt_in: true });
    if (error) throw error;
    for (const student of students ?? []) {
      const classes = await getTodayTimetable({ ...student, course: '', roll_number: 0 } as any);
      if (!classes?.length) continue;
      const schedule = classes.map((item) => `${formatCollegeTime(item.start_time)} - ${item.subject}${item.room ? ` (${item.room})` : ' (To be announced)'}`).join('\n');
      await sendReminderBatch([student], 'timetable', (recipient) => [recipient.full_name?.split(' ')[0] ?? 'Student', displayDate(date), schedule]);
    }
  });
}

async function assignmentReminders() {
  const tomorrow = addCalendarDays(collegeDateParts().date, 1);
  const bounds = collegeDateBounds(tomorrow);
  await runScheduledOnce(`assignments:${tomorrow}`, async () => {
    const { data: assignments, error } = await supabase.from('assignments').select('title,subject,department,semester,due_at').gte('due_at', bounds.start).lte('due_at', bounds.end);
    if (error) throw error;
    for (const assignment of assignments ?? []) {
      const { data: students, error: studentError } = await supabase.from('students').select('student_id,whatsapp_number').match({ department: assignment.department, semester: assignment.semester, active: true, whatsapp_opt_in: true });
      if (studentError) throw studentError;
      await sendReminderBatch(students ?? [], 'assignment', () => [assignment.title, assignment.subject, displayDateTime(assignment.due_at)]);
    }
  });
}

async function examReminders() {
  const today = collegeDateParts().date;
  for (const daysAhead of [3, 1]) {
    const examDate = addCalendarDays(today, daysAhead);
    await runScheduledOnce(`exams:${daysAhead}:${examDate}`, async () => {
      const { data: exams, error } = await supabase.from('exams').select('title,subject,department,semester,exam_date,start_time').eq('exam_date', examDate);
      if (error) throw error;
      for (const exam of exams ?? []) {
        const { data: students, error: studentError } = await supabase.from('students').select('student_id,whatsapp_number').match({ department: exam.department, semester: exam.semester, active: true, whatsapp_opt_in: true });
        if (studentError) throw studentError;
        await sendReminderBatch(students ?? [], 'exam', () => [exam.title, exam.subject, displayDate(exam.exam_date), exam.start_time.slice(0, 5)]);
      }
    });
  }
}

async function eventReminders() {
  const tomorrow = addCalendarDays(collegeDateParts().date, 1);
  const bounds = collegeDateBounds(tomorrow);
  await runScheduledOnce(`events:${tomorrow}`, async () => {
    const { data: events, error } = await supabase.from('events').select('title,start_at,venue,department').gte('start_at', bounds.start).lte('start_at', bounds.end);
    if (error) throw error;
    for (const event of events ?? []) {
      let query = supabase.from('students').select('student_id,whatsapp_number').match({ active: true, whatsapp_opt_in: true });
      if (event.department) query = query.eq('department', event.department);
      const { data: students, error: studentError } = await query;
      if (studentError) throw studentError;
      await sendReminderBatch(students ?? [], 'event', () => [event.title, displayDateTime(event.start_at), event.venue ?? 'To be announced']);
    }
  });
}

async function scheduledNotifications() {
  const { data, error } = await supabase.from('notifications').select('id').eq('status', 'scheduled').lte('scheduled_at', new Date().toISOString()).limit(20);
  if (error) throw error;
  await settleInBatches(data ?? [], 3, (item) => runScheduledOnce(`notification:${item.id}`, async () => { await dispatchNotification(item.id); }).then(() => undefined));
}

function guarded(name: string, job: () => Promise<void>) {
  return () => job().catch((err) => logger.error({ err }, `${name} job failed`));
}

export function startScheduler() {
  if (!config.SCHEDULER_ENABLED) return;
  cron.schedule('0 7 * * 1-6', guarded('Daily schedule', dailySchedules), { timezone: config.COLLEGE_TIMEZONE });
  cron.schedule('0 18 * * *', guarded('Assignment reminder', assignmentReminders), { timezone: config.COLLEGE_TIMEZONE });
  cron.schedule('5 8 * * *', guarded('Exam reminder', examReminders), { timezone: config.COLLEGE_TIMEZONE });
  cron.schedule('10 8 * * *', guarded('Event reminder', eventReminders), { timezone: config.COLLEGE_TIMEZONE });
  cron.schedule('* * * * *', guarded('Scheduled notification', scheduledNotifications), { timezone: config.COLLEGE_TIMEZONE });
  logger.info('Automated notification scheduler started');
}
