export type ChatbotIntent =
  | 'GREETING' | 'ATTENDANCE' | 'TIMETABLE' | 'ASSIGNMENT' | 'EXAM'
  | 'NOTICE' | 'EMERGENCY_CONTACT' | 'GENERAL_COLLEGE' | 'STUDY_AI' | 'UNKNOWN';

export function detectChatbotIntent(input: string): ChatbotIntent {
  const q = input.toLowerCase().replace(/[^a-z0-9\s?]/g, ' ');
  if (/\b(hi|hello|hey|namaste|good morning|good afternoon|good evening)\b/.test(q)) return 'GREETING';
  if (/\b(attendance|present|absent|percentage)\b/.test(q)) return 'ATTENDANCE';
  if (/\b(timetable|time table|class|classes|lecture|schedule)\b/.test(q)) return 'TIMETABLE';
  if (/\b(assignment|homework|submission|deadline)\b/.test(q)) return 'ASSIGNMENT';
  if (/\b(exam|examination|test|assessment|hall ticket)\b/.test(q)) return 'EXAM';
  if (/\b(notice|announcement|circular|latest update|new update)\b/.test(q)) return 'NOTICE';
  if (/\b(emergency|ambulance|police|fire|security|ragging|important contact|emergency contact)\b/.test(q)) return 'EMERGENCY_CONTACT';
  if (/\b(explain|define|what is|how does|difference between|solve)\b/.test(q)) return 'STUDY_AI';
  if (/\b(college|campus|library|admission|fee|office|certificate|holiday|course|department)\b/.test(q)) return 'GENERAL_COLLEGE';
  return 'UNKNOWN';
}

