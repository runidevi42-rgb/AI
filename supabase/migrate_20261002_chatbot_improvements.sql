-- CampusMate chatbot improvements.
-- Safe/additive: preserves attendance source rows and existing contacts.
begin;

-- Academic-group fields are optional until existing student records are mapped.
alter table public.students add column if not exists section text;
alter table public.students add column if not exists batch_group text;
do $timetable$
begin
  if to_regclass('public.timetable') is not null then
    alter table public.timetable add column if not exists room text;
    create index if not exists timetable_day_start_idx on public.timetable(day_of_week, start_time);
  elsif to_regclass('public.timetables') is not null then
    alter table public.timetables add column if not exists room text;
    alter table public.timetables add column if not exists department text;
    alter table public.timetables add column if not exists semester integer;
    alter table public.timetables add column if not exists section text;
    create index if not exists timetables_day_start_idx on public.timetables(day_of_week, start_time);
  end if;
end;
$timetable$;

-- Keep the existing subject/date attendance rows as the source of truth, while
-- exposing the student-level shape used by the chatbot.
create or replace view public.student_attendance_summary as
select student_id,
  round(100.0 * count(*) filter (where status in ('present', 'late')) / nullif(count(*), 0), 0)::integer as attendance_percentage
from public.attendance
group by student_id;

-- Existing faculty table is reused; these optional fields support subject lookup
-- without requiring a second faculty table.
alter table public.faculty add column if not exists subjects text;
alter table public.faculty add column if not exists office_room text;

-- India public emergency services. College-specific contacts remain admin-configured.
insert into public.emergency_contacts (contact_name, phone_number, role_or_service, emergency_type, description, priority, active, contact_type)
select 'Ambulance', '108', 'Medical emergency service', 'Medical emergency', 'For urgent medical assistance in India.', 1, true, 'public_service'
where not exists (select 1 from public.emergency_contacts where phone_number = '108');
insert into public.emergency_contacts (contact_name, phone_number, role_or_service, emergency_type, description, priority, active, contact_type)
select 'Police', '112', 'Police emergency service', 'Campus safety issue', 'For urgent police or public-safety assistance in India.', 2, true, 'public_service'
where not exists (select 1 from public.emergency_contacts where phone_number = '112');
insert into public.emergency_contacts (contact_name, phone_number, role_or_service, emergency_type, description, priority, active, contact_type)
select 'Fire', '101', 'Fire and rescue service', 'Other urgent situation', 'For urgent fire and rescue assistance in India.', 3, true, 'public_service'
where not exists (select 1 from public.emergency_contacts where phone_number = '101');

commit;
