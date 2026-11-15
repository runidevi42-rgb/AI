import { describe, expect, it } from 'vitest';
import { matchAttendanceRows } from './attendance-import.js';

describe('attendance import matching', () => {
  it('accepts exact IDs and normalized names, and skips mismatches, duplicates and invalid values', () => {
    const result = matchAttendanceRows([
      { student_id: '48', student_name: '  SUMIT   kumar ', attendance_percentage: '78' },
      { student_id: '48', student_name: 'Sumit Kumar', attendance_percentage: '90' },
      { student_id: '048', student_name: 'Sumit Kumar', attendance_percentage: '78' },
      { student_id: '49', student_name: 'Wrong Name', attendance_percentage: '50' },
      { student_id: '50', student_name: 'Unknown', attendance_percentage: '50' },
      { student_id: '51', student_name: 'Other', attendance_percentage: '101' },
    ], [{ student_id: 48, full_name: 'Sumit Kumar' }, { student_id: 49, full_name: 'Shaquib Ahmad' }, { student_id: 51, full_name: 'Other' }]);
    expect(result.accepted.map((row) => row.student_id)).toEqual(['48']);
    expect(result.skipped).toHaveLength(5);
    expect(result.skipped.map((row) => row.reason)).toEqual(expect.arrayContaining(['Duplicate student ID in this list', 'Name does not match this student ID', 'Student ID not found']));
  });
});
