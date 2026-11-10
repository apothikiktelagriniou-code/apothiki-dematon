-- =====================================================================
-- 0030 — Διορθώσεις ασφαλείας (έλεγχος 10/11/2026)
--  1. Αναζήτηση δέματος: η IP παίρνεται πρώτα από την κεφαλίδα του Cloudflare,
--     και προστίθενται όρια που ΔΕΝ εξαρτώνται από την IP (ψεύτικη κεφαλίδα δεν τα παρακάμπτει):
--       • έως 5 λάθος επώνυμα ανά απόδειξη το 24ωρο (δεν «μαντεύει» κανείς τα 3 γράμματα),
--       • έως 150 αποτυχημένες αναζητήσεις συνολικά ανά 10 λεπτά (δεν «σαρώνει» κανείς αποδείξεις).
--  2. Δημοσκόπηση: ίδια διόρθωση IP + έως 60 απαντήσεις συνολικά την ώρα.
--  3. Deploy hook: η βάση δέχεται μόνο σύνδεσμο Cloudflare.
--  4. Ημερολόγιο ενεργειών: κανείς δεν γράφει εγγραφή με όνομα άλλου χρήστη.
--  5. add_piece: αφαιρείται η πρόσβαση από PUBLIC.
-- Ίδια είσοδος/έξοδος συναρτήσεων: η εφαρμογή και το σάιτ δεν αλλάζουν.
-- Επικόλληση → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================

-- Η IP του επισκέπτη: πρώτα η κεφαλίδα του Cloudflare (την ορίζει ο ίδιος ο Cloudflare, όχι ο επισκέπτης),
-- αλλιώς η πρώτη τιμή του x-forwarded-for (όπως πριν). Το όριο ανά IP είναι βοηθητικό· η πραγματική προστασία
-- είναι τα όρια ανά απόδειξη και συνολικά πιο κάτω, που δεν εξαρτώνται από την IP.
create or replace function public.client_ip()
returns text language sql stable set search_path = public as $$
  with h as (select nullif(current_setting('request.headers', true), '')::json as j)
  select coalesce(
    nullif(trim(h.j->>'cf-connecting-ip'), ''),
    nullif(trim(split_part(coalesce(h.j->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown')
  from h;
$$;
revoke all on function public.client_ip() from public;

create table if not exists public.track_fails (
  id bigserial primary key,
  receipt text not null,
  at timestamptz not null default now()
);
create index if not exists track_fails_receipt_at on public.track_fails (receipt, at);
create index if not exists track_fails_at on public.track_fails (at);
alter table public.track_fails enable row level security;   -- καμία πολιτική: κανείς δεν τον διαβάζει απ' έξω
revoke all on public.track_fails from anon, authenticated;

drop function if exists public.track_parcel(text, text);
create function public.track_parcel(p_receipt text, p_name text)
returns table (state text, at timestamptz, origin text, dest text, pieces_in int, pieces_total int)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_ip text := public.client_ip();
  v_d text := regexp_replace(coalesce(p_receipt, ''), '\D', '', 'g');
  v_n text := left(replace(public.norm_key(p_name), ' ', ''), 3);
  v_rows int;
begin
  if (select count(*) from public.track_hits h where h.ip = v_ip and h.at > now() - interval '15 minutes') >= 20 then
    raise exception 'too_many' using errcode = 'P0001', hint = 'Δοκιμάστε ξανά σε 15 λεπτά';
  end if;
  if (select count(*) from public.track_fails f where f.receipt = v_d and f.at > now() - interval '24 hours') >= 5 then
    raise exception 'too_many' using errcode = 'P0001', hint = 'Πολλές λάθος προσπάθειες για αυτή την απόδειξη. Καλέστε μας.';
  end if;
  if (select count(*) from public.track_fails f where f.at > now() - interval '10 minutes') >= 150 then
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
   where length(v_d) >= 10 and length(v_n) = 3
     and not (p.bypassed and p.status = 'not_arrived')
     and (regexp_replace(p.receipt_no, '\D', '', 'g') = v_d
          or (length(regexp_replace(p.receipt_no, '\D', '', 'g')) > length(v_d) and regexp_replace(p.receipt_no, '\D', '', 'g') like '%' || v_d)
          or (length(v_d) > length(regexp_replace(p.receipt_no, '\D', '', 'g')) and v_d like '%' || regexp_replace(p.receipt_no, '\D', '', 'g') and length(regexp_replace(p.receipt_no, '\D', '', 'g')) >= 10))
     and left(split_part(public.norm_key(p.recipient_name), ' ', 1), 3) = v_n
   order by p.created_at desc
   limit 1;
  get diagnostics v_rows = row_count;
  if v_rows = 0 and length(v_d) >= 10 then
    insert into public.track_fails (receipt) values (v_d);
  end if;
end;
$$;
revoke all on function public.track_parcel(text, text) from public;
grant execute on function public.track_parcel(text, text) to anon, authenticated;

create or replace function public.submit_poll(p jsonb)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_ip text := public.client_ip();
  v_wants text[];
begin
  if (select count(*) from public.poll_hits h where h.ip = v_ip and h.at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  if (select count(*) from public.poll_hits h where h.at > now() - interval '1 hour') >= 60 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  insert into public.poll_hits (ip) values (v_ip);
  if random() < 0.05 then delete from public.poll_hits h where h.at < now() - interval '24 hours'; end if;

  select coalesce(array_agg(distinct w.v), '{}') into v_wants
    from jsonb_array_elements_text(case when jsonb_typeof(p->'wants') = 'array' then p->'wants' else '[]'::jsonb end) as w(v)
   where w.v in ('home', 'pickup', 'work');

  insert into public.poll_responses (poll, would_use, frequency, price, wants, who, area, comment, lang, source)
  values ('spiti-2026', p->>'would_use', nullif(p->>'frequency', ''), nullif(p->>'price', ''), v_wants,
          nullif(p->>'who', ''), nullif(p->>'area', ''), left(nullif(trim(p->>'comment'), ''), 500),
          coalesce(nullif(p->>'lang', ''), 'el'), left(regexp_replace(coalesce(p->>'source', 'web'), '[^a-z0-9_-]', '', 'g'), 20));
  return 'ok';
end;
$$;
revoke all on function public.submit_poll(jsonb) from public;
grant execute on function public.submit_poll(jsonb) to anon, authenticated;

-- 3. Deploy hook: μόνο σύνδεσμος Cloudflare (NOT VALID: δεν ελέγχει ό,τι υπάρχει ήδη, μόνο τις νέες αλλαγές)
alter table public.site_settings drop constraint if exists site_settings_deploy_hook_fmt;
alter table public.site_settings add constraint site_settings_deploy_hook_fmt check (
  key <> 'deploy_hook' or value is null or value = ''
  or value ~ '^https://api\.cloudflare\.com/client/v4/(pages/webhooks|workers/builds)/deploy_hooks/[A-Za-z0-9-]+$'
) not valid;

-- 4. Ημερολόγιο: όχι εγγραφές στο όνομα άλλου χρήστη
drop policy if exists log_insert on public.activity_log;
create policy log_insert on public.activity_log for insert to authenticated with check (user_id is null or user_id = auth.uid());

-- 5. add_piece: μόνο συνδεδεμένοι
do $$ begin
  execute 'revoke all on function public.add_piece(text, int) from public';
  execute 'grant execute on function public.add_piece(text, int) to authenticated';
exception when undefined_function then null; end $$;

select 'OK — διορθώσεις ασφαλείας 0030' as αποτέλεσμα;
