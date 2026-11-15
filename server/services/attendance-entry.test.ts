import { describe, expect, it } from 'vitest';
import { attendanceEntrySchema } from './attendance-entry.js';

describe('manual attendance entry', () => {
  const entry = { student_id: '123456789012345', student_name: 'Student', attendance_percentage: 82.5 };
  it('preserves a complete numeric ID as text', () => expect(attendanceEntrySchema.parse(entry).student_id).toBe(entry.student_id));
  it.each(['00123', 'STU123', '9007199254740992', ''])('rejects an ID that cannot be matched safely: %s', (student_id) => expect(attendanceEntrySchema.safeParse({ ...entry, student_id }).success).toBe(false));
  it.each([-1, 100.01, 12.345])('rejects invalid percentage %s', (attendance_percentage) => expect(attendanceEntrySchema.safeParse({ ...entry, attendance_percentage }).success).toBe(false));
  it.each([0, 100])('accepts boundary percentage %s', (attendance_percentage) => expect(attendanceEntrySchema.safeParse({ ...entry, attendance_percentage }).success).toBe(true));
});
