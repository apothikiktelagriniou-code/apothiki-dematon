-- =====================================================================
-- 0024 — 📊 Δημοσκόπηση «Παράδοση στο σπίτι» (ανώνυμη, από την ιστοσελίδα)
-- Ο κόσμος ΜΟΝΟ στέλνει απαντήσεις (submit_poll)· δεν διαβάζει τίποτα.
-- Το προσωπικό βλέπει τα αποτελέσματα στην εφαρμογή (🎁 Κλήρωση).
-- Όριο: 5 απαντήσεις ανά IP ανά ώρα· οι IP σβήνονται σε 24 ώρες.
-- Επικόλληση → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================
create table if not exists public.poll_responses (
  id bigserial primary key,
  poll text not null default 'spiti-2026',
  created_at timestamptz not null default now(),
  would_use text not null check (would_use in ('yes', 'maybe', 'no')),
  frequency text check (frequency in ('weekly', 'monthly', 'yearly', 'rarely')),
  price text check (price in ('2', '3', '4', '5plus', 'none')),
  wants text[] not null default '{}',
  who text check (who in ('private', 'business')),
  area text check (area in ('center', 'town', 'outside')),
  comment text check (char_length(comment) <= 500),
  lang text check (lang in ('el', 'en')),
  source text check (char_length(source) <= 20)
);
alter table public.poll_responses enable row level security;
drop policy if exists staff_read on public.poll_responses;
create policy staff_read on public.poll_responses for select to authenticated using (true);
drop policy if exists staff_delete on public.poll_responses;
create policy staff_delete on public.poll_responses for delete to authenticated using (true);
revoke all on public.poll_responses from anon;

create table if not exists public.poll_hits (id bigserial primary key, ip text not null, at timestamptz not null default now());
create index if not exists poll_hits_ip_at on public.poll_hits (ip, at);
alter table public.poll_hits enable row level security;
revoke all on public.poll_hits from anon, authenticated;

create or replace function public.submit_poll(p jsonb)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_hdr json := nullif(current_setting('request.headers', true), '')::json;
  v_ip text := coalesce(nullif(trim(split_part(coalesce(v_hdr->>'x-forwarded-for', ''), ',', 1)), ''), v_hdr->>'cf-connecting-ip', 'unknown');
  v_wants text[];
begin
  if (select count(*) from public.poll_hits h where h.ip = v_ip and h.at > now() - interval '1 hour') >= 5 then
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
select 'OK — δημοσκόπηση έτοιμη' as αποτέλεσμα;
