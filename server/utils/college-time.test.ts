import { describe, expect, it } from 'vitest';
import { collegeDateBounds, formatCollegeTime, getCurrentCollegeDateTime, timeToMinutes } from './college-time.js';

describe('college timezone helpers', () => {
  it('uses Asia/Kolkata even when the server instant is UTC', () => {
    const value = getCurrentCollegeDateTime(new Date('2026-09-29T18:55:00.000Z'));
    expect(value.timezone).toBe('Asia/Kolkata');
    expect(value.date).toBe('2026-09-30');
    expect(value.weekday).toBe('Wednesday');
    expect(value.time).toBe('00:25:00');
  });

  it('compares and formats timetable times deterministically', () => {
    expect(timeToMinutes('11:05:00')).toBe(665);
    expect(timeToMinutes('bad')).toBeNull();
    expect(formatCollegeTime('14:00:00')).toBe('2:00 PM');
  });

  it('converts college-local day boundaries to UTC without server timezone assumptions', () => {
    expect(collegeDateBounds('2026-09-30')).toEqual({
      start: '2026-09-29T18:30:00.000Z',
      end: '2026-09-30T18:29:59.000Z',
    });
  });
});
