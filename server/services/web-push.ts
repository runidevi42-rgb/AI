import webpush from 'web-push';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';

type PushPayload = { title: string; message: string; url?: string };

export class WebPushConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebPushConfigurationError';
  }
}

export function assertWebPushConfigured() {
  if (!config.WEB_PUSH_VAPID_PUBLIC_KEY || !config.WEB_PUSH_VAPID_PRIVATE_KEY || !config.WEB_PUSH_VAPID_SUBJECT) {
    throw new WebPushConfigurationError('WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY and WEB_PUSH_VAPID_SUBJECT are required for Web Push');
  }
  try {
    webpush.setVapidDetails(config.WEB_PUSH_VAPID_SUBJECT, config.WEB_PUSH_VAPID_PUBLIC_KEY, config.WEB_PUSH_VAPID_PRIVATE_KEY);
  } catch (error) {
    throw new WebPushConfigurationError(error instanceof Error ? `Invalid Web Push VAPID configuration: ${error.message}` : 'Invalid Web Push VAPID configuration');
  }
}

export async function sendWebPush(student: { student_id: number; whatsapp_number: string }, payload: PushPayload, notificationId?: string) {
  assertWebPushConfigured();
  const { data: subscriptions, error } = await supabase.from('web_push_subscriptions').select('id,endpoint,p256dh,auth').eq('student_id', student.student_id).eq('active', true);
  if (error) throw error;
  if (!subscriptions?.length) {
    const failureReason = `No active Web Push subscription for student ${student.student_id}`;
    await supabase.from('message_logs').insert({
      student_id: student.student_id, phone: student.whatsapp_number, direction: 'outbound', channel: 'web_push',
      message: payload.message, status: 'failed', notification_id: notificationId,
      failure_reason: failureReason, error: failureReason, metadata: { title: payload.title },
    });
    throw new Error(failureReason);
  }

  let accepted = 0;
  const failures: unknown[] = [];
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), { TTL: 3600 });
      accepted += 1;
      await supabase.from('message_logs').insert({
        student_id: student.student_id, phone: student.whatsapp_number, direction: 'outbound', channel: 'web_push',
        message: payload.message, status: 'sent', notification_id: notificationId,
        metadata: { subscriptionId: subscription.id, title: payload.title },
      });
    } catch (failure) {
      failures.push(failure);
      const statusCode = typeof failure === 'object' && failure && 'statusCode' in failure ? Number(failure.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('web_push_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', subscription.id);
      }
      const failureReason = failure instanceof Error ? failure.message : 'Unknown Web Push error';
      await supabase.from('message_logs').insert({
        student_id: student.student_id, phone: student.whatsapp_number, direction: 'outbound', channel: 'web_push',
        message: payload.message, status: 'failed', notification_id: notificationId,
        failure_reason: failureReason, error: failureReason,
        metadata: { subscriptionId: subscription.id, title: payload.title },
      });
    }
  }
  if (!accepted) throw failures[0] ?? new Error('Web Push delivery failed');
  if (failures.length) logger.warn({ studentId: student.student_id, failedSubscriptions: failures.length }, 'Some Web Push subscriptions failed');
  return { accepted, failed: failures.length };
}
