-- 0021: Κατάσταση συστήματος — παρακολούθηση SMS + εκκρεμών offline καταχωρίσεων ανά συσκευή
alter table public.parcels add column if not exists sms_state text;
alter table public.parcels add column if not exists sms_state_at timestamptz;
create table if not exists public.device_status (
  id text primary key,            -- τυχαίο αναγνωριστικό συσκευής (localStorage)
  operator text, kind text, version text,
  pending_in int not null default 0,   -- φωτογραφίες εισερχομένων που δεν στάλθηκαν
  pending_out int not null default 0,  -- φορτώσεις εξερχομένων που δεν στάλθηκαν
  oldest_pending timestamptz, online boolean, last_seen timestamptz not null default now()
);
alter table public.device_status enable row level security;
drop policy if exists staff_all on public.device_status;
create policy staff_all on public.device_status for all to authenticated using (true) with check (true);
