-- 0020: Αυτόματο SMS άφιξης με την καταχώρηση (διακόπτης στο Μενού)
alter table public.app_settings add column if not exists sms_auto boolean not null default false;
