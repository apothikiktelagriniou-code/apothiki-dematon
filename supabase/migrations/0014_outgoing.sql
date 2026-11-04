-- 0014: ΕΞΕΡΧΟΜΕΝΑ δέματα (ξεχωριστά από τα εισερχόμενα) + καταστάσεις φόρτωσης + ποσοστά προμήθειας
create table if not exists public.outgoing (
  id               uuid primary key default gen_random_uuid(),
  receipt_no       text,
  parcel_code      text,
  fare_eur         numeric(8,2),
  issued_at        timestamptz,
  departure_at     timestamptz,
  sender_name      text,
  sender_phone     text,
  recipient_name   text,
  recipient_phone  text,
  origin_city      text not null default 'ΑΓΡΙΝΙΟ',
  destination_city text,
  pieces           int not null default 1,
  is_handwritten   boolean not null default false,
  status           text not null default 'waiting' check (status in ('waiting','loaded','not_loaded','cancelled')),
  status_at        timestamptz not null default now(),
  loaded_at        timestamptz,
  in_report        boolean not null default false,   -- υπάρχει στην κατάσταση του συστήματος ΚΤΕΛ
  photographed     boolean not null default false,   -- υπάρχει φωτογραφία απόδειξης
  report_id        uuid,
  customer_id      uuid references public.customers(id) on delete set null,
  sms_sent_at      timestamptz,
  notes            text,
  operator         text,
  extraction_confidence jsonb,
  created_at       timestamptz not null default now()
);
create unique index if not exists outgoing_receipt_uniq on public.outgoing (receipt_no) where receipt_no is not null and receipt_no <> '';
create index if not exists outgoing_departure_idx on public.outgoing (departure_at desc);
create index if not exists outgoing_created_idx on public.outgoing (created_at desc);

create table if not exists public.outgoing_reports (
  id             uuid primary key default gen_random_uuid(),
  departure_at   timestamptz,
  total_declared int,
  items          jsonb not null default '[]',
  operator       text,
  created_at     timestamptz not null default now()
);

alter table public.outgoing enable row level security;
alter table public.outgoing_reports enable row level security;
drop policy if exists staff_all on public.outgoing;
create policy staff_all on public.outgoing for all to authenticated using (true) with check (true);
drop policy if exists staff_all on public.outgoing_reports;
create policy staff_all on public.outgoing_reports for all to authenticated using (true) with check (true);

-- ποσοστά για το ταμείο εξερχομένων (αλλάζουν από την εφαρμογή)
alter table public.app_settings add column if not exists out_rates jsonb not null default '{"commission_pct": 18}';

-- ζωντανή ενημέρωση σε όλες τις συσκευές
do $$ begin
  begin alter publication supabase_realtime add table public.outgoing; exception when others then null; end;
end $$;

select 'OK — 0014' as αποτέλεσμα;
