-- 0015: κλείσιμο ταμείου ΚΤΕΛ → αντιπαραβολή με τα εξερχόμενα
alter table public.outgoing add column if not exists in_cash boolean not null default false;  -- υπάρχει στο κλείσιμο ταμείου
alter table public.outgoing add column if not exists cash_date date;
create table if not exists public.outgoing_cash (
  id            uuid primary key default gen_random_uuid(),
  cash_date     date not null,
  user_no       text,
  total_count   int,
  total_amount  numeric(10,2),
  read_count    int,
  read_amount   numeric(10,2),
  summary       jsonb not null default '{}',
  operator      text,
  created_at    timestamptz not null default now()
);
alter table public.outgoing_cash enable row level security;
drop policy if exists staff_all on public.outgoing_cash;
create policy staff_all on public.outgoing_cash for all to authenticated using (true) with check (true);
select 'OK — 0015' as αποτέλεσμα;
