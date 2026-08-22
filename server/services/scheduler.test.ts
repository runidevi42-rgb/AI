import { describe, expect, it } from 'vitest';
import { addCalendarDays, collegeDateParts, runClaimedOnce } from './scheduler.js';

describe('scheduler calendar helpers', () => {
  it('uses the configured college timezone across a UTC date boundary', () => {
    expect(collegeDateParts(new Date('2026-08-20T20:00:00.000Z'))).toEqual({
      date: '2026-08-21',
      day: 'Friday',
    });
  });

  it('adds calendar days across month boundaries', () => {
    expect(addCalendarDays('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('does not run a duplicate scheduled job when the atomic claim fails', async () => {
    let executions = 0;
    const result = await runClaimedOnce(async () => { executions += 1; }, async () => false, async () => undefined);
    expect(result).toBe(false);
    expect(executions).toBe(0);
  });
});
