import { describe, expect, it } from 'vitest';
import { deliverySummary, isEligible, requestedChannels, type NotificationRecipient } from './delivery.js';

const student: NotificationRecipient = {
  student_id: 101, full_name: 'Asha Rao', whatsapp_number: '919876543210', active: true,
  whatsapp_opt_in: false, web_push_opt_in: true,
};

describe('notification consent', () => {
  it('enforces WhatsApp opt-in independently', () => expect(isEligible(student, 'whatsapp')).toBe(false));
  it('enforces Web Push opt-in independently', () => expect(isEligible(student, 'web_push')).toBe(true));
  it('blocks every channel for inactive students', () => expect(isEligible({ ...student, active: false }, 'web_push')).toBe(false));
  it('expands both into two distinct channels', () => expect(requestedChannels('both')).toEqual(['web_push', 'whatsapp']));
  it('marks mixed provider outcomes as a partial delivery', () => {
    expect(deliverySummary([{ status: 'fulfilled', value: true }, { status: 'rejected', reason: new Error('failed') }])).toEqual({ sent: 1, failed: 1, status: 'partial' });
  });
});
