import { format, startOfDay } from 'date-fns';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { normalizePhone } from './whatsapp.js';
import { config } from '../config.js';

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
}

export const UNREGISTERED_REPLY = 'Your WhatsApp number is not registered with the college. Please contact the college administration.';
export const NO_INFORMATION_REPLY = 'I could not find any information for this request in the college database.';

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

  const { data, error } = await supabase
    .from('students')
    .select('student_id,full_name,whatsapp_number,roll_number,department,course,semester')
    .in('whatsapp_number', lookupPhones)
    .maybeSingle();

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
  const { data, error } = await supabase.from('students')
    .select('student_id,full_name,whatsapp_number,roll_number,department,course,semester')
    .eq('student_id', studentId).maybeSingle();
  if (error) throw error;
  return data as StudentProfile | null;
}

function displayTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : '';
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

export async function fetchCompleteStructuredAnswer(student: StudentProfile, intent: 'ATTENDANCE' | 'TIMETABLE' | 'ASSIGNMENT' | 'EXAM' | 'NOTICE' | 'EMERGENCY_CONTACT', query = '') {
  const q = query.toLowerCase();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const scope = { department: student.department, semester: student.semester };
  const full = /\b(full|all|complete|entire|subject wise|subject-wise)\b/.test(q);
  if (intent === 'ATTENDANCE') {
    const result = await supabase.from('attendance_summary').select('subject,total_classes,present_classes,percentage').eq('student_id', student.student_id).order('subject');
    if (result.error) throw result.error;
    const rows = result.data ?? [];
    if (!rows.length) return NO_INFORMATION_REPLY;
    const lowest = /lowest|low|kam/.test(q);
    const ordered = lowest ? [...rows].sort((a, b) => Number(a.percentage) - Number(b.percentage)) : rows;
    if (lowest) return `Your lowest attendance is ${ordered[0].subject}: ${ordered[0].percentage}%.`;
    const totals = rows.reduce((a, row) => ({ present: a.present + Number(row.present_classes || 0), total: a.total + Number(row.total_classes || 0) }), { present: 0, total: 0 });
    const overall = totals.total ? Math.round(totals.present / totals.total * 1000) / 10 : 0;
    return `Your current attendance is ${overall}%.\n` + ordered.map((row) => `- ${row.subject}: ${row.percentage}% (${row.present_classes}/${row.total_classes} classes)`).join('\n');
  }
  if (intent === 'TIMETABLE') {
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: config.COLLEGE_TIMEZONE }).format(now);
    const nextClass = /next class|which class.*next|agla class/.test(q);
    let queryBuilder = supabase.from('timetables').select('day_of_week,start_time,end_time,subject,room').match(scope).order('day_of_week').order('start_time');
    if (!full && !nextClass && /today|aaj|schedule/.test(q)) queryBuilder = queryBuilder.ilike('day_of_week', day);
    const result = await queryBuilder.limit(50);
    if (isMissingRelation(result.error)) return NO_INFORMATION_REPLY;
    if (result.error) throw result.error;
    let rows = result.data ?? [];
    if (!rows.length) return NO_INFORMATION_REPLY;
    if (nextClass) {
      const week = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayIndex = week.indexOf(day);
      const currentTime = now.toTimeString().slice(0, 8);
      rows = [...rows].sort((a, b) => {
        const dayDelta = ((week.indexOf(a.day_of_week) - todayIndex + 7) % 7) - ((week.indexOf(b.day_of_week) - todayIndex + 7) % 7);
        if (dayDelta !== 0) return dayDelta;
        return String(a.start_time).localeCompare(String(b.start_time));
      });
      const todayRows = rows.filter((row) => row.day_of_week === day && String(row.start_time) >= currentTime);
      rows = (todayRows.length ? todayRows : rows).slice(0, 1);
    }
    if (nextClass) return `Your next class is:\n${rows.map((row) => `- ${row.day_of_week}: ${row.subject} ${displayTime(row.start_time)}-${displayTime(row.end_time)}${row.room ? ` (${row.room})` : ''}`).join('\n')}`;
    return `${full ? 'Your complete timetable is:' : `Your classes on ${day} are:`}\n` + rows.map((row) => `- ${row.day_of_week}: ${row.subject} ${displayTime(row.start_time)}-${displayTime(row.end_time)}${row.room ? ` (${row.room})` : ''}`).join('\n');
  }
  if (intent === 'ASSIGNMENT') {
    let queryBuilder = supabase.from('assignments').select('title,subject,description,due_at').match(scope).order('due_at');
    if (!full && /pending|upcoming|due|next/.test(q)) queryBuilder = queryBuilder.gte('due_at', now.toISOString());
    const result = await queryBuilder.limit(!full && /next|upcoming/.test(q) ? 1 : 50);
    if (result.error) throw result.error;
    const rows = result.data ?? [];
    return rows.length ? rows.map((row) => `- ${row.title} - ${row.subject}, due ${new Date(row.due_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}${row.description ? `\n  ${row.description}` : ''}`).join('\n') : NO_INFORMATION_REPLY;
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
  const result = await supabase.from('emergency_contacts').select('contact_name,phone_number,role_or_service,emergency_type,description,priority,contact_type').eq('active', true).order('priority').limit(50);
  if (result.error) throw result.error;
  const rows = result.data ?? [];
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
  const date = format(today, 'yyyy-MM-dd');
  const scope = { department: student.department, semester: student.semester };
  let records: unknown[] = [];

  if (intent === 'timetable') {
    const day = format(today, 'EEEE');
    const { data } = await supabase.from('timetables').select('day_of_week,start_time,end_time,subject,room,faculty:faculty(full_name)').match(scope).ilike('day_of_week', day).order('start_time');
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
      supabase.from('events').select('title,description,start_at,end_at,venue,event_type').gte('end_at', startOfDay(today).toISOString()).order('start_at').limit(10),
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
    currentDate: format(today, 'EEEE, d MMMM yyyy'),
    student: { name: student.full_name, rollNumber: student.roll_number, department: student.department, course: student.course, semester: student.semester },
    records,
  });
}
