-- =====================================================================
-- 0034 — Όρια κόστους AI/SMS + καθάρισμα φωτογραφιών ετικετών που ξεχάστηκαν στο «Για έλεγχο»
-- ΔΕΝ αγγίζει αριθμούς εγγράφων ταυτότητας (απόφαση ιδιοκτήτη: μένουν μέχρι τη γνώμη νομικού).
-- Επικόλληση → SQL Editor → Run ΜΕΤΑ το 0033. Ασφαλές να τρέξει ξανά. Ελέγχθηκε τοπικά.
-- Όρια: ανά χρήστη 120 SMS / 600 αναγνώσεις AI τη μέρα· όλοι μαζί 250 SMS / 1500 AI.
-- =====================================================================

-- 1. ημερήσιος μετρητής ανά χρήστη, που ο client ΔΕΝ μπορεί να αγγίξει
create table if not exists public.fn_usage (
  day  date not null default current_date,
  kind text not null,
  uid  uuid not null,
  n    int  not null default 0,
  primary key (day, kind, uid)
);
alter table public.fn_usage enable row level security;
revoke all on public.fn_usage from public, anon, authenticated;

create or replace function public.fn_quota(p_kind text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare lim int := case p_kind when 'sms' then 120 when 'ai' then 600 when 'biz' then 40 else 0 end;
        tot int := case p_kind when 'sms' then 250 when 'ai' then 1500 when 'biz' then 80 else 0 end; v int; t int;
begin
  if auth.uid() is null then return false; end if;
  insert into fn_usage as u (kind, uid, n) values (p_kind, auth.uid(), 1)
  on conflict (day, kind, uid) do update set n = u.n + 1 returning n into v;
  select coalesce(sum(n), 0) into t from fn_usage where day = current_date and kind = p_kind;  -- όριο για ΟΛΟΥΣ μαζί
  return v <= lim and t <= tot;
end $$;
revoke all on function public.fn_quota(text) from public, anon;
grant execute on function public.fn_quota(text) to authenticated;

-- 2. ημερολόγιο SMS (ποιος, σε ποιο δέμα, πότε) — όχι το κείμενο, όχι ο αριθμός ολόκληρος
create table if not exists public.sms_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  uid uuid not null default auth.uid(),
  ref_table text not null check (ref_table in ('parcels','outgoing')),
  ref_id uuid not null,
  phone_last3 text,
  ok boolean
);
alter table public.sms_log enable row level security;
revoke all on public.sms_log from public, anon;
grant select, insert on public.sms_log to authenticated;
drop policy if exists sms_ins on public.sms_log;
create policy sms_ins  on public.sms_log for insert to authenticated with check (uid = auth.uid());
drop policy if exists sms_read on public.sms_log;
create policy sms_read on public.sms_log for select to authenticated using (true);   -- μετά το 0033: public.is_admin()

-- 3. φωτογραφίες ετικετών που έμειναν στο «Για έλεγχο» (κανόνας: δεν κρατάμε φωτογραφίες αποδείξεων)
create or replace function public.cleanup_daily() returns jsonb
language plpgsql security definer set search_path = public as $$
declare a int; b int; c int;
begin
  update extraction_queue set thumbnail = null, package_thumb = null
   where (thumbnail is not null or package_thumb is not null) and created_at < now() - interval '7 days';
  get diagnostics a = row_count;
  delete from fn_usage where day < current_date - 60;
  delete from track_hits where at < now() - interval '24 hours';
  delete from track_fails where at < now() - interval '24 hours';
  delete from poll_hits where at < now() - interval '24 hours';
  delete from click_hits where at < now() - interval '24 hours';
  delete from device_status where last_seen < now() - interval '90 days';
  get diagnostics b = row_count;
  return jsonb_build_object('thumbs', a, 'devices', b, 'at', now());
end $$;
revoke all on function public.cleanup_daily() from public, anon, authenticated;

-- 4. να τρέχει μόνο του (Dashboard → Database → Extensions → pg_cron: Enable, μετά):
-- select cron.schedule('cleanup-daily', '23 3 * * *', $$select public.cleanup_daily()$$);

insert into public.schema_migrations (version, note) values ('0034', 'όρια AI/SMS, καθάρισμα') on conflict (version) do nothing;
select 'OK — 0034 όρια & καθάρισμα' as αποτέλεσμα;
