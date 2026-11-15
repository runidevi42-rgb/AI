import { attendanceEntrySchema } from './attendance-entry.js';

export type ImportRow = { student_id: string; student_name: string; attendance_percentage: string };
export type ImportResult = ImportRow & { reason?: string };
const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

export function matchAttendanceRows(rows: ImportRow[], students: { student_id: string | number; full_name: string }[]) {
  const byId = new Map(students.map((student) => [String(student.student_id), student]));
  const seen = new Set<string>();
  const accepted: ImportResult[] = [];
  const skipped: ImportResult[] = [];
  for (const row of rows) {
    const id = row.student_id.trim();
    let reason: string | undefined;
    if (seen.has(id)) reason = 'Duplicate student ID in this list';
    seen.add(id);
    const percentageText = row.attendance_percentage.trim().replace(/%$/, '').trim();
    const percentage = percentageText === '' ? NaN : Number(percentageText);
    const parsed = attendanceEntrySchema.safeParse({ student_id: id, student_name: row.student_name, attendance_percentage: percentage });
    if (!reason && !parsed.success) reason = parsed.error.issues[0]?.message ?? 'Invalid entry';
    const student = byId.get(id);
    if (!reason && !student) reason = 'Student ID not found';
    if (!reason && student && nameKey(student.full_name) !== nameKey(row.student_name)) reason = 'Name does not match this student ID';
    (reason ? skipped : accepted).push({ ...row, reason });
  }
  return { accepted, skipped };
}
