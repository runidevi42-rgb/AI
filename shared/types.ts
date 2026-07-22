export type ResourceName =
  | 'students' | 'timetables' | 'assignments' | 'exams' | 'attendance'
  | 'faculty' | 'notices' | 'events' | 'study_materials'
  | 'emergency_contacts' | 'college_info';

export interface Student {
  id: string;
  phone: string;
  full_name: string;
  roll_number: string;
  department: string;
  program: string;
  semester: number;
  section: string;
  active: boolean;
  whatsapp_opt_in: boolean;
  created_at: string;
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
  count: number;
  page: number;
  pageSize: number;
}
