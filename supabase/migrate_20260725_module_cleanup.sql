-- CampusMate module cleanup and emergency-contact redesign.
-- Run this file manually in the Supabase SQL Editor after reviewing a backup.
-- Every obsolete column is removed only when its exact name exists.

begin;

-- Assignments: make the retained application columns available on older/minimal schemas.
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  title text,
  subject text,
  description text,
  department text,
  semester integer,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.assignments add column if not exists title text;
alter table public.assignments add column if not exists subject text;
alter table public.assignments add column if not exists description text;
alter table public.assignments add column if not exists department text;
alter table public.assignments add column if not exists semester integer;
alter table public.assignments add column if not exists due_at timestamptz;
alter table public.assignments add column if not exists created_at timestamptz not null default now();
alter table public.assignments add column if not exists updated_at timestamptz not null default now();
alter table public.assignments drop column if exists section;
alter table public.assignments drop column if exists maximum_marks;
alter table public.assignments drop column if exists max_marks;
alter table public.assignments drop column if exists submission_link;
alter table public.assignments drop column if exists submission_url;

-- Exams: retain scheduling/instruction fields and remove only the exact obsolete location field.
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  title text,
  subject text,
  department text,
  semester integer,
  exam_date date,
  start_time time,
  end_time time,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.exams add column if not exists title text;
alter table public.exams add column if not exists subject text;
alter table public.exams add column if not exists department text;
alter table public.exams add column if not exists semester integer;
alter table public.exams add column if not exists exam_date date;
alter table public.exams add column if not exists start_time time;
alter table public.exams add column if not exists end_time time;
alter table public.exams add column if not exists instructions text;
alter table public.exams add column if not exists created_at timestamptz not null default now();
alter table public.exams add column if not exists updated_at timestamptz not null default now();
alter table public.exams drop column if exists room;

-- College information: the application no longer requires a generated or user-entered key slot.
create table if not exists public.college_info (
  id uuid primary key default gen_random_uuid(),
  title text,
  content text,
  category text default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.college_info add column if not exists title text;
alter table public.college_info add column if not exists content text;
alter table public.college_info add column if not exists category text default 'general';
alter table public.college_info add column if not exists created_at timestamptz not null default now();
alter table public.college_info add column if not exists updated_at timestamptz not null default now();
alter table public.college_info drop column if exists unique_key_slot;
alter table public.college_info drop column if exists key;

-- Emergency contacts: create the new editable model without deleting legacy values first.
create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  contact_name text,
  phone_number text,
  role_or_service text,
  emergency_type text,
  description text,
  priority integer not null default 10,
  active boolean not null default true,
  contact_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.emergency_contacts add column if not exists contact_name text;
alter table public.emergency_contacts add column if not exists phone_number text;
alter table public.emergency_contacts add column if not exists role_or_service text;
alter table public.emergency_contacts add column if not exists emergency_type text;
alter table public.emergency_contacts add column if not exists description text;
alter table public.emergency_contacts add column if not exists priority integer not null default 10;
alter table public.emergency_contacts add column if not exists active boolean not null default true;
alter table public.emergency_contacts add column if not exists contact_type text;
alter table public.emergency_contacts add column if not exists created_at timestamptz not null default now();
alter table public.emergency_contacts add column if not exists updated_at timestamptz not null default now();

-- Copy legacy emergency values only when those exact source columns exist.
do $migration$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='emergency_contacts' and column_name='name') then
    execute 'update public.emergency_contacts set contact_name = coalesce(contact_name, name)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='emergency_contacts' and column_name='phone') then
    execute 'update public.emergency_contacts set phone_number = coalesce(phone_number, phone)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='emergency_contacts' and column_name='role') then
    execute 'update public.emergency_contacts set role_or_service = coalesce(role_or_service, role)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='emergency_contacts' and column_name='available_hours') then
    execute $sql$update public.emergency_contacts
      set description = coalesce(description, 'Availability: ' || available_hours)$sql$;
  end if;
end;
$migration$;

update public.emergency_contacts
set emergency_type = coalesce(emergency_type, 'Other urgent situation'),
    contact_type = coalesce(contact_type, 'faculty'),
    description = coalesce(description, 'Contact this service for an urgent or serious situation.');

-- Constraints accept short public numbers (for example 100/101/102/112) and formatted longer numbers.
alter table public.emergency_contacts drop constraint if exists emergency_contacts_contact_type_check;
alter table public.emergency_contacts add constraint emergency_contacts_contact_type_check
  check (contact_type in ('faculty','public_service'));
alter table public.emergency_contacts drop constraint if exists emergency_contacts_phone_number_check;
alter table public.emergency_contacts add constraint emergency_contacts_phone_number_check
  check (
    phone_number ~ '^\+?[0-9][0-9 ()-]{1,19}$'
    and length(regexp_replace(phone_number, '\D', '', 'g')) between 3 and 20
  );

-- Legacy fields are removed only after their data has been copied above.
alter table public.emergency_contacts drop column if exists name;
alter table public.emergency_contacts drop column if exists phone;
alter table public.emergency_contacts drop column if exists role;
alter table public.emergency_contacts drop column if exists email;
alter table public.emergency_contacts drop column if exists available_hours;

commit;
