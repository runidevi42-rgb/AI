import { describe, expect, it } from 'vitest';
import { settleInBatches } from './batch.js';

describe('limited delivery batching', () => {
  it('preserves partial successes without rejecting the broadcast', async () => {
    const results = await settleInBatches([1, 2, 3], 2, async (value) => {
      if (value === 2) throw new Error('provider failure');
      return value * 2;
    });
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });
});
