-- =====================================================================
-- 0023 — 🎁 Κλήρωση λίστας αναμονής «Παράδοση στο σπίτι»
-- Συμμετοχές από τη φόρμα της ιστοσελίδας (μέσω WhatsApp/email) ή από τον πάγκο.
-- Μία συμμετοχή ανά κινητό ανά κλήρωση. Διαγραφή 6 μήνες μετά την κλήρωση (κουμπί στην εφαρμογή).
-- Επικόλληση → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================
create table if not exists public.contest_entries (
  id bigserial primary key,
  contest text not null default 'spiti-2026',
  name text not null,
  phone text not null,
  address text,
  source text not null default 'website',   -- website | counter | phone
  note text,
  operator text,
  created_at timestamptz not null default now(),
  rank int,                                  -- 1..N νικητές, N+1..2N αναπληρωματικοί (μετά την κλήρωση)
  drawn_at timestamptz,
  drawn_by text,
  contacted_at timestamptz,
  claimed_at timestamptz,
  unique (contest, phone)
);
alter table public.contest_entries enable row level security;
drop policy if exists staff_all on public.contest_entries;
create policy staff_all on public.contest_entries for all to authenticated using (true) with check (true);
select 'OK — πίνακας συμμετοχών κλήρωσης' as αποτέλεσμα;
