-- =====================================================================
-- 0003 — Ολόκληρος αριθμός εγγράφου στην παράδοση (για αναζήτηση από αρμόδιες αρχές)
-- Επικόλληση στο Supabase → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================
alter table public.parcels add column if not exists id_doc_number text;
create index if not exists parcels_id_doc_number_idx on public.parcels (id_doc_number);
select 'OK — προστέθηκε ο αριθμός εγγράφου' as αποτέλεσμα;
