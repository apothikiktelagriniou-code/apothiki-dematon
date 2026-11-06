-- 0016: ⭐ τακτικοί πελάτες (αποστολείς εξερχομένων) — περιέχει και το 0015, αρκεί να τρέξει μόνο αυτό.
-- ---- 0015 (κλείσιμο ταμείου) — ασφαλές αν έχει ήδη τρέξει
alter table public.outgoing add column if not exists in_cash boolean not null default false;
alter table public.outgoing add column if not exists cash_date date;
create table if not exists public.outgoing_cash (
  id uuid primary key default gen_random_uuid(), cash_date date not null, user_no text,
  total_count int, total_amount numeric(10,2), read_count int, read_amount numeric(10,2),
  summary jsonb not null default '{}', operator text, created_at timestamptz not null default now());
alter table public.outgoing_cash enable row level security;
drop policy if exists staff_all on public.outgoing_cash;
create policy staff_all on public.outgoing_cash for all to authenticated using (true) with check (true);
-- ---- 0016
alter table public.customers add column if not exists starred boolean not null default false;
alter table public.customers add column if not exists starred_at timestamptz;
create index if not exists customers_starred_idx on public.customers (starred) where starred;
create index if not exists outgoing_customer_idx on public.outgoing (customer_id, created_at desc);
select 'OK — 0015 + 0016' as αποτέλεσμα;
