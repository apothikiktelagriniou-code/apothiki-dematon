-- =====================================================================
-- ΕΚΚΡΕΜΕΙΣ ΑΛΛΑΓΕΣ 0007 + 0008 σε ένα αρχείο
-- Επικόλληση ΟΛΟΥ στο Supabase → SQL Editor → New query → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================

-- ---------- 0007_bypassed.sql ----------
-- 0007 — Δέματα που ΔΕΝ πέρασαν από την αποθήκη Αγρινίου (από καταστάσεις)
--        + αριθμός λεωφορείου στη μεταφόρτωση
alter table public.parcels add column if not exists bypassed boolean not null default false;
alter table public.parcels add column if not exists fwd_bus text;
create index if not exists parcels_bypassed_idx on public.parcels (bypassed) where bypassed;

alter table public.parcels drop constraint if exists parcels_status_check;
alter table public.parcels add constraint parcels_status_check
  check (status in ('arrived','notified','done','transit','forwarded','returned','not_arrived'));

alter table public.parcels drop constraint if exists parcels_source_check;
alter table public.parcels add constraint parcels_source_check check (source in ('photo_auto','photo_reviewed','manual','import','manifest'));


-- ---------- 0008_pieces.sql ----------
-- 0008 — Αποστολές με πολλά τεμάχια (ίδιος αριθμός απόδειξης)
alter table public.parcels add column if not exists pieces_total int not null default 1 check (pieces_total >= 1);
alter table public.parcels add column if not exists pieces_in int not null default 1 check (pieces_in >= 0);

-- ατομική προσθήκη τεμαχίου (σωστή μέτρηση και όταν δύο φωτογραφίες φτάνουν μαζί)
create or replace function public.add_piece(p_receipt text, p_total int default 1)
returns setof public.parcels language sql as $$
  update public.parcels
     set pieces_total = greatest(pieces_total, coalesce(p_total, 1)),
         pieces_in = least(pieces_in + 1, greatest(pieces_total, coalesce(p_total, 1)))
   where regexp_replace(receipt_no, '\D', '', 'g') = regexp_replace(p_receipt, '\D', '', 'g')
     and not (bypassed and status = 'not_arrived')
     and pieces_in < greatest(pieces_total, coalesce(p_total, 1))
  returning *;
$$;
grant execute on function public.add_piece(text, int) to authenticated;

select 'OK — λίστες «Δεν ήρθαν»/«Απευθείας», λεωφορείο, τεμάχια' as αποτέλεσμα;
