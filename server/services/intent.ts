export type ChatbotIntent =
  | 'GREETING' | 'THANKS' | 'GOODBYE' | 'ATTENDANCE' | 'TIMETABLE' | 'ASSIGNMENT' | 'EXAM'
  | 'NOTICE' | 'EMERGENCY_CONTACT' | 'FACULTY_CONTACT' | 'GENERAL_COLLEGE' | 'STUDY_AI' | 'UNKNOWN';

export function detectChatbotIntent(input: string): ChatbotIntent {
  const q = input.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s?]/g, ' ');
  if (/\b(hi|hello|hey|namaste|good morning|good afternoon|good evening)\b/.test(q)) return 'GREETING';
  if (/\b(thanks|thank you|thx|dhanyavaad|shukriya)\b/.test(q)) return 'THANKS';
  if (/\b(bye|goodbye|see you|see ya|phir milenge)\b/.test(q)) return 'GOODBYE';
  if (/\b(attendance|present|absent|percentage|meri attendance|meri hazri|kitni attendance)\b/.test(q)) return 'ATTENDANCE';
  if (/\b(next class|next lecture|next period|what do i have next|which class.*next|after this class|agla class|next\s+class|next\s+lecture|next\s+period|timetable|time table|class|classes|lecture|schedule|aaj.*(class|timetable|schedule)|mera timetable|meri next class|aaj next class)\b/.test(q)) return 'TIMETABLE';
  if (/\b(assignment|homework|submission|deadline|pending.*assignment|koi assignment)\b/.test(q)) return 'ASSIGNMENT';
  if (/\b(exam|examination|test|assessment|hall ticket|next exam|mera exam|exam kab)\b/.test(q)) return 'EXAM';
  if (/\b(notice|announcement|circular|latest update|new update|koi new notice|naya notice)\b/.test(q)) return 'NOTICE';
  if (/\b(emergency|ambulance|police|fire|security|ragging|important contact|emergency contact|emergency number|administration.*emergency)\b/.test(q)) return 'EMERGENCY_CONTACT';
  if (/\b(faculty|teacher|professor|lecturer|hod|who teaches|teacher.*contact|faculty.*contact|contact.*teacher)\b/.test(q)) return 'FACULTY_CONTACT';
  if (/\b(explain|define|what is|how does|difference between|solve)\b/.test(q)) return 'STUDY_AI';
  if (/\b(college|campus|library|admission|fee|office|certificate|holiday|course|department)\b/.test(q)) return 'GENERAL_COLLEGE';
  return 'UNKNOWN';
}
