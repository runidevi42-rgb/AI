create extension if not exists "pgcrypto";

create table if not exists students (
  id uuid primary key default gen_random_uuid(), student_id text unique not null, full_name text not null,
  whatsapp_number text unique not null check (whatsapp_number ~ '^[0-9]{8,15}$'),
  roll_number int unique not null, department text not null, course text not null, semester int not null check (semester between 1 and 12),
  section text not null default 'A', email text, guardian_phone text, active boolean not null default true,
  whatsapp_opt_in boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists students_scope_idx on students(department, semester, section);

create table if not exists faculty (
  id uuid primary key default gen_random_uuid(), full_name text not null, designation text not null, department text not null,
  email text, phone text, office text, office_hours text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists timetables (
  id uuid primary key default gen_random_uuid(), department text not null, semester int not null, section text not null default 'A',
  day_of_week text not null check (day_of_week in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  start_time time not null, end_time time not null, subject text not null, room text, faculty_id uuid references faculty(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (end_time > start_time)
);
create index if not exists timetables_scope_idx on timetables(department, semester, section, day_of_week);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(), title text not null, subject text not null, description text,
  department text not null, semester int not null, due_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists exams (
  id uuid primary key default gen_random_uuid(), title text not null, subject text not null, department text not null,
  semester int not null, exam_date date not null, start_time time not null, end_time time not null, instructions text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references students(id) on delete cascade, subject text not null,
  attendance_date date not null, status text not null check (status in ('present','absent','late','excused')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(student_id, subject, attendance_date)
);
create or replace view attendance_summary as
  select student_id, subject, count(*)::int total_classes,
    count(*) filter (where status in ('present','late'))::int present_classes,
    round(100.0 * count(*) filter (where status in ('present','late')) / nullif(count(*), 0), 1) percentage
  from attendance group by student_id, subject;

create table if not exists notices (
  id uuid primary key default gen_random_uuid(), title text not null, content text not null, category text not null default 'general',
  department text, semester int, published_at timestamptz not null default now(), expires_at timestamptz,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists events (
  id uuid primary key default gen_random_uuid(), title text not null, description text, event_type text not null default 'event',
  start_at timestamptz not null, end_at timestamptz not null, venue text, department text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists emergency_contacts (
  id uuid primary key default gen_random_uuid(), contact_name text not null, phone_number text not null,
  role_or_service text not null, emergency_type text not null, description text not null,
  priority int not null default 10, active boolean not null default true,
  contact_type text not null check (contact_type in ('faculty','public_service')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists college_info (
  id uuid primary key default gen_random_uuid(), title text not null, content text not null, category text not null default 'general',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists faqs (
  id uuid primary key default gen_random_uuid(), question text not null, answer text not null, category text not null default 'general',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(), title text not null, message text not null,
  type text not null default 'notice', audience text not null default 'all' check (audience in ('all','selected','segment')),
  student_ids uuid[] default '{}', department text, semester int, scheduled_at timestamptz, sent_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','partial','failed')),
  recipient_count int default 0, delivered_count int default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists message_logs (
  id uuid primary key default gen_random_uuid(), student_id uuid references students(id) on delete set null, phone text not null,
  direction text not null check (direction in ('inbound','outbound')), message text not null, status text not null,
  provider_message_id text, notification_id uuid references notifications(id) on delete set null, error text, metadata jsonb default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists message_provider_idx on message_logs(provider_message_id);
create table if not exists scheduled_job_runs (
  id uuid primary key default gen_random_uuid(), job_key text unique not null, completed_at timestamptz not null default now()
);

alter table students enable row level security;
alter table attendance enable row level security;
alter table message_logs enable row level security;
-- The backend exclusively uses the service role. Never expose that key to the browser.
