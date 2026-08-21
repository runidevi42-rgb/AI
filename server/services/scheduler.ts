import cron from 'node-cron';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { dispatchNotification } from './notifications.js';
import { sendTemplate, sendText } from './whatsapp.js';

type DateParts = { date: string; day: string };

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

async function once(key: string, task: () => Promise<void>) {
  const { data, error } = await supabase.from('scheduled_job_runs').select('id').eq('job_key', key).maybeSingle();
  if (error) throw error;
  if (data) return;
  await task();
  const { error: insertError } = await supabase.from('scheduled_job_runs').insert({ job_key: key, completed_at: new Date().toISOString() });
  if (insertError && insertError.code !== '23505') throw insertError;
}

async function sendReminder(to: string, template: string, parameters: string[], message: string) {
  if (template) return sendTemplate(to, template, parameters);
  if (config.NODE_ENV === 'production') {
    logger.warn({ recipientSuffix: to.slice(-4) }, 'Reminder skipped because its approved WhatsApp template is not configured');
    return;
  }
  return sendText(to, message);
}

async function dailySchedules() {
  const { date, day } = collegeDateParts();
  await once(`daily-schedule:${date}`, async () => {
    const { data: students, error } = await supabase.from('students').select('full_name,whatsapp_number,department,semester');
    if (error) throw error;
    for (const student of students ?? []) {
      const { data: classes, error: classError } = await supabase.from('timetables').select('start_time,end_time,subject,room').match({ department: student.department, semester: student.semester }).ilike('day_of_week', day).order('start_time');
      if (classError) throw classError;
      if (!classes?.length) continue;
      const lines = classes.map((item) => `${item.start_time.slice(0, 5)} - ${item.subject}${item.room ? ` (${item.room})` : ''}`).join('\n');
      const firstName = student.full_name.split(' ')[0];
      await sendReminder(student.whatsapp_number, config.WHATSAPP_TIMETABLE_TEMPLATE, [firstName, date, lines], `Good morning, ${firstName}. Today's classes:\n${lines}`);
    }
  });
}

async function assignmentReminders() {
  const tomorrow = addCalendarDays(collegeDateParts().date, 1);
  await once(`assignments:${tomorrow}`, async () => {
    const { data: assignments, error } = await supabase.from('assignments').select('title,subject,department,semester,due_at').gte('due_at', `${tomorrow}T00:00:00`).lte('due_at', `${tomorrow}T23:59:59.999`);
    if (error) throw error;
    for (const assignment of assignments ?? []) {
      const { data: students, error: studentError } = await supabase.from('students').select('whatsapp_number').match({ department: assignment.department, semester: assignment.semester });
      if (studentError) throw studentError;
      const due = new Date(assignment.due_at).toLocaleString('en-IN', { timeZone: config.COLLEGE_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' });
      await Promise.allSettled((students ?? []).map((student) => sendReminder(student.whatsapp_number, config.WHATSAPP_ASSIGNMENT_TEMPLATE, [assignment.title, assignment.subject, due], `Reminder: ${assignment.title} (${assignment.subject}) is due ${due}.`)));
    }
  });
}

async function examReminders() {
  const today = collegeDateParts().date;
  for (const daysAhead of [3, 1]) {
    const examDate = addCalendarDays(today, daysAhead);
    await once(`exams:${daysAhead}:${examDate}`, async () => {
      const { data: exams, error } = await supabase.from('exams').select('title,subject,department,semester,exam_date,start_time').eq('exam_date', examDate);
      if (error) throw error;
      for (const exam of exams ?? []) {
        const { data: students, error: studentError } = await supabase.from('students').select('whatsapp_number').match({ department: exam.department, semester: exam.semester });
        if (studentError) throw studentError;
        await Promise.allSettled((students ?? []).map((student) => sendReminder(student.whatsapp_number, config.WHATSAPP_EXAM_TEMPLATE, [exam.title, exam.subject, exam.exam_date, exam.start_time.slice(0, 5)], `Exam reminder: ${exam.title} (${exam.subject}) is on ${exam.exam_date} at ${exam.start_time.slice(0, 5)}.`)));
      }
    });
  }
}

async function eventReminders() {
  const tomorrow = addCalendarDays(collegeDateParts().date, 1);
  await once(`events:${tomorrow}`, async () => {
    const { data: events, error } = await supabase.from('events').select('title,start_at,venue,department').gte('start_at', `${tomorrow}T00:00:00`).lte('start_at', `${tomorrow}T23:59:59.999`);
    if (error) throw error;
    for (const event of events ?? []) {
      let query = supabase.from('students').select('whatsapp_number');
      if (event.department) query = query.eq('department', event.department);
      const { data: students, error: studentError } = await query;
      if (studentError) throw studentError;
      const start = new Date(event.start_at).toLocaleString('en-IN', { timeZone: config.COLLEGE_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' });
      await Promise.allSettled((students ?? []).map((student) => sendReminder(student.whatsapp_number, config.WHATSAPP_EVENT_TEMPLATE, [event.title, start, event.venue ?? 'See college notice'], `Reminder: ${event.title} is scheduled for ${start}${event.venue ? ` at ${event.venue}` : ''}.`)));
    }
  });
}

async function scheduledNotifications() {
  const { data, error } = await supabase.from('notifications').select('id').eq('status', 'scheduled').lte('scheduled_at', new Date().toISOString()).limit(20);
  if (error) throw error;
  await Promise.allSettled((data ?? []).map((item) => dispatchNotification(item.id)));
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
