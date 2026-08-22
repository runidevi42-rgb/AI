export type DeliveryChannel = 'web_push' | 'whatsapp' | 'both';

export type NotificationRecipient = {
  student_id: number;
  full_name: string;
  whatsapp_number: string;
  active: boolean;
  whatsapp_opt_in: boolean;
  web_push_opt_in: boolean;
};

export function requestedChannels(channel: DeliveryChannel) {
  return channel === 'both' ? (['web_push', 'whatsapp'] as const) : [channel];
}

export function isEligible(recipient: NotificationRecipient, channel: 'web_push' | 'whatsapp') {
  return recipient.active && (channel === 'whatsapp' ? recipient.whatsapp_opt_in : recipient.web_push_opt_in);
}

export function deliverySummary(results: PromiseSettledResult<unknown>[]) {
  const sent = results.filter((result) => result.status === 'fulfilled').length;
  const failed = results.length - sent;
  const status = !results.length ? 'failed' : failed === 0 ? 'sent' : sent ? 'partial' : 'failed';
  return { sent, failed, status } as const;
}
