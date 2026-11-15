import { z } from 'zod';

// The current student IDs are numeric. Reject ambiguous formats and integers
// that the existing API cannot safely represent when returning database rows.
export const attendanceEntrySchema = z.object({
  student_id: z.string().trim().regex(/^[1-9]\d*$/, 'Enter the exact numeric student ID without leading zeros').refine((id) => !/^[1-9]\d*$/.test(id) || BigInt(id) <= BigInt(Number.MAX_SAFE_INTEGER), 'Student ID is too large for the current student system'),
  student_name: z.string().trim().min(1, 'Enter the student name'),
  attendance_percentage: z.number().finite().min(0).max(100).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, 'Use at most two decimal places'),
});
