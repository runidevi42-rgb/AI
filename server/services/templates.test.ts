import { describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { resolveTemplate, TemplateConfigurationError, type WhatsAppTemplateKind } from './templates.js';

const source = {
  ...config,
  WHATSAPP_TIMETABLE_TEMPLATE: 'daily_timetable',
  WHATSAPP_TIMETABLE_UPDATE_TEMPLATE: 'timetable_update',
  WHATSAPP_ASSIGNMENT_TEMPLATE: 'assignment_due',
  WHATSAPP_EXAM_TEMPLATE: 'exam_upcoming',
  WHATSAPP_EVENT_TEMPLATE: 'event_upcoming',
  WHATSAPP_NOTIFICATION_TEMPLATE: 'campus_notice',
  WHATSAPP_TEMPLATE_LANGUAGE: 'en_US',
};

describe('approved WhatsApp templates', () => {
  it.each<[WhatsAppTemplateKind, string, string[]]>([
    ['timetable', 'daily_timetable', ['Asha', '22 Aug 2026', '09:00 - DBMS']],
    ['timetable_update', 'timetable_update', ['Monday', '09:00', 'DBMS', 'A-101']],
    ['assignment', 'assignment_due', ['Normalization', 'DBMS', '23 Aug 2026, 5:00 pm']],
    ['exam', 'exam_upcoming', ['Internal Exam', 'DBMS', '25 Aug 2026', '10:00']],
    ['event', 'event_upcoming', ['Orientation', '23 Aug 2026, 9:00 am', 'Auditorium']],
    ['notification', 'campus_notice', ['Asha', 'Holiday', 'Campus is closed.']],
  ])('selects %s and preserves parameter order', (kind, expectedName, parameters) => {
    expect(resolveTemplate(kind, parameters, source)).toEqual({ kind, name: expectedName, language: 'en_US', parameters });
  });

  it('returns a clear configuration error for a missing template', () => {
    expect(() => resolveTemplate('exam', ['Exam', 'DBMS', '25 Aug', '10:00'], { ...source, WHATSAPP_EXAM_TEMPLATE: '' }))
      .toThrow(TemplateConfigurationError);
  });

  it('rejects an incorrect parameter count before delivery', () => {
    expect(() => resolveTemplate('notification', ['Title', 'Message'], source)).toThrow(/exactly 3/);
  });
});
