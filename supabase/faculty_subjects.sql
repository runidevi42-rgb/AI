-- Add the optional field used by Faculty Management and faculty-contact lookup.
-- Existing faculty rows and other columns are unchanged.
alter table public.faculty add column if not exists subjects text;
