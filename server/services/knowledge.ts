import { format, startOfDay } from 'date-fns';
import { supabase } from '../lib/supabase.js';

export type Intent = 'timetable' | 'assignments' | 'exams' | 'attendance' | 'faculty' | 'events' | 'placements' | 'emergency' | 'materials' | 'general';

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
  if (/note|material|resource|pdf|study/.test(q)) return 'materials';
  return 'general';
}

export async function findStudent(phone: string) {
  const normalizedPhone = String(phone).replace(/\D/g, '');

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('whatsapp_number', normalizedPhone)
    .maybeSingle();

  if (error) {
    console.error('Student lookup error:', error);
    throw error;
  }

  return data;
}

function compact(data: unknown) {
  return JSON.parse(JSON.stringify(data, (_key, value) => value === null || value === '' ? undefined : value));
}

export async function retrieveContext(student: Record<string, any>, query: string) {
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
    const { data } = await supabase.from('assignments').select('title,subject,description,due_at,max_marks,submission_url').eq('department', scope.department).eq('semester', scope.semester).gte('due_at', today.toISOString()).order('due_at').limit(10);
    records = data ?? [];
  } else if (intent === 'exams') {
    const { data } = await supabase.from('exams').select('title,subject,exam_date,start_time,end_time,room,instructions').eq('department', scope.department).eq('semester', scope.semester).gte('exam_date', date).order('exam_date').limit(12);
    records = data ?? [];
  } else if (intent === 'attendance') {
    const { data } = await supabase.from('attendance_summary').select('subject,total_classes,present_classes,percentage').eq('student_id', student.id).order('subject');
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
    const { data } = await supabase.from('emergency_contacts').select('name,role,phone,email,available_hours,priority').eq('active', true).order('priority').limit(15);
    records = data ?? [];
  } else if (intent === 'materials') {
    const { data } = await supabase.from('study_materials').select('title,subject,description,file_url,material_type,uploaded_at').eq('department', scope.department).eq('semester', scope.semester).order('uploaded_at', { ascending: false }).limit(12);
    records = data ?? [];
  } else {
    const [{ data: info }, { data: faq }] = await Promise.all([
      supabase.from('college_info').select('key,title,content,category').limit(20),
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
