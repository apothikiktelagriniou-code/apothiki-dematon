-- =====================================================================
-- 0033 — Ευρετήρια, κανόνες ακεραιότητας, ιστορικό χωρίς «θόρυβο», ταχύτερη αναζήτηση
-- ΤΡΕΧΕΙ ΜΕΤΑ το 0032. Ώρα: όταν η αποθήκη είναι κλειστή (π.χ. 22:00–06:00): τα ευρετήρια
-- κλειδώνουν για λίγα δευτερόλεπτα τις εγγραφές στον πίνακα.
-- Ασφαλές να τρέξει ξανά. Δεν σβήνει δεδομένα. Δεν αλλάζει τίποτα που βλέπει ο πελάτης.
-- Επικόλληση → SQL Editor → Run. Ελέγχθηκε τοπικά (2 συνεχόμενες εκτελέσεις, αναζήτηση, αναίρεση παράδοσης).
-- =====================================================================
begin;
set local lock_timeout = '10s';          -- αν κάποια συσκευή κρατά κλείδωμα, σταματά αντί να «παγώσει» την εφαρμογή
set local statement_timeout = '10min';
set local search_path = public, extensions;

-- 0. Ποια migrations έτρεξαν (ώστε να μη μαντεύουμε από το HANDOFF)
create table if not exists public.schema_migrations (version text primary key, applied_at timestamptz not null default now(), note text);
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;
insert into public.schema_migrations (version, note) values
  ('0001',null),('0002',null),('0003',null),('0004',null),('0005',null),('0006',null),('0007',null),('0008',null),('0009',null),
  ('0010',null),('0011',null),('0012',null),('0014',null),('0015',null),('0016',null),('0017',null),('0018',null),('0019',null),
  ('0020',null),('0021',null),('0022',null),('0023',null),('0024',null),('0025',null),('0026',null),('0027',null),('0028',null),
  ('0029',null),('0030',null),('0031',null),('0032',null)
on conflict (version) do nothing;   -- 0013 εσκεμμένα ΟΧΙ

-- 1. Ευρετήρια για τα φίλτρα που χρησιμοποιεί πραγματικά η εφαρμογή
-- 1α. αριθμός απόδειξης: τελευταία 10 ψηφία (track_parcel, add_piece)
create index if not exists parcels_receipt_tail10_idx on public.parcels (right(regexp_replace(receipt_no, '\D', '', 'g'), 10));
-- 1β. Ταμείο ημέρας: παραδόσεις ανά ώρα παράδοσης (main.js:1797)
create index if not exists parcels_done_picked_idx on public.parcels (picked_up_at) where status = 'done';
-- 1γ. Διαγραφή εγγράφων μετά από 12 μήνες: βρίσκει ΜΟΝΟ όσα έχουν ακόμα έγγραφο/υπογραφή
create index if not exists parcels_retention_idx on public.parcels (picked_up_at)
  where status = 'done' and (id_doc_number is not null or id_doc_last4 is not null or signature_path is not null);
-- 1δ. Φόρτωση «μόνο ό,τι άλλαξε» (αντί για όλα κάθε 5′) — δέματα & πελάτες
create index if not exists parcels_updated_idx on public.parcels (updated_at);
create index if not exists customers_updated_idx on public.customers (updated_at);
-- 1ε. «Ποιος είναι;» (similarCustomers, main.js:303)
create index if not exists customers_surname_key_idx on public.customers (surname_key);
-- 1στ. Εξερχόμενα: «υπάρχει ήδη;» (outgoing.js:413)
create index if not exists outgoing_parcel_code_idx on public.outgoing (parcel_code) where parcel_code is not null;
-- 1ζ. FK χωρίς ευρετήριο (διαγραφή δέματος → σάρωση όλης της ουράς ελέγχου)
create index if not exists extraction_queue_parcel_idx on public.extraction_queue (parcel_id) where parcel_id is not null;
-- 1η. Ημερολόγιο: BRIN αντί για B-tree στην ώρα (≈ 61 MB → < 1 MB στα 2 εκ. γραμμές)
create index if not exists activity_at_brin on public.activity_log using brin (at);
drop index if exists public.activity_at_idx;

-- 2. Αναζήτηση δέματος (main.js:849): ένα ευρετήριο τριγράμμων αντί για σάρωση όλου του πίνακα
create or replace function public.parcel_search_text(a text, b text, c text, d text, e text, f text, g text, h text, i text, j text)
returns text language sql immutable parallel safe as $$
  select public.norm_key(coalesce(a,'') || ' ' || coalesce(b,'') || ' ' || coalesce(c,'') || ' ' || coalesce(d,'') || ' ' || coalesce(e,'') || ' ' ||
         coalesce(f,'') || ' ' || coalesce(g,'') || ' ' || coalesce(h,'') || ' ' || coalesce(i,'') || ' ' || coalesce(j,''))
$$;
create index if not exists parcels_search_trgm_idx on public.parcels using gin (public.parcel_search_text(
  recipient_name, receipt_no, parcel_code, recipient_phone, picked_by_phone, picked_by_name, sender_name, fwd_bus, package_desc, id_doc_number) gin_trgm_ops);
create or replace function public.search_parcels(q text)
returns setof public.parcels language sql stable security invoker set search_path = public, extensions as $$
  select p.* from public.parcels p
   where length(btrim(coalesce(q, ''))) >= 3
     and (public.parcel_search_text(p.recipient_name, p.receipt_no, p.parcel_code, p.recipient_phone, p.picked_by_phone, p.picked_by_name,
                                    p.sender_name, p.fwd_bus, p.package_desc, p.id_doc_number) like '%' || public.norm_key(left(q, 60)) || '%'
          or p.pickup_code = btrim(q))
   order by p.created_at desc
   limit 100
$$;
revoke all on function public.search_parcels(text) from public, anon;
grant execute on function public.search_parcels(text) to authenticated;
revoke all on function public.parcel_search_text(text,text,text,text,text,text,text,text,text,text) from anon;

-- 3. Δημόσια αναζήτηση (0032) — ΙΔΙΑ λογική, + ένας όρος που πιάνει το ευρετήριο 1α (≈1 s → <1 ms)
create or replace function public.track_parcel(p_receipt text, p_name text)
returns table (state text, at timestamptz, origin text, dest text, pieces_in int, pieces_total int)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_ip text := public.client_ip();
  v_d text := regexp_replace(left(coalesce(p_receipt, ''), 200), '\D', '', 'g');
  v_key text;
  v_n text := left(replace(public.norm_key(left(coalesce(p_name, ''), 60)), ' ', ''), 3);
  v_n2 text := left(translate(replace(replace(replace(replace(replace(upper(replace(left(coalesce(p_name, ''), 60), ' ', '')),
                 'TH', 'Θ'), 'CH', 'Χ'), 'PS', 'Ψ'), 'KS', 'Ξ'), 'OU', 'ΟΥ'),
                 'ABGDEZHIKLMNXOPRSTYFWVCQUJ', 'ΑΒΓΔΕΖΗΙΚΛΜΝΞΟΠΡΣΤΥΦΩΒΚΚΥΤ'), 3);
  v_rows int;
begin
  if length(v_d) < 10 or length(v_d) > 20 or length(v_n) <> 3 then return; end if;
  v_key := right(v_d, 10);
  if (select count(*) from public.track_hits h where h.ip = v_ip and h.at > now() - interval '15 minutes') >= 20 then
    raise exception 'too_many' using errcode = 'P0001', hint = 'Δοκιμάστε ξανά σε 15 λεπτά';
  end if;
  if (select count(*) from public.track_fails f where f.receipt = v_key and f.at > now() - interval '24 hours') >= 5 then
    raise exception 'too_many' using errcode = 'P0001', hint = 'locked_24h';
  end if;
  if (select count(*) from public.track_fails f where f.at > now() - interval '10 minutes') >= 600 then
    raise exception 'too_many' using errcode = 'P0001', hint = 'Δοκιμάστε ξανά σε λίγα λεπτά';
  end if;
  insert into public.track_hits (ip) values (v_ip);
  if random() < 0.02 then
    delete from public.track_hits h where h.at < now() - interval '24 hours';
    delete from public.track_fails f where f.at < now() - interval '24 hours';
  end if;

  return query
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
    from public.parcels p
   where right(regexp_replace(p.receipt_no, '\D', '', 'g'), 10) = v_key          -- ΝΕΟ: ευρετήριο (ισχύει πάντα όταν ταιριάζει παρακάτω)
     and not (p.bypassed and p.status = 'not_arrived')
     and (regexp_replace(p.receipt_no, '\D', '', 'g') = v_d
          or (length(regexp_replace(p.receipt_no, '\D', '', 'g')) > length(v_d) and regexp_replace(p.receipt_no, '\D', '', 'g') like '%' || v_d)
          or (length(v_d) > length(regexp_replace(p.receipt_no, '\D', '', 'g')) and v_d like '%' || regexp_replace(p.receipt_no, '\D', '', 'g') and length(regexp_replace(p.receipt_no, '\D', '', 'g')) >= 10))
     and left(split_part(public.norm_key(p.recipient_name), ' ', 1), 3) in (v_n, v_n2)
   order by p.created_at desc
   limit 1;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    insert into public.track_fails (receipt) values (v_key);
  end if;
end;
$$;
revoke all on function public.track_parcel(text, text) from public;
grant execute on function public.track_parcel(text, text) to anon, authenticated;

-- 4. add_piece: ευρετήριο + ΙΔΙΟ αποτέλεσμα αν ξανασταλεί η ίδια φωτογραφία (κακό σήμα)
create table if not exists public.parcel_piece_events (
  event_id uuid primary key,
  parcel_id uuid not null references public.parcels(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists parcel_piece_events_parcel_idx on public.parcel_piece_events (parcel_id);
alter table public.parcel_piece_events enable row level security;
drop policy if exists staff_all on public.parcel_piece_events;
create policy staff_all on public.parcel_piece_events for all to authenticated using (true) with check (true);
revoke all on public.parcel_piece_events from anon;

drop function if exists public.add_piece(text, int);
create or replace function public.add_piece(p_receipt text, p_total int default 1, p_event uuid default null)
returns setof public.parcels language plpgsql volatile set search_path = public as $$
declare v_d text := regexp_replace(coalesce(p_receipt, ''), '\D', '', 'g'); v_pid uuid;
begin
  if p_event is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_event::text, 0));
    select e.parcel_id into v_pid from public.parcel_piece_events e where e.event_id = p_event;
    if found then return query select * from public.parcels where id = v_pid; return; end if;   -- ήδη μετρήθηκε
  end if;
  return query
  with u as (
    update public.parcels
       set pieces_total = greatest(pieces_total, coalesce(p_total, 1)),
           pieces_in = least(pieces_in + 1, greatest(pieces_total, coalesce(p_total, 1)))
     where right(regexp_replace(receipt_no, '\D', '', 'g'), 10) = right(v_d, 10)
       and regexp_replace(receipt_no, '\D', '', 'g') = v_d
       and not (bypassed and status = 'not_arrived')
       and pieces_in < greatest(pieces_total, coalesce(p_total, 1))
    returning *),
  e as (insert into public.parcel_piece_events (event_id, parcel_id)
        select p_event, u.id from u where p_event is not null limit 1 on conflict do nothing)
  select * from u;
end $$;
revoke all on function public.add_piece(text, int, uuid) from public, anon;
grant execute on function public.add_piece(text, int, uuid) to authenticated;

-- 5. Κανόνες ακεραιότητας (NOT VALID = ισχύουν από τώρα· τα παλιά ελέγχονται στο βήμα 9)
do $$ begin
  alter table public.parcels add constraint parcels_pieces_ck check (pieces_in <= pieces_total) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.parcels add constraint parcels_money_ck check ((fare_eur is null or fare_eur >= 0) and (cod_amount_eur is null or cod_amount_eur >= 0) and notify_count >= 0) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.parcels add constraint parcels_done_has_pickup_ck check (status <> 'done' or picked_up_at is not null) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.customers add constraint customers_name_ck check (char_length(btrim(full_name)) > 0) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.outgoing add constraint outgoing_pieces_ck check (pieces >= 1 and (fare_eur is null or fare_eur >= 0)) not valid;
exception when duplicate_object then null; end $$;

-- 6. Φρένο σε «παλιά εικόνα»: δέμα που παραδόθηκε δεν ξαναγυρίζει σε ανοιχτό από άλλη συσκευή.
--    Η «↶ Αναίρεση παράδοσης» (main.js:1153) περνά, γιατί σβήνει το picked_up_at.
create or replace function public.parcels_guard_status() returns trigger language plpgsql as $$
begin
  if old.status = 'done' and new.status is distinct from 'done' and new.picked_up_at is not null then
    raise exception 'stale_status: το δέμα έχει ήδη παραδοθεί (%). Ανανέωσε τη λίστα.', to_char(old.picked_up_at at time zone 'Europe/Athens', 'DD/MM HH24:MI')
      using errcode = 'P0001', hint = 'stale_status';
  end if;
  return new;
end $$;
drop trigger if exists trg_parcels_guard on public.parcels;
create trigger trg_parcels_guard before update of status on public.parcels for each row execute function public.parcels_guard_status();

-- 7. Ημερολόγιο: γράφει ΤΙ άλλαξε (ονόματα πεδίων, όχι τιμές) και αγνοεί τον «θόρυβο»
create or replace function public.log_parcel_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text; d jsonb; ch text[];
begin
  if tg_op = 'INSERT' then
    a := 'create'; d := jsonb_build_object('source', new.source);
  else
    select array_agg(n.key order by n.key) into ch
      from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value
       and n.key not in ('updated_at', 'updated_by', 'operator', 'sms_state_at', 'phone_suggestion', 'package_photo_path', 'package_desc');
    if ch is null then return new; end if;                       -- π.χ. μόνο «ελέγχθηκε το SMS»: όχι γραμμή
    if new.status is distinct from old.status then
      a := 'status:' || new.status; d := jsonb_build_object('from', old.status, 'channel', new.notify_channel, 'fields', ch);
    elsif new.damaged and not old.damaged then
      a := 'damage'; d := jsonb_build_object('note', new.damage_note, 'fields', ch);
    else
      a := 'update'; d := jsonb_build_object('fields', ch);
    end if;
  end if;
  insert into activity_log(parcel_id, action, details, user_id, operator) values (new.id, a, d, auth.uid(), new.operator);
  return new;
end $$;

-- 8. Μετρητής δεμάτων πελάτη: μειώνεται όταν το δέμα φεύγει από τον πελάτη ή σβήνεται
create or replace function public.bump_customer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.customer_id is not null
     and (tg_op = 'DELETE' or new.customer_id is distinct from old.customer_id) then
    update customers set parcels_count = greatest(parcels_count - 1, 0) where id = old.customer_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.customer_id is not null
     and (tg_op = 'INSERT' or new.customer_id is distinct from old.customer_id) then
    update customers set parcels_count = parcels_count + 1,
                         last_parcel_at = greatest(coalesce(last_parcel_at, new.created_at), new.created_at)
     where id = new.customer_id;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_parcels_customer on public.parcels;
create trigger trg_parcels_customer after insert or update of customer_id or delete on public.parcels
  for each row execute function public.bump_customer();
revoke execute on function public.bump_customer(), public.log_parcel_change(), public.parcels_guard_status() from public, anon, authenticated;

-- 9. Μία φορά: σωστοί μετρητές πελατών (γρήγορο: ~30 χιλ. πελάτες)
update public.customers c set parcels_count = x.n
  from (select c2.id, count(p.id)::int n from public.customers c2 left join public.parcels p on p.customer_id = c2.id group by c2.id) x
 where x.id = c.id and c.parcels_count is distinct from x.n;

-- 10. «Πίνακας οργάνων» για την 🩺 Κατάσταση συστήματος (μόνο συνδεδεμένοι)
create or replace function public.ops_health() returns jsonb
language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'at', now(),
    'db_mb', round(pg_database_size(current_database()) / 1048576.0),
    'tables_mb', (select jsonb_object_agg(relname, round(pg_total_relation_size(relid) / 1048576.0, 1)) from pg_stat_user_tables where schemaname = 'public'),
    'dead_rows', (select jsonb_object_agg(relname, n_dead_tup) from pg_stat_user_tables where schemaname = 'public' and n_dead_tup > 10000),
    'open_parcels', (select count(*) from parcels where status in ('arrived', 'notified', 'transit')),
    'parcels_24h', (select count(*) from parcels where created_at > now() - interval '24 hours'),
    'activity_24h', (select count(*) from activity_log where at > now() - interval '24 hours'),
    'queue_pending', (select count(*) from extraction_queue where status = 'pending'),
    'queue_pending_mb', (select round(coalesce(sum(coalesce(octet_length(thumbnail), 0) + coalesce(octet_length(package_thumb), 0)), 0) / 1048576.0, 1) from extraction_queue where status = 'pending'),
    'stale_devices', (select count(*) from device_status where (pending_in > 0 or pending_out > 0) and last_seen < now() - interval '10 minutes'),
    'dup_receipts_30d', (select count(*) from (select right(regexp_replace(receipt_no, '\D', '', 'g'), 10) from parcels
                           where receipt_no is not null and created_at > now() - interval '30 days' and length(regexp_replace(receipt_no, '\D', '', 'g')) >= 10
                           group by 1 having count(*) > 1) z),
    'open_pickup_code_clashes', (select count(*) from (select pickup_code from parcels where status in ('arrived', 'notified') group by 1 having count(*) > 1) z),
    'orphan_customers_30d', (select count(*) from customers c where c.created_at < now() - interval '30 days' and not c.starred
                               and not exists (select 1 from parcels p where p.customer_id = c.id)
                               and not exists (select 1 from outgoing o where o.customer_id = c.id)),
    'ai_usd_30d', (select round(coalesce(sum(cost_usd), 0), 2) from ai_usage where at > now() - interval '30 days')
  )
$$;
revoke all on function public.ops_health() from public, anon;
grant execute on function public.ops_health() to authenticated;

insert into public.schema_migrations (version, note) values ('0033', 'ευρετήρια, ακεραιότητα, ιστορικό, ops_health') on conflict (version) do nothing;
commit;
select 'OK — 0033 ευρετήρια, ακεραιότητα, ιστορικό' as αποτέλεσμα;

-- 11. ΜΕΤΑ (χωριστά, όποτε θέλετε): έλεγχος παλιών γραμμών. Αν κάποιο αποτύχει, το μήνυμα λέει ποιο.
-- select count(*) from parcels where pieces_in > pieces_total;
-- select count(*) from parcels where status = 'done' and picked_up_at is null;
-- alter table public.parcels validate constraint parcels_pieces_ck;
-- alter table public.parcels validate constraint parcels_money_ck;
-- alter table public.parcels validate constraint parcels_done_has_pickup_ck;
-- alter table public.customers validate constraint customers_name_ck;
-- alter table public.outgoing validate constraint outgoing_pieces_ck;

-- 12. ΜΕΤΑ από 2–4 εβδομάδες κανονικής χρήσης: ευρετήρια που δεν τα χρησιμοποιεί τίποτα (idx_scan = 0) → διαγραφή
-- select indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) from pg_stat_user_indexes where relname = 'parcels' order by idx_scan;
-- drop index if exists public.parcels_origin_idx, public.parcels_departure_idx, public.parcels_recipient_trgm_idx,
--   public.parcels_tags_idx, public.parcels_bypassed_idx, public.parcels_phone_idx, public.parcels_id_doc_number_idx;
