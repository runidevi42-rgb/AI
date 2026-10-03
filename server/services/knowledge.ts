import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { normalizePhone } from './whatsapp.js';
import { config } from '../config.js';
import { formatCollegeTime, getCurrentCollegeDateTime, timeToMinutes } from '../utils/college-time.js';

export type Intent = 'timetable' | 'assignments' | 'exams' | 'attendance' | 'faculty' | 'events' | 'placements' | 'emergency' | 'general';
export type ProfileIntent = 'name' | 'roll_number' | 'student_id' | 'department' | 'course' | 'semester' | 'whatsapp_number' | 'assistant_identity' | 'profile';

export interface StudentProfile {
  student_id: number;
  full_name: string;
  whatsapp_number: string;
  roll_number: number;
  department: string;
  course: string;
  semester: number;
  section?: string | null;
  batch_group?: string | null;
}

export const UNREGISTERED_REPLY = 'Your WhatsApp number is not registered with the college. Please contact the college administration.';
export const NO_INFORMATION_REPLY = 'I could not find any information for this request in the college database.';
export const NO_CLASSES_TODAY_REPLY = 'You have no more classes scheduled for today.';

export function detectProfileIntent(query: string): ProfileIntent | null {
  const normalized = query.toLowerCase().replace(/[?.!,'’]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\b(my profile|my details|profile details|student profile|student details|show (me )?my profile|show (me )?my details)\b/.test(normalized)) return 'profile';
  if (/\b(my student id|student id|student number)\b/.test(normalized)) return 'student_id';
  if (/\b(my roll number|my roll no|roll number|roll no)\b/.test(normalized)) return 'roll_number';
  if (/\b(what is my name|what s my name|tell me my name|who am i|my name|mera naam|mera nam|naam kya hai|mera naam kya hai)\b/.test(normalized)) return 'name';
  if (/\b(what is your name|what s your name|who are you|aap kaun ho|tum kaun ho)\b/.test(normalized)) return 'assistant_identity';
  if (/\b(my department|which department am i in|what department am i in)\b/.test(normalized)) return 'department';
  if (/\b(my course|which course am i in|what course am i in)\b/.test(normalized)) return 'course';
  if (/\b(my semester|which semester am i in|what semester am i in)\b/.test(normalized)) return 'semester';
  if (/\b(my whatsapp number|my phone number|my mobile number)\b/.test(normalized)) return 'whatsapp_number';
  return null;
}

export function buildProfileResponse(student: StudentProfile, intent: ProfileIntent) {
  if (intent === 'assistant_identity') return 'I am CampusMate AI, your friendly college assistant. I can help with your college information, attendance, timetable, assignments, exams, notices, and study questions.';
  if (intent === 'name') return `Your name is ${student.full_name}.`;
  if (intent === 'roll_number') return `Your roll number is ${student.roll_number}.`;
  if (intent === 'student_id') return `Your student ID is ${student.student_id}.`;
  if (intent === 'department') return `Your department is ${student.department}.`;
  if (intent === 'course') return `Your course is ${student.course}.`;
  if (intent === 'semester') return `You are in semester ${student.semester}.`;
  if (intent === 'whatsapp_number') return `Your registered WhatsApp number is ${student.whatsapp_number}.`;
  return [
    '*Your student profile*',
    `Name: ${student.full_name}`,
    `Student ID: ${student.student_id}`,
    `Roll number: ${student.roll_number}`,
    `Course: ${student.course}`,
    `Department: ${student.department}`,
    `Semester: ${student.semester}`,
  ].join('\n');
}

export function detectIntent(query: string): Intent {
  const q = query.toLowerCase();
  if (/time\s?table|class|lecture|schedule today/.test(q)) return 'timetable';
  if (/assignment|deadline|submission|homework/.test(q)) return 'assignments';
  if (/exam|test|assessment|hall ticket/.test(q)) return 'exams';
  if (/attendance|present|absent|percentage/.test(q)) return 'attendance';
  if (/faculty|teacher|professor|hod|department/.test(q)) return 'faculty';
  if (/event|holiday|fest|workshop|seminar/.test(q)) return 'events';
  if (/placement|internship|job|career|company/.test(q)) return 'placements';
  if (/emergency|ambulance|security|help|ragging|contact/.test(q)) return 'emergency';
  return 'general';
}

export async function findStudent(phone: string) {
  const normalizedPhone = normalizePhone(phone);
  const lookupPhones = normalizedPhone.startsWith('91') && normalizedPhone.length === 12
    ? [normalizedPhone, normalizedPhone.slice(2)]
    : [normalizedPhone];

  const baseSelect = 'student_id,full_name,whatsapp_number,roll_number,department,course,semester';
  let result = await supabase.from('students').select(`${baseSelect},section,batch_group`).in('whatsapp_number', lookupPhones).maybeSingle();
  if (result.error?.code === '42703') result = await supabase.from('students').select(baseSelect).in('whatsapp_number', lookupPhones).maybeSingle();
  const { data, error } = result;

  if (error) {
    logger.error({
      senderSuffix: normalizedPhone.slice(-4),
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    }, 'Student lookup failed');
    throw error;
  }

  logger.info({
    senderSuffix: normalizedPhone.slice(-4),
    matched: Boolean(data),
    studentId: data?.student_id,
  }, data ? 'Registered student matched' : 'No registered student matched');

  return data as StudentProfile | null;
}

export async function findStudentById(studentId: number) {
  const baseSelect = 'student_id,full_name,whatsapp_number,roll_number,department,course,semester';
  let result = await supabase.from('students').select(`${baseSelect},section,batch_group`).eq('student_id', studentId).maybeSingle();
  if (result.error?.code === '42703') result = await supabase.from('students').select(baseSelect).eq('student_id', studentId).maybeSingle();
  const { data, error } = result;
  if (error) throw error;
  return data as StudentProfile | null;
}

function displayTime(value: string | null | undefined) { return formatCollegeTime(value); }

export function timetableRowsForStudent(rows: any[], student: StudentProfile, includeBreaks = false) {
  const studentGroup = (student as StudentProfile & { batch_group?: string; batch?: string; section?: string });
  const group = studentGroup.batch_group || studentGroup.batch || studentGroup.section;
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (row.department && student.department && String(row.department).toLowerCase() !== String(student.department).toLowerCase()) return false;
    if (row.course && student.course && String(row.course).toLowerCase() !== String(student.course).toLowerCase()) return false;
    if (row.semester != null && student.semester != null && Number(row.semester) !== Number(student.semester)) return false;
    const rowGroup = row.batch_group || row.batch || row.section;
    // A batch-specific record is not safe to show until the authenticated student
    // has a matching group in the students table. Never guess a section from roll no.
    if (rowGroup && (!group || String(rowGroup).toLowerCase() !== String(group).toLowerCase())) return false;
    if (!includeBreaks && (row.is_recess || /^recess|no class$/i.test(String(row.subject || '').trim()))) return false;
    if (timeToMinutes(row.start_time) === null || timeToMinutes(row.end_time) === null) return false;
    const key = [row.day_of_week, row.start_time, row.end_time, row.subject, row.teacher, row.room, row.batch_group].map(String).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function queryTimetableRows(student: StudentProfile, day?: string, includeBreaks = false) {
  const run = async (table: 'timetables' | 'timetable') => {
    let query = supabase.from(table).select('*').order('day_of_week').order('start_time');
    if (day) query = query.ilike('day_of_week', day);
    return query.limit(200);
  };
  let result = await run('timetables');
  if (isMissingRelation(result.error)) result = await run('timetable');
  if (isMissingRelation(result.error)) return [];
  if (result.error) throw result.error;
  return timetableRowsForStudent(result.data ?? [], student, includeBreaks);
}

export async function getTodayTimetable(student: StudentProfile, now = new Date()) {
  return queryTimetableRows(student, getCurrentCollegeDateTime(now).weekday);
}

export async function getStudentTimetable(student: StudentProfile) {
  return queryTimetableRows(student);
}

export async function getNextClass(student: StudentProfile, now = new Date()) {
  const collegeNow = getCurrentCollegeDateTime(now);
  const rows = await getTodayTimetable(student, now);
  const currentMinutes = collegeNow.hour * 60 + collegeNow.minute;
  const selected = rows.filter((row) => (timeToMinutes(row.start_time) ?? -1) > currentMinutes)
    .sort((a, b) => (timeToMinutes(a.start_time) ?? 0) - (timeToMinutes(b.start_time) ?? 0));
  if (config.NODE_ENV === 'development') logger.info({
    studentId: student.student_id,
    department: student.department,
    course: student.course,
    semester: student.semester,
    currentDate: collegeNow.date,
    currentTime: collegeNow.time,
    timezone: collegeNow.timezone,
    selectedRecords: selected.map((row) => ({ day: row.day_of_week, start: row.start_time, end: row.end_time, subject: row.subject, room: row.room ?? null })),
  }, 'Next timetable record selected');
  return selected[0] ?? null;
}

export async function getCurrentClass(student: StudentProfile, now = new Date()) {
  const collegeNow = getCurrentCollegeDateTime(now);
  const currentMinutes = collegeNow.hour * 60 + collegeNow.minute;
  return (await getTodayTimetable(student, now)).find((row) => {
    const start = timeToMinutes(row.start_time);
    const end = timeToMinutes(row.end_time);
    return start !== null && end !== null && start <= currentMinutes && currentMinutes < end;
  }) ?? null;
}

export async function getSubjectTimetable(student: StudentProfile, subject: string) {
  const normalized = subject.trim().toLowerCase();
  return (await queryTimetableRows(student)).filter((row) => String(row.subject || '').toLowerCase().includes(normalized));
}

export async function getBreakTimetable(student: StudentProfile, day?: string) {
  return (await queryTimetableRows(student, day, true)).filter((row) => row.is_recess || /^recess|break$/i.test(String(row.subject || '').trim()));
}

function requestedWeekday(query: string) {
  const match = query.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  return match ? match[1] : undefined;
}

async function getAttendancePercentage(studentId: number) {
  const direct = await supabase.from('student_attendance_summary').select('student_id,attendance_percentage').eq('student_id', studentId).maybeSingle();
  if (!isMissingRelation(direct.error)) {
    if (direct.error) throw direct.error;
    return direct.data?.attendance_percentage == null ? null : Number(direct.data.attendance_percentage);
  }
  const legacy = await supabase.from('attendance_summary').select('*').eq('student_id', studentId);
  if (legacy.error) throw legacy.error;
  const rows = legacy.data ?? [];
  if (!rows.length) return null;
  const directLegacy = rows.find((row: any) => row.attendance_percentage != null);
  if (directLegacy) return Number(directLegacy.attendance_percentage);
  const totals = rows.reduce((a, row: any) => ({ present: a.present + Number(row.present_classes || 0), total: a.total + Number(row.total_classes || 0) }), { present: 0, total: 0 });
  return totals.total ? Math.round(totals.present / totals.total * 100) : null;
}

export async function fetchStructuredAnswer(student: StudentProfile, intent: 'ATTENDANCE' | 'TIMETABLE' | 'ASSIGNMENT' | 'EXAM' | 'NOTICE' | 'EMERGENCY_CONTACT', _query = '') {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const scope = { department: student.department, semester: student.semester };
  let records: any[] = [];
  if (intent === 'ATTENDANCE') {
    const result = await supabase.from('attendance_summary').select('subject,total_classes,present_classes,percentage').eq('student_id', student.student_id).order('subject');
    if (result.error) throw result.error;
    records = result.data ?? [];
    if (!records.length) return NO_INFORMATION_REPLY;
    const overall = records.reduce((a, r) => ({ present: a.present + Number(r.present_classes || 0), total: a.total + Number(r.total_classes || 0) }), { present: 0, total: 0 });
    const overallPct = overall.total ? Math.round(overall.present / overall.total * 1000) / 10 : 0;
    return `Your current attendance is ${overallPct}%.\n` + records.map((r) => `• ${r.subject}: ${r.percentage}%`).join('\n');
  }
  if (intent === 'TIMETABLE') {
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: config.COLLEGE_TIMEZONE }).format(now);
    const result = await supabase.from('timetables').select('day_of_week,start_time,end_time,subject,room').match(scope).ilike('day_of_week', day).order('start_time');
    if (result.error) throw result.error;
    records = result.data ?? [];
    if (!records.length) return NO_INFORMATION_REPLY;
    return `Your classes today are:\n${records.map((r) => `• ${r.subject} — ${displayTime(r.start_time)}${r.room ? ` (${r.room})` : ''}`).join('\n')}`;
  }
  if (intent === 'ASSIGNMENT') {
    const result = await supabase.from('assignments').select('title,subject,due_at').match(scope).gte('due_at', now.toISOString()).order('due_at').limit(10);
    if (result.error) throw result.error;
    records = result.data ?? [];
    return records.length ? records.map((r) => `• ${r.title} — ${r.subject}, due ${new Date(r.due_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`).join('\n') : NO_INFORMATION_REPLY;
  }
  if (intent === 'EXAM') {
    const result = await supabase.from('exams').select('title,subject,exam_date,start_time').match(scope).gte('exam_date', today).order('exam_date').limit(10);
    if (result.error) throw result.error;
    records = result.data ?? [];
    return records.length ? records.map((r) => `• ${r.subject || r.title} — ${r.exam_date}${r.start_time ? ` at ${displayTime(r.start_time)}` : ''}`).join('\n') : NO_INFORMATION_REPLY;
  }
  if (intent === 'NOTICE') {
    const result = await supabase.from('notices').select('title,content,published_at,expires_at').lte('published_at', now.toISOString()).or(`expires_at.is.null,expires_at.gte.${now.toISOString()}`).order('published_at', { ascending: false }).limit(8);
    if (result.error) throw result.error;
    records = result.data ?? [];
    return records.length ? records.map((r) => `• ${r.title}\n${r.content}`).join('\n') : NO_INFORMATION_REPLY;
  }
  const result = await supabase.from('emergency_contacts').select('contact_name,phone_number,role_or_service').eq('active', true).order('priority').limit(20);
  if (result.error) throw result.error;
  records = result.data ?? [];
  return records.length ? records.map((r) => `• ${r.contact_name}: ${r.phone_number} (${r.role_or_service})`).join('\n') : NO_INFORMATION_REPLY;
}

function isMissingRelation(error: { code?: string } | null | undefined) {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

export async function fetchCompleteStructuredAnswer(student: StudentProfile, intent: 'ATTENDANCE' | 'TIMETABLE' | 'LUNCH_BREAK' | 'ASSIGNMENT' | 'EXAM' | 'NOTICE' | 'EMERGENCY_CONTACT' | 'FACULTY_CONTACT', query = '') {
  const q = query.toLowerCase();
  const now = new Date();
  const collegeNow = getCurrentCollegeDateTime(now);
  const today = collegeNow.date;
  const scope = { department: student.department, semester: student.semester };
  const full = /\b(full|all|complete|entire|subject wise|subject-wise)\b/.test(q);
  if (intent === 'ATTENDANCE') {
    const attendance = await getAttendancePercentage(student.student_id);
    return attendance === null ? NO_INFORMATION_REPLY : `Your current attendance is ${attendance}%.`;
  }
  if (intent === 'LUNCH_BREAK') {
    const requestedDay = requestedWeekday(q);
    const breaks = await getBreakTimetable(student, requestedDay);
    return breaks.length
      ? breaks.map((row) => `Lunch/recess is on ${row.day_of_week} from ${displayTime(row.start_time)} to ${displayTime(row.end_time)}.`).join('\n')
      : NO_INFORMATION_REPLY;
  }
  if (intent === 'TIMETABLE') {
    const day = collegeNow.weekday;
    const nextClass = /next class|next lecture|next period|what do i have next|which class.*next|after this class|agla class|meri next class|aaj next class/.test(q);
    const currentClass = /what class.*(now|currently)|which class.*(now|currently)|current class|class.*abhi|abhi.*class/.test(q);
    if (currentClass) {
      const row = await getCurrentClass(student, now);
      return row ? `Your current class is ${row.subject} until ${displayTime(row.end_time)}${row.room ? ` in ${row.room}` : ''}.` : 'There is no class happening right now.';
    }
    if (nextClass) {
      const row = await getNextClass(student, now);
      if (!row) return NO_CLASSES_TODAY_REPLY;
      const room = row.room ? ` in ${row.room}` : /\b(room|where)\b/.test(q) ? ' (room information is not available)' : '';
      return `Your next class is ${row.subject} at ${displayTime(row.start_time)}${room}.`;
    }
    const asksSubject = /\b(when|what).*(class|lecture|period)\b/.test(q) && !/\b(today|aaj|schedule|timetable)\b/.test(q);
    if (asksSubject) {
      const allRows = await queryTimetableRows(student);
      const subject = [...new Set(allRows.map((row) => String(row.subject || '').trim()).filter(Boolean))]
        .sort((a, b) => b.length - a.length)
        .find((value) => q.includes(value.toLowerCase()));
      if (subject) {
        const rows = await getSubjectTimetable(student, subject);
        return rows.length
          ? `${subject} timetable:\n${rows.map((row) => `- ${row.day_of_week}: ${displayTime(row.start_time)}-${displayTime(row.end_time)}${row.room ? ` (${row.room})` : ''}`).join('\n')}`
          : NO_INFORMATION_REPLY;
      }
      return NO_INFORMATION_REPLY;
    }
    // The deployed timetable table is intentionally read with `*` because existing
    // installations use different optional columns (for example, some have `room`
    // while the current table has `teacher`, `batch_group`, and `is_recess`). This
    // keeps the chatbot compatible with the real schema without inventing columns.
    const rows = !full && /today|aaj|schedule/.test(q)
      ? await getTodayTimetable(student, now)
      : await queryTimetableRows(student);
    if (config.NODE_ENV === 'development') logger.info({
      studentId: student.student_id,
      department: student.department,
      course: student.course,
      semester: student.semester,
      currentDate: collegeNow.date,
      currentTime: collegeNow.time,
      timezone: collegeNow.timezone,
      selectedRecords: rows.map((row) => ({ day: row.day_of_week, start: row.start_time, end: row.end_time, subject: row.subject, room: row.room ?? null })),
    }, 'Timetable records selected');
    if (!rows.length) return NO_INFORMATION_REPLY;
    return `${full ? 'Your complete timetable is:' : `Your classes on ${day} are:`}\n` + rows.map((row) => `- ${row.day_of_week}: ${row.subject} ${displayTime(row.start_time)}-${displayTime(row.end_time)}${row.room ? ` (${row.room})` : ''}`).join('\n');
  }
  if (intent === 'ASSIGNMENT') {
    let queryBuilder = supabase.from('assignments').select('title,subject,description,due_at').match(scope).order('due_at');
    if (!full && /pending|upcoming|due|next/.test(q)) queryBuilder = queryBuilder.gte('due_at', now.toISOString());
    const result = await queryBuilder.limit(!full && /next|upcoming/.test(q) ? 1 : 50);
    if (result.error) throw result.error;
    const rows = result.data ?? [];
    return rows.length ? rows.map((row) => `- ${row.title} - ${row.subject}, due ${new Date(row.due_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: config.COLLEGE_TIMEZONE })}${row.description ? `\n  ${row.description}` : ''}`).join('\n') : NO_INFORMATION_REPLY;
  }
  if (intent === 'EXAM') {
    let queryBuilder = supabase.from('exams').select('title,subject,exam_date,start_time,end_time,instructions').match(scope).order('exam_date').order('start_time');
    if (!full && /next|upcoming|kab/.test(q)) queryBuilder = queryBuilder.gte('exam_date', today);
    const result = await queryBuilder.limit(!full && /next|upcoming|kab/.test(q) ? 1 : 50);
    if (result.error) throw result.error;
    const rows = result.data ?? [];
    return rows.length ? rows.map((row) => `- ${row.subject || row.title} - ${row.exam_date} ${displayTime(row.start_time)}-${displayTime(row.end_time)}${row.instructions ? `\n  ${row.instructions}` : ''}`).join('\n') : NO_INFORMATION_REPLY;
  }
  if (intent === 'NOTICE') {
    const result = await supabase.from('notices').select('title,content,category,published_at,expires_at,priority').lte('published_at', now.toISOString()).or(`expires_at.is.null,expires_at.gte.${now.toISOString()}`).order('published_at', { ascending: false }).limit(full ? 50 : 8);
    if (result.error) throw result.error;
    const rows = result.data ?? [];
    return rows.length ? rows.map((row) => `- ${row.title} [${row.priority}]\n${row.content}`).join('\n') : NO_INFORMATION_REPLY;
  }
  if (intent === 'FACULTY_CONTACT') {
    const result = await supabase.from('faculty').select('*').eq('active', true).limit(100);
    if (isMissingRelation(result.error)) return 'I don\'t have a faculty contact for that subject yet.';
    if (result.error) throw result.error;
    const rows = result.data ?? [];
    if (!rows.length) return 'I don\'t have a faculty contact for that subject yet.';
    const subject = rows.flatMap((row: any) => {
      const values = Array.isArray(row.subjects) ? row.subjects : [row.subjects];
      return values.filter(Boolean).map((value: unknown) => String(value));
    }).sort((a, b) => b.length - a.length).find((value) => q.includes(value.toLowerCase()));
    const matching = subject
      ? rows.filter((row: any) => String(Array.isArray(row.subjects) ? row.subjects.join(' ') : row.subjects || '').toLowerCase().includes(subject.toLowerCase()))
      : rows.filter((row: any) => !row.department || row.department.toLowerCase() === student.department.toLowerCase() || row.department.toLowerCase() === 'general');
    if (!matching.length) return 'I don\'t have a faculty contact for that subject yet.';
    return matching.map((row: any) => `- ${row.full_name || row.faculty_name}${row.designation ? ` (${row.designation})` : ''}${row.email ? `\n  Email: ${row.email}` : ''}${row.phone ? `\n  Phone: ${row.phone}` : ''}${row.office_room || row.office ? `\n  Office: ${row.office_room || row.office}` : ''}`).join('\n');
  }
  const result = await supabase.from('emergency_contacts').select('contact_name,phone_number,role_or_service,emergency_type,description,priority,contact_type').eq('active', true).order('priority').limit(50);
  if (result.error) throw result.error;
  const allRows = result.data ?? [];
  const specific = /\b(ambulance|police|fire|security|ragging)\b/.test(q);
  const rows = specific ? allRows.filter((row) => `${row.contact_name} ${row.role_or_service} ${row.emergency_type}`.toLowerCase().includes(q.match(/ambulance|police|fire|security|ragging/)?.[0] ?? '')) : allRows;
  return rows.length ? rows.map((row) => `- ${row.contact_name}: ${row.phone_number} (${row.role_or_service})${row.description ? `\n  ${row.description}` : ''}`).join('\n') : NO_INFORMATION_REPLY;
}

export async function fetchGeneralCollegeAnswer() {
  const [{ data: info, error: infoError }, { data: faqs, error: faqError }] = await Promise.all([
    supabase.from('college_info').select('title,content').limit(20),
    supabase.from('faqs').select('question,answer').limit(20),
  ]);
  if (infoError) throw infoError;
  if (faqError) throw faqError;
  const records = [...(info ?? []), ...(faqs ?? [])];
  return records.length ? records.map((r: any) => r.title ? `• ${r.title}: ${r.content}` : `• ${r.question}: ${r.answer}`).join('\n') : NO_INFORMATION_REPLY;
}

function compact(data: unknown) {
  return JSON.parse(JSON.stringify(data, (_key, value) => value === null || value === '' ? undefined : value));
}

export async function retrieveContext(student: StudentProfile, query: string) {
  const intent = detectIntent(query);
  const today = new Date();
  const collegeNow = getCurrentCollegeDateTime(today);
  const date = collegeNow.date;
  const scope = { department: student.department, semester: student.semester };
  let records: unknown[] = [];

  if (intent === 'timetable') {
    const { data } = await supabase.from('timetables').select('*').ilike('day_of_week', collegeNow.weekday).order('start_time');
    records = data ?? [];
  } else if (intent === 'assignments') {
    const { data } = await supabase.from('assignments').select('title,subject,description,due_at').eq('department', scope.department).eq('semester', scope.semester).gte('due_at', today.toISOString()).order('due_at').limit(10);
    records = data ?? [];
  } else if (intent === 'exams') {
    const { data } = await supabase.from('exams').select('title,subject,exam_date,start_time,end_time,instructions').eq('department', scope.department).eq('semester', scope.semester).gte('exam_date', date).order('exam_date').limit(12);
    records = data ?? [];
  } else if (intent === 'attendance') {
    const { data } = await supabase.from('attendance_summary').select('subject,total_classes,present_classes,percentage').eq('student_id', student.student_id).order('subject');
    records = data ?? [];
  } else if (intent === 'faculty') {
    const { data } = await supabase.from('faculty').select('full_name,designation,department,email,phone,office,office_hours').eq('active', true).or(`department.eq.${scope.department},department.eq.General`).limit(20);
    records = data ?? [];
  } else if (intent === 'events') {
    const [{ data: events }, { data: notices }] = await Promise.all([
      supabase.from('events').select('title,description,start_at,end_at,venue,event_type').gte('end_at', today.toISOString()).order('start_at').limit(10),
      supabase.from('notices').select('title,content,category,published_at,expires_at').lte('published_at', today.toISOString()).or(`expires_at.is.null,expires_at.gte.${today.toISOString()}`).order('published_at', { ascending: false }).limit(8),
    ]);
    records = [...(events ?? []), ...(notices ?? [])];
  } else if (intent === 'placements') {
    const { data } = await supabase.from('notices').select('title,content,category,published_at,expires_at').in('category', ['placement', 'internship']).or(`expires_at.is.null,expires_at.gte.${today.toISOString()}`).order('published_at', { ascending: false }).limit(10);
    records = data ?? [];
  } else if (intent === 'emergency') {
    const { data } = await supabase.from('emergency_contacts').select('contact_name,phone_number,role_or_service,emergency_type,description,priority,contact_type').eq('active', true).order('priority').limit(30);
    records = data ?? [];
  } else {
    const [{ data: info }, { data: faq }] = await Promise.all([
      supabase.from('college_info').select('title,content,category').limit(20),
      supabase.from('faqs').select('question,answer,category').limit(20),
    ]);
    records = [...(info ?? []), ...(faq ?? [])];
  }

  return compact({
    intent,
    currentDate: `${collegeNow.weekday}, ${collegeNow.date}`,
    student: { name: student.full_name, rollNumber: student.roll_number, department: student.department, course: student.course, semester: student.semester },
    records,
  });
}
