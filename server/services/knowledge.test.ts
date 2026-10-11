import { describe, expect, it } from 'vitest';
import { buildProfileResponse, detectIntent, detectProfileIntent, formatTimetableAnswer, requestedWeekday, resolveTimetableDay, timetableRowsForStudent, type StudentProfile } from './knowledge.js';
import { normalizePhone } from './whatsapp.js';
import { detectChatbotIntent } from './intent.js';

describe('chatbot language understanding', () => {
  it.each([
    ['Meri attendance kitni hai?', 'ATTENDANCE'],
    ['Aaj mera timetable kya hai?', 'TIMETABLE'],
    ['Which class is next?', 'TIMETABLE'],
    ["What's my next lecture?", 'TIMETABLE'],
    ['Aaj next class kya hai?', 'TIMETABLE'],
    ['After this class, what do I have?', 'TIMETABLE'],
    ['What is my lunch time?', 'LUNCH_BREAK'],
    ['When is recess?', 'LUNCH_BREAK'],
    ['Khane ka time kab hai?', 'LUNCH_BREAK'],
    ['Thanks', 'THANKS'],
    ['Who teaches DBMS?', 'FACULTY_CONTACT'],
    ['Police emergency number', 'EMERGENCY_CONTACT'],
    ['Mera next exam kab hai?', 'EXAM'],
    ['Koi assignment pending hai?', 'ASSIGNMENT'],
    ['Koi new notice hai?', 'NOTICE'],
  ])('routes %s to %s', (query, intent) => expect(detectChatbotIntent(query)).toBe(intent));
});

describe('detectIntent', () => {
  it.each([
    ['what classes do I have today?', 'timetable'],
    ['when is my data structures assignment due', 'assignments'],
    ['show my attendance percentage', 'attendance'],
    ['is tomorrow a holiday?', 'events'],
    ['I need campus security urgently', 'emergency'],
    ['any internship opportunities?', 'placements'],
  ])('routes %s to %s', (query, intent) => expect(detectIntent(query)).toBe(intent));

  it('falls back to verified general knowledge', () => expect(detectIntent('where is the library')).toBe('general'));
});

describe('date-based timetable resolution', () => {
  it('calculates tomorrow in Asia/Kolkata at a date boundary', () => {
    const sundayAtMidnight = new Date('2026-10-03T18:30:00.000Z');
    expect(resolveTimetableDay('Show tomorrow timetable', sundayAtMidnight)).toMatchObject({ day: 'Monday', tomorrow: true, sunday: false });
  });

  it('resolves Sunday tomorrow explicitly', () => {
    const saturdayAtMidnight = new Date('2026-10-02T18:30:00.000Z');
    expect(resolveTimetableDay('tomorrow timetable', saturdayAtMidnight)).toMatchObject({ day: 'Sunday', tomorrow: true, sunday: true });
  });

  it('keeps an explicit weekday instead of using the current day', () => {
    expect(requestedWeekday("What's Friday's timetable?")).toBe('Friday');
    expect(resolveTimetableDay("Show Friday's timetable", new Date('2026-10-03T18:30:00.000Z'))).toMatchObject({ day: 'Friday', tomorrow: false });
  });

  it('returns a safe empty-day response without inventing classes', () => {
    expect(formatTimetableAnswer('Tuesday', [])).toBe("I couldn't find any classes scheduled for Tuesday.");
  });

  it('keeps every stored Monday slot when the student has no group metadata', () => {
    const rows = [
      ['SE', null, false], ['Data Communication & Computer Network', '5CSE2', false],
      ['AI Basic Lab', '5CSE1', false], ['Recess', null, true],
      ['DS: DW & DM', null, false], ['Entrepreneurship Development & Start-ups Lab', '5CSE1', false],
      ['No Class', null, false],
    ].map(([subject, batch_group, is_recess], index) => ({ day_of_week: 'Monday', start_time: `${String(10 + index).padStart(2, '0')}:00`, end_time: `${String(11 + index).padStart(2, '0')}:00`, subject, batch_group, is_recess }));
    const result = timetableRowsForStudent(rows, { student_id: 48, full_name: 'Student', whatsapp_number: '', roll_number: 48, department: 'Computer Science', course: 'Diploma', semester: 5 }, true);
    expect(result).toHaveLength(7);
    expect(result.map((row) => row.subject)).toEqual(['SE', 'Data Communication & Computer Network', 'AI Basic Lab', 'Recess', 'DS: DW & DM', 'Entrepreneurship Development & Start-ups Lab', 'No Class']);
  });

  it('filters batch-specific rows when the authenticated student has a group', () => {
    const rows = [
      { day_of_week: 'Monday', start_time: '10:00', end_time: '11:00', subject: 'Common', batch_group: null },
      { day_of_week: 'Monday', start_time: '11:00', end_time: '12:00', subject: 'CSE1 Lab', batch_group: '5CSE1' },
      { day_of_week: 'Monday', start_time: '12:00', end_time: '13:00', subject: 'CSE2 Lab', batch_group: '5CSE2' },
    ];
    const result = timetableRowsForStudent(rows, { student_id: 48, full_name: 'Student', whatsapp_number: '', roll_number: 48, department: 'Computer Science', course: 'Diploma', semester: 5, batch_group: '5CSE1' });
    expect(result.map((row) => row.subject)).toEqual(['Common', 'CSE1 Lab']);
  });
});

describe('normalizePhone', () => {
  it('keeps only international digits', () => expect(normalizePhone('+91 98765-43210')).toBe('919876543210'));
  it('removes an international dialing prefix', () => expect(normalizePhone('0091 9876543210')).toBe('919876543210'));
});

describe('profile questions', () => {
  const student: StudentProfile = {
    student_id: 1001,
    full_name: 'Sumit Kumar',
    whatsapp_number: '919876543210',
    roll_number: 101,
    department: 'Computer Science',
    course: 'BCA',
    semester: 1,
  };

  it.each([
    ['What is my name?', 'name'],
    ["What's my name?", 'name'],
    ['Mera naam kya hai?', 'name'],
    ['My name', 'name'],
    ['What is your name?', 'assistant_identity'],
    ['Tell me my roll no.', 'roll_number'],
    ['What is my student ID?', 'student_id'],
    ['What is my department?', 'department'],
    ['What is my course?', 'course'],
    ['Which semester am I in?', 'semester'],
    ['What is my phone number?', 'whatsapp_number'],
    ['Show me my profile details', 'profile'],
  ])('detects %s without using AI', (query, intent) => {
    expect(detectProfileIntent(query)).toBe(intent);
  });

  it('does not intercept unrelated academic questions', () => {
    expect(detectProfileIntent('Show my timetable')).toBeNull();
  });

  it('builds a complete verified profile response', () => {
    const response = buildProfileResponse(student, 'profile');
    expect(response).toContain('Sumit Kumar');
    expect(response).toContain('1001');
    expect(response).toContain('101');
    expect(response).toContain('Computer Science');
    expect(response).toContain('BCA');
  });
});
