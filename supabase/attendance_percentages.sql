-- Additive: existing subject-level attendance records remain unchanged.
create table if not exists public.attendance_percentages (
  id uuid primary key default gen_random_uuid(),
  student_id bigint not null unique references public.students(student_id) on update cascade on delete cascade,
  attendance_percentage numeric(5,2) not null check (attendance_percentage between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.attendance_percentages enable row level security;
