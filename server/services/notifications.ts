import { supabase } from '../lib/supabase.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { sendTemplate, sendText } from './whatsapp.js';

export async function dispatchNotification(notificationId: string) {
  const { data: notification, error } = await supabase.from('notifications').select('*').eq('id', notificationId).single();
  if (error || !notification) throw error ?? new Error('Notification not found');
  let query = supabase.from('students').select('student_id,whatsapp_number,full_name');
  if (notification.audience === 'selected') query = query.in('student_id', notification.student_ids ?? []);
  if (notification.department) query = query.eq('department', notification.department);
  if (notification.semester) query = query.eq('semester', notification.semester);
  const { data: students, error: studentError } = await query;
  if (studentError) throw studentError;

  await supabase.from('notifications').update({ status: 'sending', updated_at: new Date().toISOString() }).eq('id', notification.id);

  if (config.NODE_ENV === 'production' && !config.WHATSAPP_NOTIFICATION_TEMPLATE) {
    throw new Error('WHATSAPP_NOTIFICATION_TEMPLATE is required for production broadcasts');
  }
  const results = await Promise.allSettled((students ?? []).map((student) => config.NODE_ENV === 'production'
    ? sendTemplate(student.whatsapp_number, config.WHATSAPP_NOTIFICATION_TEMPLATE, [notification.title, notification.message], notification.id)
    : sendText(student.whatsapp_number, `*${notification.title}*\n${notification.message}`, notification.id)));
  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const status = !results.length ? 'sent' : sent === results.length ? 'sent' : sent ? 'partial' : 'failed';
  await supabase.from('notifications').update({ status, sent_at: new Date().toISOString(), recipient_count: results.length, delivered_count: 0, updated_at: new Date().toISOString() }).eq('id', notification.id);
  return { recipients: results.length, sent, failed: results.length - sent };
}

export async function notifyTimetableChange(timetable: Record<string, unknown>) {
  if (!timetable.department || !timetable.semester) return;
  const { data: students, error } = await supabase.from('students').select('whatsapp_number').match({ department: timetable.department, semester: timetable.semester });
  if (error) throw error;
  if (config.NODE_ENV === 'production' && !config.WHATSAPP_TIMETABLE_UPDATE_TEMPLATE) {
    logger.warn('Timetable update messages skipped because WHATSAPP_TIMETABLE_UPDATE_TEMPLATE is not configured');
    return;
  }
  const parameters = [String(timetable.day_of_week ?? ''), String(timetable.start_time ?? '').slice(0, 5), String(timetable.subject ?? ''), String(timetable.room ?? 'To be announced')];
  await Promise.allSettled((students ?? []).map((student) => config.NODE_ENV === 'production'
    ? sendTemplate(student.whatsapp_number, config.WHATSAPP_TIMETABLE_UPDATE_TEMPLATE, parameters)
    : sendText(student.whatsapp_number, `Timetable update: ${parameters[0]} ${parameters[1]} - ${parameters[2]} (${parameters[3]}).`)));
}
