import { describe, expect, it } from 'vitest';
import { validatedPayload } from './admin-validation.js';

describe('admin resource validation', () => {
  it('normalizes a valid attendance record', () => {
    expect(validatedPayload('attendance', {
      student_id: '101', subject: 'Mathematics', attendance_date: '2026-08-21', status: 'present', ignored: true,
    })).toEqual({ student_id: 101, subject: 'Mathematics', attendance_date: '2026-08-21', status: 'present' });
  });

  it('rejects unsupported attendance states', () => {
    expect(() => validatedPayload('attendance', {
      student_id: 101, subject: 'Mathematics', attendance_date: '2026-08-21', status: 'unknown',
    })).toThrow();
  });

  it('keeps only supported FAQ fields', () => {
    expect(validatedPayload('faqs', {
      question: 'Where is the library?', answer: 'Block A', category: 'campus', active: true,
    })).toEqual({ question: 'Where is the library?', answer: 'Block A', category: 'campus' });
  });

  it('prepares a future notification for the scheduler', () => {
    const payload = validatedPayload('notifications', {
      title: 'Exam reminder', message: 'Check the exam schedule.', type: 'academic', audience: 'selected',
      student_ids: ['101', 102], department: null, semester: null, scheduled_at: '2099-08-21T10:00:00.000Z', status: 'sent',
    });
    expect(payload).toMatchObject({ student_ids: [101, 102], status: 'scheduled' });
  });

  it('rejects a selected notification without student IDs', () => {
    expect(() => validatedPayload('notifications', {
      title: 'Selected notice', message: 'Important update', type: 'notice', audience: 'selected', student_ids: [],
    })).toThrow();
  });

  it('uses free Web Push as the default notification channel', () => {
    expect(validatedPayload('notifications', {
      title: 'General notice', message: 'Library hours changed.', type: 'notice', audience: 'all', student_ids: [],
    })).toMatchObject({ delivery_channel: 'web_push', status: 'draft' });
  });
  it('strips obsolete assignment fields', () => {
    const payload = validatedPayload('assignments', {
      title: 'Database exercise',
      subject: 'DBMS',
      description: 'Complete normalization questions.',
      department: 'Computer Science',
      semester: 2,
      due_at: '2026-08-01T12:00:00.000Z',
      section: 'A',
      maximum_marks: 20,
      max_marks: 20,
      submission_link: 'https://example.com',
      submission_url: 'https://example.com',
    });
    expect(payload).toEqual({
      title: 'Database exercise',
      subject: 'DBMS',
      description: 'Complete normalization questions.',
      department: 'Computer Science',
      semester: 2,
      due_at: '2026-08-01T12:00:00.000Z',
    });
  });

  it('strips the exam location field', () => {
    const payload = validatedPayload('exams', {
      title: 'Internal assessment',
      subject: 'DBMS',
      department: 'Computer Science',
      semester: 2,
      exam_date: '2026-08-10',
      start_time: '10:00',
      end_time: '12:00',
      instructions: 'Bring your student ID.',
      room: 'A-101',
    });
    expect(payload).not.toHaveProperty('room');
  });

  it.each(['100', '101', '102', '112', '+91 98765 43210'])('accepts emergency phone %s', (phone_number) => {
    expect(() => validatedPayload('emergency_contacts', {
      contact_name: 'Emergency contact',
      phone_number,
      role_or_service: 'Urgent service',
      emergency_type: 'Other urgent situation',
      description: 'Use only for an urgent situation.',
      priority: 1,
      active: true,
      contact_type: 'public_service',
    })).not.toThrow();
  });

  it('rejects an invalid emergency phone', () => {
    expect(() => validatedPayload('emergency_contacts', {
      contact_name: 'Emergency contact',
      phone_number: 'call-now',
      role_or_service: 'Urgent service',
      emergency_type: 'Other urgent situation',
      description: 'Use only for an urgent situation.',
      priority: 1,
      active: true,
      contact_type: 'public_service',
    })).toThrow();
  });

  it('strips the obsolete college information slot', () => {
    const payload = validatedPayload('college_info', {
      title: 'Campus hours',
      content: 'Open from 8 AM.',
      category: 'campus',
      unique_key_slot: 'campus-hours',
      key: 'campus-hours',
    });
    expect(payload).toEqual({ title: 'Campus hours', content: 'Open from 8 AM.', category: 'campus' });
  });
});
