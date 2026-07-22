import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';

const endpoint = `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

export function normalizePhone(value: string) {
  return value.replace(/\D/g, '').replace(/^00/, '');
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
    const result = await send({ to: normalizePhone(to), type: 'text', text: { preview_url: false, body: text.slice(0, 4096) } });
    await supabase.from('message_logs').insert({ phone: normalizePhone(to), direction: 'outbound', message: text, status: 'sent', notification_id: notificationId, provider_message_id: (result.messages as Array<{ id: string }> | undefined)?.[0]?.id });
    return result;
  } catch (error) {
    logger.error({ err: error }, 'WhatsApp delivery failed');
    await supabase.from('message_logs').insert({ phone: normalizePhone(to), direction: 'outbound', message: text, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error', notification_id: notificationId });
    throw error;
  }
}

export async function sendTemplate(to: string, template: string, parameters: string[] = []) {
  return send({
    to: normalizePhone(to), type: 'template',
    template: { name: template, language: { code: 'en' }, components: parameters.length ? [{ type: 'body', parameters: parameters.map((text) => ({ type: 'text', text })) }] : [] },
  });
}
