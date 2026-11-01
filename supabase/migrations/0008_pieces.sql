-- =====================================================================
-- 0008 — Αποστολές με πολλά τεμάχια (ίδιος αριθμός απόδειξης)
-- Επικόλληση στο Supabase → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================
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

select 'OK — τεμάχια αποστολής' as αποτέλεσμα;
