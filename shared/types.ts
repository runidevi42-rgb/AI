export type ResourceName =
  | 'students' | 'timetables' | 'assignments' | 'exams' | 'attendance'
  | 'faculty' | 'notices' | 'events' | 'emergency_contacts' | 'college_info' | 'faqs';

export interface Student {
  student_id: number;
  full_name: string;
  whatsapp_number: string;
  roll_number: number;
  department: string;
  course: string;
  semester: number;
}

export interface Assignment {
  id: string;
  title: string;
  subject: string;
  description: string | null;
  department: string;
  semester: number;
  due_at: string;
}

export interface Exam {
  id: string;
  title: string;
  subject: string;
  department: string;
  semester: number;
  exam_date: string;
  start_time: string;
  end_time: string;
  instructions: string | null;
}

export interface CollegeInformation {
  id: string;
  title: string;
  content: string;
  category: string;
}

export interface EmergencyContact {
  id: string;
  contact_name: string;
  phone_number: string;
  role_or_service: string;
  emergency_type: string;
  description: string;
  priority: number;
  active: boolean;
  contact_type: 'faculty' | 'public_service';
}

export interface DashboardStats {
  students: number;
  activeAssignments: number;
  upcomingExams: number;
  unreadNotices: number;
  deliveryRate: number;
  recentActivity: Array<{ id: string; type: string; title: string; status: string; created_at: string }>;
  upcoming: Array<{ id: string; kind: string; title: string; date: string }>;
}

export interface ApiList<T = Record<string, unknown>> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
