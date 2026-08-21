import { describe, expect, it } from 'vitest';
import { addCalendarDays, collegeDateParts } from './scheduler.js';

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
});
