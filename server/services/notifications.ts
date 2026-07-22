import { supabase } from '../lib/supabase.js';
import { sendText } from './whatsapp.js';

export async function dispatchNotification(notificationId: string) {
  const { data: notification, error } = await supabase.from('notifications').select('*').eq('id', notificationId).single();
  if (error || !notification) throw error ?? new Error('Notification not found');
  let query = supabase.from('students').select('id,phone,full_name').eq('active', true).eq('whatsapp_opt_in', true);
  if (notification.audience === 'selected') query = query.in('id', notification.student_ids ?? []);
  if (notification.department) query = query.eq('department', notification.department);
  if (notification.semester) query = query.eq('semester', notification.semester);
  const { data: students, error: studentError } = await query;
  if (studentError) throw studentError;

  const results = await Promise.allSettled((students ?? []).map((student) => sendText(student.phone, `*${notification.title}*\n${notification.message}`, notification.id)));
  const sent = results.filter((r) => r.status === 'fulfilled').length;
  await supabase.from('notifications').update({ status: sent === results.length ? 'sent' : 'partial', sent_at: new Date().toISOString(), recipient_count: results.length, delivered_count: sent }).eq('id', notification.id);
  return { recipients: results.length, sent, failed: results.length - sent };
}
