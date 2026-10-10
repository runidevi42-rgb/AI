import { describe, expect, it } from 'vitest';
import { interpretAdminPrompt } from './admin-prompt.js';

describe('interpretAdminPrompt', { timeout: 10000 }, () => {
  it('interprets notice addition for a specific semester and department', async () => {
    const prompt = 'Add a notice that the fifth-semester CSE students have a Computer Networks test on Monday at 10 AM.';
    const result = await interpretAdminPrompt(prompt);

    expect(result.action).toBe('insert');
    expect(result.target_resource).toBe('notices');
    expect(result.resource_label).toBe('Notices');
    expect(result.summary).toBeTruthy();
    expect(result.fields.length).toBeGreaterThan(0);
    expect(result.proposed_record).toBeDefined();
  });

  it('interprets timetable update request with day, time, and room', async () => {
    const prompt = 'Update the CSE timetable. Computer Networks is now from 10 to 11 AM with Mr Sharma in Room 204.';
    const result = await interpretAdminPrompt(prompt);

    expect(['insert', 'update']).toContain(result.action);
    expect(result.target_resource).toBe('timetables');
    expect(result.resource_label).toBe('Timetable');
    expect(result.summary).toContain('Computer Networks');
    expect(result.fields.some((f) => f.key === 'start_time')).toBe(true);
  });

  it('interprets new college event request', async () => {
    const prompt = 'Add a new college event called Technical Fest, scheduled for 20 November in the main auditorium.';
    const result = await interpretAdminPrompt(prompt);

    expect(result.action).toBe('insert');
    expect(result.target_resource).toBe('events');
    expect(result.resource_label).toBe('Events');
    expect(result.proposed_record?.title).toContain('Technical Fest');
  });

  it('interprets emergency contact addition', async () => {
    const prompt = 'Add an emergency contact for Campus Security at 9876543210 for safety assistance.';
    const result = await interpretAdminPrompt(prompt);

    expect(result.action).toBe('insert');
    expect(result.target_resource).toBe('emergency_contacts');
    expect(result.fields.some((f) => f.key === 'phone_number')).toBe(true);
  });

  it('requests clarification when the instruction is too ambiguous', async () => {
    const prompt = 'Update the thing for students tomorrow';
    const result = await interpretAdminPrompt(prompt);

    expect(result.action).toBe('clarification_needed');
    expect(result.clarification_question).toBeTruthy();
  });
});
