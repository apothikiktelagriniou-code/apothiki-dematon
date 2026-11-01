-- =====================================================================
-- 0007 — Δέματα που ΔΕΝ πέρασαν από την αποθήκη Αγρινίου (από καταστάσεις)
--        + αριθμός λεωφορείου στη μεταφόρτωση
-- Επικόλληση στο Supabase → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================
alter table public.parcels add column if not exists bypassed boolean not null default false;
alter table public.parcels add column if not exists fwd_bus text;
create index if not exists parcels_bypassed_idx on public.parcels (bypassed) where bypassed;

alter table public.parcels drop constraint if exists parcels_status_check;
alter table public.parcels add constraint parcels_status_check
  check (status in ('arrived','notified','done','transit','forwarded','returned','not_arrived'));

alter table public.parcels drop constraint if exists parcels_source_check;
alter table public.parcels add constraint parcels_source_check check (source in ('photo_auto','photo_reviewed','manual','import','manifest'));

select 'OK — λίστα «Δεν πέρασαν από την αποθήκη» και αριθμός λεωφορείου' as αποτέλεσμα;
