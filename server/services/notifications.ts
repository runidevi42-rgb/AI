import { settleInBatches } from '../lib/batch.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { deliverySummary, isEligible, requestedChannels, type DeliveryChannel, type NotificationRecipient } from './delivery.js';
import { resolveTemplate } from './templates.js';
import { assertWebPushConfigured, sendWebPush } from './web-push.js';
import { sendTemplate } from './whatsapp.js';

type DeliveryAttempt = { recipient: NotificationRecipient; channel: 'web_push' | 'whatsapp' };

export async function dispatchNotification(notificationId: string) {
  const { data: notification, error } = await supabase.from('notifications').select('*').eq('id', notificationId).single();
  if (error || !notification) throw error ?? new Error('Notification not found');
  const deliveryChannel = notification.delivery_channel as DeliveryChannel;
  const channels = requestedChannels(deliveryChannel);

  if (channels.includes('whatsapp')) resolveTemplate('notification', ['Student', notification.title, notification.message]);
  if (channels.includes('web_push')) assertWebPushConfigured();

  let query = supabase.from('students').select('student_id,whatsapp_number,full_name,active,whatsapp_opt_in,web_push_opt_in').eq('active', true);
  if (notification.audience === 'selected') query = query.in('student_id', notification.student_ids ?? []);
  if (notification.department) query = query.eq('department', notification.department);
  if (notification.semester) query = query.eq('semester', notification.semester);
  const { data: students, error: studentError } = await query;
  if (studentError) throw studentError;

  const recipients = (students ?? []) as NotificationRecipient[];
  const attempts: DeliveryAttempt[] = recipients.flatMap((recipient) => channels
    .filter((channel) => isEligible(recipient, channel))
    .map((channel) => ({ recipient, channel })));
  const targetedStudents = new Set(attempts.map((attempt) => attempt.recipient.student_id)).size;

  await supabase.from('notifications').update({ status: 'sending', recipient_count: targetedStudents, updated_at: new Date().toISOString() }).eq('id', notification.id);

  const results = await settleInBatches(attempts, 10, async ({ recipient, channel }) => {
    if (channel === 'whatsapp') {
      return sendTemplate(recipient.whatsapp_number, 'notification', [recipient.full_name.split(' ')[0], notification.title, notification.message], { notificationId: notification.id, studentId: recipient.student_id });
    }
    return sendWebPush(recipient, { title: notification.title, message: notification.message, url: '/' }, notification.id);
  });
  const { sent, failed, status } = deliverySummary(results);
  await supabase.from('notifications').update({ status, sent_at: new Date().toISOString(), recipient_count: targetedStudents, delivered_count: 0, updated_at: new Date().toISOString() }).eq('id', notification.id);
  return { recipients: targetedStudents, attempts: results.length, sent, failed, status };
}

export async function notifyTimetableChange(timetable: Record<string, unknown>) {
  if (!timetable.department || !timetable.semester) return;
  const parameters = [String(timetable.day_of_week ?? ''), String(timetable.start_time ?? '').slice(0, 5), String(timetable.subject ?? ''), String(timetable.room ?? 'To be announced')];
  resolveTemplate('timetable_update', parameters);
  const { data: students, error } = await supabase.from('students')
    .select('student_id,whatsapp_number')
    .match({ department: timetable.department, semester: timetable.semester, active: true, whatsapp_opt_in: true });
  if (error) throw error;
  const results = await settleInBatches(students ?? [], 10, (student) => sendTemplate(student.whatsapp_number, 'timetable_update', parameters, { studentId: student.student_id }));
  const failures = results.filter((result) => result.status === 'rejected').length;
  if (failures) logger.warn({ failures, total: results.length }, 'Some timetable update messages failed');
}
