import { describe, expect, it } from 'vitest';
import { clearWebConversation } from './assistant.js';

describe('web chat history clearing', () => {
  it('deletes only the authenticated student web session', async () => {
    const filters: Array<[string, unknown]> = [];
    const database = {
      from(table: string) {
        expect(table).toBe('message_logs');
        return {
          delete: () => ({
            eq: (field: string, value: unknown) => {
              filters.push([field, value]);
              return {
                eq: (nextField: string, nextValue: unknown) => {
                  filters.push([nextField, nextValue]);
                  return { eq: async (lastField: string, lastValue: unknown) => { filters.push([lastField, lastValue]); return { error: null }; } };
                },
              };
            },
          }),
        };
      },
    } as any;

    await clearWebConversation(48, database);
    expect(filters).toEqual([
      ['student_id', 48],
      ['channel', 'web_push'],
      ['metadata->>session_id', 'web-48'],
    ]);
  });
});
