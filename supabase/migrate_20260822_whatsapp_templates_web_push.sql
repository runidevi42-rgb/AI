-- CampusMate approved WhatsApp templates and Web Push delivery support.
-- Run this file manually in the Supabase SQL Editor before deploying the code.
-- Existing students remain opted out until consent is explicitly recorded.

begin;

alter table public.students add column if not exists active boolean not null default true;
alter table public.students add column if not exists whatsapp_opt_in boolean not null default false;
alter table public.students add column if not exists web_push_opt_in boolean not null default false;

alter table public.notifications add column if not exists delivery_channel text not null default 'web_push';

do $migration$
begin 
  if not exists (
    select 1 from pg_constraint
    where conname = 'notifications_delivery_channel_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_delivery_channel_check
      check (delivery_channel in ('web_push', 'whatsapp', 'both'));
  end if;
end;
$migration$;

alter table public.message_logs add column if not exists channel text not null default 'whatsapp';
alter table public.message_logs add column if not exists template_name text;
alter table public.message_logs add column if not exists template_language text;
alter table public.message_logs add column if not exists failure_reason text;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'message_logs_channel_check'
      and conrelid = 'public.message_logs'::regclass
  ) then
    alter table public.message_logs
      add constraint message_logs_channel_check
      check (channel in ('whatsapp', 'web_push'));
  end if;
end;
$migration$;

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id bigint not null references public.students(student_id) on update cascade on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists students_notification_consent_idx
  on public.students(active, whatsapp_opt_in, web_push_opt_in);
create index if not exists web_push_subscriptions_student_active_idx
  on public.web_push_subscriptions(student_id, active);
create index if not exists notifications_scheduled_due_idx
  on public.notifications(scheduled_at)
  where status = 'scheduled';
create index if not exists message_logs_notification_status_idx
  on public.message_logs(notification_id, channel, status);

alter table public.web_push_subscriptions enable row level security;

-- The browser does not access this table directly. The backend service role
-- manages subscriptions and delivery while RLS blocks anon/authenticated access.

commit;
