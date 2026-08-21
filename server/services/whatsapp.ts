import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';

const endpoint = `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

export function normalizePhone(value: string) {
  return String(value).replace(/\D/g, '').replace(/^00/, '');
}

function recordDelivery(payload: Record<string, unknown>) {
  void supabase.from('message_logs').insert(payload).then(({ error }) => {
    if (error) logger.warn({ message: error.message, code: error.code }, 'WhatsApp delivery log failed');
  });
}

async function send(payload: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`WhatsApp API error (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

export async function sendText(to: string, text: string, notificationId?: string) {
  try {
    const normalizedTo = normalizePhone(to);
    const result = await send({ to: normalizedTo, type: 'text', text: { preview_url: false, body: text.slice(0, 4096) } });
    recordDelivery({ phone: normalizedTo, direction: 'outbound', message: text, status: 'sent', notification_id: notificationId, provider_message_id: (result.messages as Array<{ id: string }> | undefined)?.[0]?.id });
    return result;
  } catch (error) {
    logger.error({ err: error }, 'WhatsApp delivery failed');
    recordDelivery({ phone: normalizePhone(to), direction: 'outbound', message: text, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error', notification_id: notificationId });
    throw error;
  }
}

export async function sendTemplate(to: string, template: string, parameters: string[] = [], notificationId?: string) {
  const normalizedTo = normalizePhone(to);
  try {
    const result = await send({
      to: normalizedTo, type: 'template',
      template: { name: template, language: { code: 'en' }, components: parameters.length ? [{ type: 'body', parameters: parameters.map((text) => ({ type: 'text', text })) }] : [] },
    });
    recordDelivery({
      phone: normalizedTo,
      direction: 'outbound',
      message: `[template:${template}] ${parameters.join(' | ')}`,
      status: 'sent',
      notification_id: notificationId,
      provider_message_id: (result.messages as Array<{ id: string }> | undefined)?.[0]?.id,
      metadata: { template, parameters },
    });
    return result;
  } catch (error) {
    recordDelivery({ phone: normalizedTo, direction: 'outbound', message: `[template:${template}]`, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error', notification_id: notificationId });
    throw error;
  }
}

export async function recordMessageStatus(status: { id?: string; status?: string; timestamp?: string; errors?: unknown }) {
  if (!status.id || !status.status) return;
  const allowed = new Set(['sent', 'delivered', 'read', 'failed']);
  if (!allowed.has(status.status)) return;

  const { data: log, error } = await supabase
    .from('message_logs')
    .update({ status: status.status, error: status.errors ? JSON.stringify(status.errors) : null, updated_at: new Date().toISOString() })
    .eq('provider_message_id', status.id)
    .select('notification_id')
    .maybeSingle();
  if (error) {
    logger.warn({ message: error.message, code: error.code, providerMessageId: status.id }, 'WhatsApp status update failed');
    return;
  }
  if (!log?.notification_id) return;

  const { count } = await supabase.from('message_logs')
    .select('id', { count: 'exact', head: true })
    .eq('notification_id', log.notification_id)
    .in('status', ['delivered', 'read']);
  await supabase.from('notifications').update({ delivered_count: count ?? 0, updated_at: new Date().toISOString() }).eq('id', log.notification_id);
}
