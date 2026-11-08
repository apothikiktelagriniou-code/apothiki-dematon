-- =====================================================================
-- 0026 — 📦 Ποια δρομολόγια παίρνουν δέματα + δημόσια λίστα για την ιστοσελίδα
-- route_times.parcels: false = το λεωφορείο ΔΕΝ παίρνει δέματα (αλλάζει από την εφαρμογή: Εξερχόμενα → Δρομολόγια).
-- public_departures(): η ιστοσελίδα διαβάζει ΜΟΝΟ ενεργά δρομολόγια με δέματα (χωρίς άλλα στοιχεία).
-- Επικόλληση → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================
alter table public.route_times add column if not exists parcels boolean not null default true;

create or replace function public.public_departures()
returns table (dest text, "time" text, days text, express boolean, conn boolean, notes text)
language sql stable security definer set search_path = public as $$
  select r.dest, r.time, r.days, r.express, r.conn, r.notes
    from public.route_times r
   where r.active is not false and r.parcels is not false
   order by r.dest, r.time;
$$;
revoke all on function public.public_departures() from public;
grant execute on function public.public_departures() to anon, authenticated;
select 'OK — ' || (select count(*) from public.route_times where active and parcels) || ' αναχωρήσεις με δέματα' as αποτέλεσμα;
