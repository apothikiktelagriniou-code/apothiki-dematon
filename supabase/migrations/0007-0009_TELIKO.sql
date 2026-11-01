-- =====================================================================
-- ΟΛΕΣ ΟΙ ΕΚΚΡΕΜΕΙΣ ΑΛΛΑΓΕΣ (0007 + 0008 + 0009) σε ένα αρχείο
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


-- ---------- 0009_track.sql ----------
-- 0009 — Δημόσιος έλεγχος δέματος από τον παραλήπτη
-- Απαιτεί αριθμό απόδειξης + 3 πρώτα γράμματα επωνύμου. Επιστρέφει ΜΟΝΟ κατάσταση
-- (όχι όνομα, τηλέφωνο, ράφι). Επικόλληση → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
create or replace function public.track_parcel(p_receipt text, p_name text)
returns table (state text, at timestamptz, origin text, dest text, pieces_in int, pieces_total int)
language sql stable security definer set search_path = public as $$
  with q as (
    select regexp_replace(coalesce(p_receipt, ''), '\D', '', 'g') as d,
           left(replace(public.norm_key(p_name), ' ', ''), 3) as n
  )
  select case
           when p.status in ('arrived','notified') then 'here'
           when p.status = 'done' then 'done'
           when p.status = 'transit' then 'transit'
           when p.status = 'forwarded' then 'forwarded'
           when p.status = 'returned' then 'returned'
           else 'unknown' end,
         case when p.status = 'done' then p.picked_up_at
              when p.status = 'forwarded' then p.fwd_departure_at
              else p.created_at end,
         p.origin_city, coalesce(p.fwd_destination, p.destination_city), p.pieces_in, p.pieces_total
    from public.parcels p, q
   where length(q.d) >= 10 and length(q.n) = 3
     and not (p.bypassed and p.status = 'not_arrived')
     and (regexp_replace(p.receipt_no, '\D', '', 'g') = q.d
          or (length(regexp_replace(p.receipt_no, '\D', '', 'g')) > length(q.d) and regexp_replace(p.receipt_no, '\D', '', 'g') like '%' || q.d)
          or (length(q.d) > length(regexp_replace(p.receipt_no, '\D', '', 'g')) and q.d like '%' || regexp_replace(p.receipt_no, '\D', '', 'g') and length(regexp_replace(p.receipt_no, '\D', '', 'g')) >= 10))
     and left(split_part(public.norm_key(p.recipient_name), ' ', 1), 3) = q.n
   order by p.created_at desc
   limit 1;
$$;
revoke all on function public.track_parcel(text, text) from public;
grant execute on function public.track_parcel(text, text) to anon, authenticated;

select 'OK — ΟΛΑ ΕΤΟΙΜΑ (λίστες, λεωφορείο, τεμάχια, έλεγχος πελάτη)' as αποτέλεσμα;
