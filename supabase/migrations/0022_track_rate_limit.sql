-- =====================================================================
-- 0022 — Όριο προσπαθειών στη δημόσια αναζήτηση δέματος (track_parcel)
-- Έως 20 αναζητήσεις ανά IP ανά 15 λεπτά. Οι IP σβήνονται μετά από 24 ώρες.
-- Ίδια είσοδος/έξοδος με το 0009, άρα η σελίδα αναζήτησης δεν αλλάζει.
-- Επικόλληση → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================
create table if not exists public.track_hits (
  id bigserial primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists track_hits_ip_at on public.track_hits (ip, at);
alter table public.track_hits enable row level security;   -- καμία πολιτική: κανείς δεν τον διαβάζει απ' έξω
revoke all on public.track_hits from anon, authenticated;

drop function if exists public.track_parcel(text, text);
create function public.track_parcel(p_receipt text, p_name text)
returns table (state text, at timestamptz, origin text, dest text, pieces_in int, pieces_total int)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_hdr json := nullif(current_setting('request.headers', true), '')::json;
  v_ip text := coalesce(nullif(trim(split_part(coalesce(v_hdr->>'x-forwarded-for', ''), ',', 1)), ''), v_hdr->>'cf-connecting-ip', 'unknown');
begin
  if (select count(*) from public.track_hits h where h.ip = v_ip and h.at > now() - interval '15 minutes') >= 20 then
    raise exception 'too_many' using errcode = 'P0001', hint = 'Δοκιμάστε ξανά σε 15 λεπτά';
  end if;
  insert into public.track_hits (ip) values (v_ip);
  if random() < 0.02 then delete from public.track_hits h where h.at < now() - interval '24 hours'; end if;

  return query
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
           else 'unknown' end::text,
         case when p.status = 'done' then p.picked_up_at
              when p.status = 'forwarded' then p.fwd_departure_at
              else p.created_at end,
         p.origin_city::text, coalesce(p.fwd_destination, p.destination_city)::text, p.pieces_in::int, p.pieces_total::int
    from public.parcels p, q
   where length(q.d) >= 10 and length(q.n) = 3
     and not (p.bypassed and p.status = 'not_arrived')
     and (regexp_replace(p.receipt_no, '\D', '', 'g') = q.d
          or (length(regexp_replace(p.receipt_no, '\D', '', 'g')) > length(q.d) and regexp_replace(p.receipt_no, '\D', '', 'g') like '%' || q.d)
          or (length(q.d) > length(regexp_replace(p.receipt_no, '\D', '', 'g')) and q.d like '%' || regexp_replace(p.receipt_no, '\D', '', 'g') and length(regexp_replace(p.receipt_no, '\D', '', 'g')) >= 10))
     and left(split_part(public.norm_key(p.recipient_name), ' ', 1), 3) = q.n
   order by p.created_at desc
   limit 1;
end;
$$;
revoke all on function public.track_parcel(text, text) from public;
grant execute on function public.track_parcel(text, text) to anon, authenticated;
select 'OK — αναζήτηση με όριο 20 ανά 15 λεπτά' as αποτέλεσμα;
