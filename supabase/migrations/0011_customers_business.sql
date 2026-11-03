-- 0011: καρτέλα πελάτη (επιχείρηση) + πρόταση επαγγελματικού τηλεφώνου + έλεγχος χειρόγραφων αποδείξεων στη σελίδα πελάτη
alter table public.customers add column if not exists is_business boolean not null default false;
alter table public.customers add column if not exists business_source text;
alter table public.customers add column if not exists email text;
alter table public.parcels add column if not exists phone_suggestion jsonb;
alter table public.parcels drop constraint if exists parcels_phone_source_check;
alter table public.parcels add constraint parcels_phone_source_check
  check (phone_source is null or phone_source in ('label','handwritten','customer_db','manual','business_web'));

-- «Πού είναι το δέμα μου;»: δέχεται και τον κόκκινο αριθμό χειρόγραφης απόδειξης (π.χ. 3401 → «3401 (33950048)»)
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
   where length(q.d) >= 4 and length(q.n) = 3
     and not (p.bypassed and p.status = 'not_arrived')
     and ( (length(q.d) >= 10 and (regexp_replace(p.receipt_no, '\D', '', 'g') = q.d
            or (length(regexp_replace(p.receipt_no, '\D', '', 'g')) > length(q.d) and regexp_replace(p.receipt_no, '\D', '', 'g') like '%' || q.d)
            or (length(q.d) > length(regexp_replace(p.receipt_no, '\D', '', 'g')) and q.d like '%' || regexp_replace(p.receipt_no, '\D', '', 'g') and length(regexp_replace(p.receipt_no, '\D', '', 'g')) >= 10)))
        or (length(q.d) < 10 and split_part(p.receipt_no, ' ', 1) = q.d) )
     and left(split_part(public.norm_key(p.recipient_name), ' ', 1), 3) = q.n
   order by p.created_at desc
   limit 1;
$$;
revoke all on function public.track_parcel(text, text) from public;
grant execute on function public.track_parcel(text, text) to anon, authenticated;
select 'OK — 0011' as αποτέλεσμα;
