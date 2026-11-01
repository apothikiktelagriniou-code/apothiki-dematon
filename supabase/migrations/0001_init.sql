-- =====================================================================
-- Αποθήκη Δεμάτων ΚΤΕΛ Αγρινίου — αρχική δομή βάσης (v1)
-- Επικόλληση ολόκληρου του αρχείου στο Supabase → SQL Editor → Run.
-- Ασφαλές να τρέξει ξανά: δεν σβήνει δεδομένα.
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------- βοηθητικές συναρτήσεις ----------
create or replace function public.norm_key(t text) returns text
language sql immutable as $$
  select upper(regexp_replace(trim(translate(coalesce(t,''),
    'άέήίόύώϊϋΐΰΆΈΉΊΌΎΏΪΫ','αεηιουωιυιυΑΕΗΙΟΥΩΙΥ')), '\s+', ' ', 'g'))
$$;

create or replace function public.set_audit_fields() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- ---------- ρυθμίσεις (μία γραμμή) ----------
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  reminder_days int not null default 3,
  second_reminder_days int not null default 7,
  return_after_days int not null default 30,
  transit_alert_hours int not null default 3,
  old_parcel_days int not null default 5,
  retention_months int not null default 12,
  max_reasonable_fare_eur numeric(8,2) not null default 40,
  notification_template text not null default
'Καλησπέρα σας! Το δέμα σας{αρ} {από} έφτασε στην Αποθήκη Ασυνοδεύτων ΚΤΕΛ, σταθμός Αγρινίου.
{κωδικός}

🏠 Θέλετε να σας το φέρουμε στο σπίτι; Μόνο 3,50 € — απαντήστε ΝΑΙ και τη διεύθυνσή σας.

Παραλαβή από τον σταθμό: Δευ–Παρ 06:30–21:30, Σαβ–Κυρ 08:00–21:30. Φέρτε ταυτότητα.
26410 24446 · 697 933 4186',
  reminder_template text not null default
'Καλησπέρα σας! Υπενθύμιση: το δέμα σας{αρ} σας περιμένει στην Αποθήκη Ασυνοδεύτων ΚΤΕΛ, σταθμός Αγρινίου.
{κωδικός}

🏠 Θέλετε να σας το φέρουμε στο σπίτι; Μόνο 3,50 € — απαντήστε ΝΑΙ και τη διεύθυνσή σας.

Παραλαβή: Δευ–Παρ 06:30–21:30, Σαβ–Κυρ 08:00–21:30. Φέρτε ταυτότητα.
26410 24446 · 697 933 4186',
  city_colors jsonb not null default '{"ΑΘΗΝΑ":"#1d4ed8","ΠΑΤΡΑ":"#c2410c","ΘΕΣΣΑΛΟΝΙΚΗ":"#7e22ce","ΙΩΑΝΝΙΝΑ":"#15803d","ΜΕΣΟΛΟΓΓΙ":"#0f766e","ΝΑΥΠΑΚΤΟΣ":"#be123c","ΠΡΕΒΕΖΑ":"#a16207","ΛΕΥΚΑΔΑ":"#0369a1","ΑΡΤΑ":"#4d7c0f","ΑΜΦΙΛΟΧΙΑ":"#9d174d"}'::jsonb,
  created_at timestamptz default now(),
  created_by uuid,
  updated_at timestamptz default now(),
  updated_by uuid
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- ---------- πελάτες ----------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  name_key text generated always as (public.norm_key(full_name)) stored,
  surname_key text generated always as (split_part(public.norm_key(full_name), ' ', 1)) stored,
  phones text[] not null default '{}',
  address text,
  area text,
  notes text,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  parcels_count int not null default 0,
  last_parcel_at timestamptz,
  created_at timestamptz default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz default now(),
  updated_by uuid
);
create index if not exists customers_name_key_idx on public.customers (name_key);
create index if not exists customers_name_trgm_idx on public.customers using gin (name_key gin_trgm_ops);
create index if not exists customers_phones_idx on public.customers using gin (phones);

-- ---------- δέματα ----------
create table if not exists public.parcels (
  id uuid primary key default gen_random_uuid(),
  receipt_no text unique,
  parcel_code text,
  kind text not null default 'Ασυνόδευτο' check (kind in ('Συνοδευτικό','Ασυνόδευτο')),
  item text,
  origin_city text,
  destination_city text not null default 'ΑΓΡΙΝΙΟ',
  is_transit boolean generated always as (destination_city <> 'ΑΓΡΙΝΙΟ') stored,
  issued_at timestamptz,
  departure_at timestamptz,
  fare_eur numeric(8,2),
  sender_name text,
  recipient_name text not null default '',
  recipient_phone text check (recipient_phone is null or recipient_phone ~ '^(69[0-9]{8}|2[0-9]{9})$'),
  phone_source text check (phone_source in ('label','handwritten','customer_db','manual')),
  phone_confirmed boolean not null default false,
  customer_id uuid references public.customers(id) on delete set null,
  shelf text,
  shelf_manual boolean not null default false,
  cod_amount_eur numeric(8,2),
  cod_collected boolean not null default false,
  status text not null default 'arrived'
    check (status in ('arrived','notified','done','transit','forwarded','returned')),
  status_at timestamptz not null default now(),
  notified_at timestamptz,
  notify_count int not null default 0,
  notify_channel text,
  pickup_code text not null default lpad((floor(random()*10000))::int::text, 4, '0'),
  picked_up_at timestamptz,
  picked_by_name text,
  picked_by_phone text,
  id_doc_type text check (id_doc_type in ('Ταυτότητα','Δίπλωμα','Διαβατήριο')),
  id_doc_last4 text check (id_doc_last4 is null or length(id_doc_last4) <= 4),
  signature_path text,
  home_delivery boolean not null default false,
  fwd_destination text,
  fwd_departure_at timestamptz,
  fwd_note text,
  fwd_at timestamptz,
  damaged boolean not null default false,
  damage_note text,
  damage_photo_paths text[],
  notes text,
  extraction_confidence jsonb,
  source text not null default 'manual' check (source in ('photo_auto','photo_reviewed','manual','import')),
  batch_id uuid,
  created_at timestamptz default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz default now(),
  updated_by uuid
);
create index if not exists parcels_status_idx on public.parcels (status);
create index if not exists parcels_origin_idx on public.parcels (origin_city);
create index if not exists parcels_departure_idx on public.parcels (departure_at);
create index if not exists parcels_fwd_departure_idx on public.parcels (fwd_departure_at);
create index if not exists parcels_phone_idx on public.parcels (recipient_phone);
create index if not exists parcels_customer_idx on public.parcels (customer_id);
create index if not exists parcels_created_idx on public.parcels (created_at desc);
create index if not exists parcels_pickup_code_idx on public.parcels (pickup_code);
create index if not exists parcels_recipient_trgm_idx on public.parcels using gin (public.norm_key(recipient_name) gin_trgm_ops);

-- νέα μεταφόρτωση ξεκινά με status 'transit'
create or replace function public.parcels_before_insert() returns trigger
language plpgsql as $$
begin
  new.origin_city := nullif(public.norm_key(new.origin_city), '');
  new.destination_city := coalesce(nullif(public.norm_key(new.destination_city), ''), 'ΑΓΡΙΝΙΟ');
  if new.destination_city <> 'ΑΓΡΙΝΙΟ' then
    new.shelf := null;
    if new.status = 'arrived' then new.status := 'transit'; end if;
  end if;
  return new;
end $$;

-- ---------- ουρά ελέγχου & παρτίδες ----------
create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  photo_count int not null default 0,
  auto_saved int not null default 0,
  queued int not null default 0,
  failed int not null default 0,
  device text,
  created_at timestamptz default now(),
  created_by uuid default auth.uid()
);

create table if not exists public.extraction_queue (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.batches(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','saved','discarded')),
  extracted jsonb not null default '{}'::jsonb,
  problems text[] not null default '{}',
  thumbnail text,
  parcel_id uuid references public.parcels(id) on delete set null,
  created_at timestamptz default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz default now(),
  updated_by uuid
);
create index if not exists queue_status_idx on public.extraction_queue (status, created_at);

-- ---------- ιστορικό ενεργειών ----------
create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  parcel_id uuid references public.parcels(id) on delete cascade,
  action text not null,
  details jsonb
);
create index if not exists activity_parcel_idx on public.activity_log (parcel_id, at);
create index if not exists activity_at_idx on public.activity_log (at desc);

-- ---------- σημειώματα βάρδιας ----------
create table if not exists public.shift_notes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  done boolean not null default false,
  created_at timestamptz default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz default now(),
  updated_by uuid
);

-- ---------- κόστος AI ----------
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,5),
  ok boolean
);

-- ---------- triggers ----------
do $$
declare t text;
begin
  foreach t in array array['customers','parcels','extraction_queue','shift_notes','app_settings'] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit before insert or update on public.%I for each row execute function public.set_audit_fields()', t);
  end loop;
end $$;

drop trigger if exists trg_parcels_bi on public.parcels;
create trigger trg_parcels_bi before insert on public.parcels
  for each row execute function public.parcels_before_insert();

-- αυτόματη καταγραφή στο ιστορικό
create or replace function public.log_parcel_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into activity_log(parcel_id, action, details, user_id)
    values (new.id, 'create', jsonb_build_object('source', new.source), auth.uid());
  elsif new.status is distinct from old.status then
    insert into activity_log(parcel_id, action, details, user_id)
    values (new.id, 'status:' || new.status,
            jsonb_build_object('from', old.status, 'channel', new.notify_channel), auth.uid());
  elsif new.damaged and not old.damaged then
    insert into activity_log(parcel_id, action, details, user_id)
    values (new.id, 'damage', jsonb_build_object('note', new.damage_note), auth.uid());
  else
    insert into activity_log(parcel_id, action, details, user_id)
    values (new.id, 'update', null, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_parcels_log on public.parcels;
create trigger trg_parcels_log after insert or update on public.parcels
  for each row execute function public.log_parcel_change();

-- μετρητές πελάτη
create or replace function public.bump_customer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is not null and (tg_op = 'INSERT' or new.customer_id is distinct from old.customer_id) then
    update customers set parcels_count = parcels_count + 1,
                         last_parcel_at = greatest(coalesce(last_parcel_at, new.created_at), new.created_at)
    where id = new.customer_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_parcels_customer on public.parcels;
create trigger trg_parcels_customer after insert or update of customer_id on public.parcels
  for each row execute function public.bump_customer();

-- ---------- ασφάλεια: μόνο συνδεδεμένοι χρήστες ----------
do $$
declare t text;
begin
  foreach t in array array['app_settings','customers','parcels','batches','extraction_queue','activity_log','shift_notes','ai_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('create policy staff_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
-- το ιστορικό δεν διαγράφεται/αλλάζει από την εφαρμογή
drop policy if exists staff_all on public.activity_log;
drop policy if exists log_read on public.activity_log;
drop policy if exists log_insert on public.activity_log;
create policy log_read on public.activity_log for select to authenticated using (true);
create policy log_insert on public.activity_log for insert to authenticated with check (true);

-- ---------- αρχεία (ιδιωτικά) ----------
insert into storage.buckets (id, name, public)
values ('signatures','signatures',false), ('damage','damage',false), ('backups','backups',false)
on conflict (id) do nothing;

drop policy if exists staff_files on storage.objects;
create policy staff_files on storage.objects for all to authenticated
  using (bucket_id in ('signatures','damage','backups'))
  with check (bucket_id in ('signatures','damage','backups'));

-- ---------- ζωντανή ενημέρωση κινητό ↔ υπολογιστής ----------
do $$
begin
  begin alter publication supabase_realtime add table public.parcels; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.extraction_queue; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.shift_notes; exception when duplicate_object then null; end;
end $$;

-- τέλος
select 'OK — η βάση της Αποθήκης είναι έτοιμη' as αποτέλεσμα;
