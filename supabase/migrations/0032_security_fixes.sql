-- =====================================================================
-- 0032 — Διορθώσεις ασφαλείας (2ος έλεγχος, 11/11/2026). ΤΡΕΧΕΙ ΜΕΤΑ ΤΑ 0030 ΚΑΙ 0031.
--  1. Αναζήτηση: απόρριψη αριθμών απόδειξης > 20 ψηφίων (έκλεινε το κενό που παρέκαμπτε ΟΛΑ τα όρια)
--     και ο μετρητής λαθών κρατάει τα 10 τελευταία ψηφία (δεν παρακάμπτεται με ψηφία μπροστά).
--  2. IPv6: μία σύνδεση μετράει ως μία (/64), όχι ως χιλιάδες διευθύνσεις.
--  3. Τα συνολικά όρια δεν κλειδώνουν εύκολα την υπηρεσία για όλους (μεγαλύτερα, το βάρος στα όρια ανά IP).
--  4. Μέτρηση κλικ: μόνο γνωστές σελίδες/σημεία, όριο ανά σύνδεση (χωρίς να αποθηκεύεται IP — μόνο
--     ένα «αποτύπωμα» που αλλάζει κάθε μέρα και σβήνεται), ατομικός μετρητής ημέρας.
--  5. Σύνολα μετρήσεων για τη διαχείριση από τη βάση (όχι κόψιμο στις 1.000 γραμμές).
--  6. Ημερολόγιο ενεργειών: κάθε εγγραφή με τον χρήστη που τη γράφει.
--  7. Deploy hook: έλεγχος και της τιμής που υπάρχει ήδη. Τηλέφωνο σταθμού: μόνο ψηφία/σύμβολα τηλεφώνου.
-- Επικόλληση → SQL Editor → Run. Ασφαλές να τρέξει ξανά. Η εφαρμογή και το σάιτ δεν αλλάζουν συμπεριφορά.
-- =====================================================================

-- 2. IP: IPv6 → /64
create or replace function public.client_ip()
returns text language sql stable set search_path = public as $$
  with h as (select nullif(current_setting('request.headers', true), '')::json as j),
       r as (select coalesce(
               nullif(trim(h.j->>'cf-connecting-ip'), ''),
               nullif(trim(split_part(coalesce(h.j->>'x-forwarded-for', ''), ',', 1)), ''),
               'unknown') as ip from h)
  select case when ip like '%:%' then array_to_string((string_to_array(ip, ':'))[1:4], ':') || '::/64' else ip end from r;
$$;
revoke all on function public.client_ip() from public;

-- 1 + 3. Αναζήτηση δέματος
drop function if exists public.track_parcel(text, text);
create function public.track_parcel(p_receipt text, p_name text)
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
  -- κάθε έλεγχος που μπορεί να αποτύχει γίνεται ΠΡΙΝ από τους μετρητές και επιστρέφει κανονικά
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
   where not (p.bypassed and p.status = 'not_arrived')
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

-- 3. Δημοσκόπηση: συνολικό όριο 300/ώρα (το βάρος στο όριο ανά IP: 5/ώρα)
create or replace function public.submit_poll(p jsonb)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_ip text := public.client_ip();
  v_wants text[];
begin
  if (select count(*) from public.poll_hits h where h.ip = v_ip and h.at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  if (select count(*) from public.poll_hits h where h.at > now() - interval '1 hour') >= 300 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  insert into public.poll_hits (ip) values (v_ip);
  if random() < 0.05 then delete from public.poll_hits h where h.at < now() - interval '24 hours'; end if;

  select coalesce(array_agg(distinct w.v), '{}') into v_wants
    from jsonb_array_elements_text(case when jsonb_typeof(p->'wants') = 'array' then p->'wants' else '[]'::jsonb end) as w(v)
   where w.v in ('home', 'pickup', 'work');

  insert into public.poll_responses (poll, would_use, frequency, price, wants, who, area, comment, lang, source)
  values ('spiti-2026', left(p->>'would_use', 20), left(nullif(p->>'frequency', ''), 20), left(nullif(p->>'price', ''), 20), v_wants,
          left(nullif(p->>'who', ''), 30), left(nullif(p->>'area', ''), 60), left(nullif(trim(p->>'comment'), ''), 500),
          left(coalesce(nullif(p->>'lang', ''), 'el'), 2), left(regexp_replace(coalesce(p->>'source', 'web'), '[^a-z0-9_-]', '', 'g'), 20));
  return 'ok';
end;
$$;
revoke all on function public.submit_poll(jsonb) from public;
grant execute on function public.submit_poll(jsonb) to anon, authenticated;

-- 4. Μέτρηση κλικ
create table if not exists public.click_hits (k text not null, at timestamptz not null default now());
create index if not exists click_hits_k_at on public.click_hits (k, at);
alter table public.click_hits enable row level security;
revoke all on public.click_hits from anon, authenticated;

create table if not exists public.site_clicks_total (day date primary key, total int not null default 0);
alter table public.site_clicks_total enable row level security;
revoke all on public.site_clicks_total from anon, authenticated;

create or replace function public.track_click(p_e text, p_p text default '', p_s text default '')
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_e text := lower(coalesce(p_e, ''));
  v_p text := lower(left(coalesce(p_p, ''), 60));
  v_s text := lower(left(coalesce(p_s, ''), 30));
  v_base text;
  v_k text := md5(public.client_ip() || current_date::text);   -- αλλάζει κάθε μέρα· η IP δεν αποθηκεύεται
  v_ok int;
begin
  if v_e not in ('call', 'whatsapp', 'viber', 'directions', 'calc', 'track', 'email') then return; end if;
  v_base := regexp_replace(v_p, '^(dokimi/)?(en/)?', '');
  if not (v_p ~ '^(dokimi/)?(en/)?[a-z0-9-]{1,40}$'
          and (v_base = any (array['index','anazitisi','aporrito','apostoli','epikoinonia','epixeiriseis','foitites','fylaxi-aposkevon',
                 'istoria','klirosi','ladi','nomothesia','oroi','paralavi','poll','proorismoi','spiti','syxnes-erotiseis',
                 'business','contact','destinations','faq','giveaway','history','home-delivery','legislation','luggage-storage',
                 'olive-oil','privacy','receive','send','students','terms','track'])
               or v_base ~ '^(dema|parcel)-agrinio-[a-z]{2,20}$')) then
    v_p := 'other';
  end if;
  if v_s not in ('', 'quickbar', 'calc', 'hero', 'board', 'cta', 'track', 'dest', 'footer', 'page') then v_s := 'other'; end if;
  -- έως 60 κλικ την ώρα ανά σύνδεση
  if (select count(*) from public.click_hits where k = v_k and at > now() - interval '1 hour') >= 60 then return; end if;
  insert into public.click_hits (k) values (v_k);
  if random() < 0.02 then delete from public.click_hits where at < now() - interval '24 hours'; end if;
  -- ατομικός μετρητής ημέρας (έως 20.000)
  insert into public.site_clicks_total as t (day, total) values (current_date, 1)
  on conflict (day) do update set total = t.total + 1 where t.total < 20000
  returning 1 into v_ok;
  if v_ok is null then return; end if;
  insert into public.site_clicks as c (day, event, page, spot, n) values (current_date, v_e, v_p, v_s, 1)
  on conflict (day, event, page, spot) do update set n = c.n + 1;
end;
$$;
revoke all on function public.track_click(text, text, text) from public;
grant execute on function public.track_click(text, text, text) to anon, authenticated;

-- 5. Σύνολα για τη διαχείριση
create or replace function public.site_clicks_summary(p_days int default 30)
returns table (event text, page text, spot text, n bigint, test bigint)
language sql stable security invoker set search_path = public as $$
  select event, regexp_replace(page, '^dokimi/', ''), spot,
         sum(n) filter (where page not like 'dokimi/%'), sum(n) filter (where page like 'dokimi/%')
    from public.site_clicks
   where day >= current_date - (least(greatest(coalesce(p_days, 30), 1), 366) - 1)
   group by 1, 2, 3 order by 4 desc nulls last limit 1000;
$$;
revoke all on function public.site_clicks_summary(int) from public, anon;
grant execute on function public.site_clicks_summary(int) to authenticated;

-- 6. Ημερολόγιο: οι εγγραφές των triggers (security definer) δεν επηρεάζονται
drop policy if exists log_insert on public.activity_log;
create policy log_insert on public.activity_log for insert to authenticated with check (user_id = auth.uid());

-- 7. Deploy hook: έλεγχος και της υπάρχουσας τιμής· τηλέφωνο σταθμού
do $$ begin
  alter table public.site_settings validate constraint site_settings_deploy_hook_fmt;
exception when check_violation then
  raise warning 'Ο αποθηκευμένος σύνδεσμος ανανέωσης ΔΕΝ είναι σύνδεσμος Cloudflare. Ανοίξτε τη διαχείριση και βάλτε τον σωστό.';
when undefined_object then null; end $$;

alter table public.site_destinations drop constraint if exists site_destinations_terminal_phone_fmt;
alter table public.site_destinations add constraint site_destinations_terminal_phone_fmt
  check (terminal_phone is null or terminal_phone ~ '^[0-9 +(),;./-]*$') not valid;

-- 8. Ώρες δρομολογίων: όχι «24:30» (έως 23:59)
alter table public.site_schedule drop constraint if exists site_schedule_time_fmt;
alter table public.site_schedule add constraint site_schedule_time_fmt check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') not valid;

select 'OK — διορθώσεις ασφαλείας 0032' as αποτέλεσμα;
