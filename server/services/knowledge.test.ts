import { describe, expect, it } from 'vitest';
import { buildProfileResponse, detectIntent, detectProfileIntent, type StudentProfile } from './knowledge.js';
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
