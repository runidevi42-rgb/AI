import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { resolveTemplate, type WhatsAppTemplateKind } from './templates.js';
import { normalizePhoneNumber } from '../utils/phone.js';

const endpoint = `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

export type DeliveryContext = { notificationId?: string; studentId?: number };

export function normalizePhone(value: string) {
  return normalizePhoneNumber(value);
}

export async function hasProcessedMessage(messageId: string, database: Pick<typeof supabase, 'from'> = supabase) {
  if (!messageId) return false;
  const { data, error } = await database.from('message_logs').select('id').eq('provider_message_id', messageId).eq('channel', 'whatsapp').limit(1);
  if (error) {
    logger.warn({ message: error.message, code: error.code }, 'WhatsApp duplicate check failed');
    throw error;
  }
  return Boolean(data?.length);
}

async function recordDelivery(payload: Record<string, unknown>) {
  const { error } = await supabase.from('message_logs').insert(payload);
  if (error) logger.warn({ message: error.message, code: error.code }, 'WhatsApp delivery log failed');
}

async function send(payload: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`WhatsApp API error (${response.status})`);
  return body;
}

export async function sendText(to: string, text: string, context: DeliveryContext = {}) {
  const normalizedTo = normalizePhone(to);
  try {
    const result = await send({ to: normalizedTo, type: 'text', text: { preview_url: false, body: text.slice(0, 4096) } });
    await recordDelivery({
      phone: normalizedTo, student_id: context.studentId, direction: 'outbound', channel: 'whatsapp',
      message: text, status: 'sent', notification_id: context.notificationId,
      provider_message_id: (result.messages as Array<{ id: string }> | undefined)?.[0]?.id,
    });
    return result;
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ err: error, recipientSuffix: normalizedTo.slice(-4) }, 'WhatsApp delivery failed');
    await recordDelivery({
      phone: normalizedTo, student_id: context.studentId, direction: 'outbound', channel: 'whatsapp',
      message: text, status: 'failed', failure_reason: failureReason, error: failureReason,
      notification_id: context.notificationId,
    });
    throw error;
  }
}

export async function sendTemplate(to: string, kind: WhatsAppTemplateKind, parameters: string[], context: DeliveryContext = {}) {
  const template = resolveTemplate(kind, parameters);
  const normalizedTo = normalizePhone(to);
  try {
    const result = await send({
      to: normalizedTo,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
        components: [{ type: 'body', parameters: template.parameters.map((text) => ({ type: 'text', text })) }],
      },
    });
    await recordDelivery({
      phone: normalizedTo, student_id: context.studentId, direction: 'outbound', channel: 'whatsapp',
      message: `[template:${template.name}]`, status: 'sent', notification_id: context.notificationId,
      provider_message_id: (result.messages as Array<{ id: string }> | undefined)?.[0]?.id,
      template_name: template.name, template_language: template.language,
      metadata: { templateKind: kind, parameters: template.parameters },
    });
    return result;
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'Unknown error';
    await recordDelivery({
      phone: normalizedTo, student_id: context.studentId, direction: 'outbound', channel: 'whatsapp',
      message: `[template:${template.name}]`, status: 'failed', notification_id: context.notificationId,
      template_name: template.name, template_language: template.language,
      failure_reason: failureReason, error: failureReason,
      metadata: { templateKind: kind, parameters: template.parameters },
    });
    throw error;
  }
}

export async function recordMessageStatus(status: { id?: string; status?: string; timestamp?: string; errors?: unknown }, database: Pick<typeof supabase, 'from'> = supabase) {
  if (!status.id || !status.status) return;
  const allowed = new Set(['sent', 'delivered', 'read', 'failed']);
  if (!allowed.has(status.status)) return;
  const failureReason = status.errors ? JSON.stringify(status.errors) : null;

  const { data: log, error } = await database
    .from('message_logs')
    .update({ status: status.status, failure_reason: failureReason, error: failureReason, updated_at: new Date().toISOString() })
    .eq('provider_message_id', status.id)
    .eq('channel', 'whatsapp')
    .select('notification_id')
    .maybeSingle();
  if (error) {
    logger.warn({ message: error.message, code: error.code, providerMessageId: status.id }, 'WhatsApp status update failed');
    return;
  }
  if (!log?.notification_id) return;

  const { count } = await database.from('message_logs')
    .select('id', { count: 'exact', head: true })
    .eq('notification_id', log.notification_id)
    .in('status', ['delivered', 'read']);
  await database.from('notifications').update({ delivered_count: count ?? 0, updated_at: new Date().toISOString() }).eq('id', log.notification_id);
}
