begin;

alter table public.students
  add column if not exists student_id text;

alter table public.students
  alter column student_id type text
  using student_id::text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'students' and column_name = 'id'
  ) then
    execute $sql$
      update public.students
      set student_id = 'LEGACY-' || upper(substr(replace(id::text, '-', ''), 1, 12))
      where student_id is null
    $sql$;
  end if;
end $$;

alter table public.students
  alter column student_id set not null;

create unique index if not exists students_student_id_key
  on public.students(student_id);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'students' and column_name = 'phone'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'students' and column_name = 'whatsapp_number'
  ) then
    alter table public.students rename column phone to whatsapp_number;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'students' and column_name = 'program'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'students' and column_name = 'course'
  ) then
    alter table public.students rename column program to course;
  end if;
end $$;

alter table public.students
  alter column roll_number type integer
  using roll_number::integer;

alter table public.students
  drop constraint if exists students_phone_check;

alter table public.students
  drop constraint if exists students_whatsapp_number_check;

alter table public.students
  add constraint students_whatsapp_number_check
  check (whatsapp_number ~ '^[0-9]{8,15}$');

commit;
