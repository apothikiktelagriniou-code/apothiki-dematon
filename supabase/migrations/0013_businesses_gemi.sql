-- 0013: βάση επιχειρήσεων Δήμου Αγρινίου από το ΓΕΜΗ (Open Data, άδεια ODC-BY 1.0) — για αναγνώριση ονομάτων παραληπτών
-- ΔΕΝ αποθηκεύεται ΑΦΜ.
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.businesses (
  ar_gemi     text primary key,
  name        text not null,
  titles      text,
  legal_type  text,
  is_sole     boolean not null default false,
  street      text,
  street_no   text,
  city        text,
  zip         text,
  phone       text,
  email       text,
  activity    text,
  status      text,
  synced_at   timestamptz not null default now(),
  name_norm   text generated always as (public.norm_key(name)) stored,
  titles_norm text generated always as (public.norm_key(coalesce(titles, ''))) stored
);
create index if not exists businesses_name_trgm on public.businesses using gin (name_norm extensions.gin_trgm_ops);
create index if not exists businesses_titles_trgm on public.businesses using gin (titles_norm extensions.gin_trgm_ops);

alter table public.businesses enable row level security;
drop policy if exists staff_all on public.businesses;
create policy staff_all on public.businesses for all to authenticated using (true) with check (true);

-- «Μήπως είναι η επιχείρηση…;» — οι 5 πιο κοντινές
create or replace function public.match_business(q text)
returns table (ar_gemi text, name text, titles text, is_sole boolean, street text, street_no text, city text, zip text,
               phone text, email text, activity text, sim real)
language sql stable security invoker set search_path = public, extensions as $$
  with k as (select public.norm_key(q) as k)
  select b.ar_gemi, b.name, b.titles, b.is_sole, b.street, b.street_no, b.city, b.zip, b.phone, b.email, b.activity,
         greatest(similarity(b.name_norm, k.k), similarity(b.titles_norm, k.k),
                  word_similarity(k.k, b.name_norm), word_similarity(k.k, b.titles_norm)) as sim
    from public.businesses b, k
   where length(k.k) >= 3 and (b.name_norm % k.k or b.titles_norm % k.k or k.k <% b.name_norm or k.k <% b.titles_norm)
   order by sim desc
   limit 5;
$$;
grant execute on function public.match_business(text) to authenticated;

alter table public.parcels drop constraint if exists parcels_phone_source_check;
alter table public.parcels add constraint parcels_phone_source_check
  check (phone_source is null or phone_source in ('label','handwritten','customer_db','manual','business_web','gemi'));

select 'OK — 0013' as αποτέλεσμα;
