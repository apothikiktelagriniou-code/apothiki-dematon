-- =====================================================================
-- 0025 — 💳 Αιτήματα πληρωμής (σύνδεσμος Viva / IRIS) για πληρωμή από τρίτο και παράδοση στο σπίτι
-- Ο σύνδεσμος φτιάχνεται στο Viva (Quick Pay) ΜΕΤΑ το ζύγισμα και επικολλάται στην εφαρμογή.
-- fare = ναύλος ΚΤΕΛ (αποδίδεται στο ταμείο ημέρας) · service = δική μας χρέωση (σπίτι, φύλαξη κ.λπ.)
-- Επικόλληση → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================
create table if not exists public.payment_requests (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  receipt text,                                   -- αριθμός απόδειξης ΚΤΕΛ (αν υπάρχει)
  purpose text not null default 'fare' check (purpose in ('fare', 'home', 'pickup', 'storage', 'other')),
  payer_name text,
  payer_phone text,
  recipient text,                                 -- για ποιον/ποιο δέμα πληρώνει
  fare numeric(8,2) not null default 0 check (fare >= 0),
  service numeric(8,2) not null default 0 check (service >= 0),
  amount numeric(8,2) generated always as (fare + service) stored,
  link text,                                      -- σύνδεσμος Viva Quick Pay
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  paid_method text check (paid_method in ('card', 'iris', 'other')),
  paid_at timestamptz,
  settled_at timestamptz,                         -- ο ναύλος αποδόθηκε στο ταμείο ημέρας ΚΤΕΛ
  operator text,
  note text check (char_length(note) <= 300)
);
create index if not exists payment_requests_status on public.payment_requests (status, created_at desc);
alter table public.payment_requests enable row level security;
drop policy if exists staff_all on public.payment_requests;
create policy staff_all on public.payment_requests for all to authenticated using (true) with check (true);
revoke all on public.payment_requests from anon;
select 'OK — αιτήματα πληρωμής' as αποτέλεσμα;
