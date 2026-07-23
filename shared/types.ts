export type ResourceName =
  | 'students' | 'timetables' | 'assignments' | 'exams' | 'attendance'
  | 'faculty' | 'notices' | 'events' | 'study_materials'
  | 'emergency_contacts' | 'college_info';

export interface Student {
  student_id: string;
  full_name: string;
  whatsapp_number: string;
  roll_number: number;
  department: string;
  course: string;
  semester: number;
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
