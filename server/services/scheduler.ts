import cron from 'node-cron';
import { format, addDays } from 'date-fns';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { sendText } from './whatsapp.js';

async function once(key: string, task: () => Promise<void>) {
  const { data } = await supabase.from('scheduled_job_runs').select('id').eq('job_key', key).maybeSingle();
  if (data) return;
  await task();
  await supabase.from('scheduled_job_runs').insert({ job_key: key, completed_at: new Date().toISOString() });
}

async function dailySchedules() {
  const now = new Date();
  const day = format(now, 'EEEE');
  await once(`daily-schedule:${format(now, 'yyyy-MM-dd')}`, async () => {
    const { data: students } = await supabase.from('students').select('*').eq('active', true).eq('whatsapp_opt_in', true);
    for (const student of students ?? []) {
      const { data: classes } = await supabase.from('timetables').select('start_time,end_time,subject,room').match({ department: student.department, semester: student.semester, section: student.section }).ilike('day_of_week', day).order('start_time');
      if (!classes?.length) continue;
      const lines = classes.map((c) => `${c.start_time.slice(0,5)} - ${c.subject}${c.room ? ` (${c.room})` : ''}`);
      await sendText(student.phone, `Good morning, ${student.full_name.split(' ')[0]}. Today's classes:\n${lines.join('\n')}`);
    }
  });
}

async function deadlineReminders() {
  const tomorrow = addDays(new Date(), 1);
  const date = format(tomorrow, 'yyyy-MM-dd');
  await once(`deadlines:${date}`, async () => {
    const { data: assignments } = await supabase.from('assignments').select('*').gte('due_at', `${date}T00:00:00`).lte('due_at', `${date}T23:59:59`);
    for (const assignment of assignments ?? []) {
      const { data: students } = await supabase.from('students').select('phone').match({ department: assignment.department, semester: assignment.semester, active: true, whatsapp_opt_in: true });
      await Promise.allSettled((students ?? []).map((s) => sendText(s.phone, `Reminder: ${assignment.title} (${assignment.subject}) is due tomorrow at ${new Date(assignment.due_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`)));
    }
  });
}

export function startScheduler() {
  if (!config.SCHEDULER_ENABLED) return;
  cron.schedule('0 7 * * 1-6', () => dailySchedules().catch((err) => logger.error({ err }, 'Daily schedule job failed')), { timezone: config.COLLEGE_TIMEZONE });
  cron.schedule('0 18 * * *', () => deadlineReminders().catch((err) => logger.error({ err }, 'Deadline reminder job failed')), { timezone: config.COLLEGE_TIMEZONE });
  logger.info('Automated notification scheduler started');
}
