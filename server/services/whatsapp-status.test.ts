import { describe, expect, it } from 'vitest';
import { supabase } from '../lib/supabase.js';
import { recordMessageStatus } from './whatsapp.js';

function fakeDatabase(updates: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      if (table === 'message_logs') return {
        update(values: Record<string, unknown>) {
          updates.push(values);
          return { eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { notification_id: 'notice-1' }, error: null }) }) }) }) };
        },
        select() {
          return { eq: () => ({ in: async () => ({ count: 1, error: null }) }) };
        },
      };
      return {
        update(values: Record<string, unknown>) {
          updates.push(values);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  } as unknown as Pick<typeof supabase, 'from'>;
}

describe('Meta delivery status updates', () => {
  it.each(['sent', 'delivered', 'read'])('records %s by provider message ID', async (status) => {
    const updates: Array<Record<string, unknown>> = [];
    await recordMessageStatus({ id: 'wamid.123', status }, fakeDatabase(updates));
    expect(updates[0]).toMatchObject({ status, failure_reason: null });
    expect(updates[1]).toMatchObject({ delivered_count: 1 });
  });

  it('records Meta failure details', async () => {
    const updates: Array<Record<string, unknown>> = [];
    await recordMessageStatus({ id: 'wamid.456', status: 'failed', errors: [{ code: 131047 }] }, fakeDatabase(updates));
    expect(updates[0].status).toBe('failed');
    expect(String(updates[0].failure_reason)).toContain('131047');
  });
});
