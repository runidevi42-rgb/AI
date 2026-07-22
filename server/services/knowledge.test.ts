import { describe, expect, it } from 'vitest';
import { detectIntent } from './knowledge.js';
import { normalizePhone } from './whatsapp.js';

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
