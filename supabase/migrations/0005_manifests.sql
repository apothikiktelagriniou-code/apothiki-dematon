-- =====================================================================
-- 0005 — Καταστάσεις πρακτορείων (ιστορικό ελέγχων)
-- Επικόλληση στο Supabase → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================
create table if not exists public.manifests (
  id uuid primary key default gen_random_uuid(),
  origin_city text,
  departure_at timestamptz,
  agency text,
  items jsonb not null default '[]'::jsonb,
  total_declared int,
  found int, missing int, extra int,
  operator text,
  created_at timestamptz default now(),
  created_by uuid default auth.uid()
);
alter table public.manifests enable row level security;
drop policy if exists staff_all on public.manifests;
create policy staff_all on public.manifests for all to authenticated using (true) with check (true);
-- δέματα που καταχωρούνται απευθείας από κατάσταση
alter table public.parcels drop constraint if exists parcels_source_check;
alter table public.parcels add constraint parcels_source_check check (source in ('photo_auto','photo_reviewed','manual','import','manifest'));
select 'OK — προστέθηκαν οι καταστάσεις πρακτορείων' as αποτέλεσμα;
