-- =====================================================================
-- ΟΛΕΣ ΟΙ ΕΚΚΡΕΜΕΙΣ ΑΛΛΑΓΕΣ (0003–0006) σε ένα αρχείο
-- Επικόλληση ΟΛΟΥ στο Supabase → SQL Editor → New query → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================

-- ---------- 0004_tags.sql ----------
-- 0004 — Παρατηρήσεις δέματος (έτοιμα κουμπιά) + αριθμός εγγράφου
alter table public.parcels add column if not exists id_doc_number text;
create index if not exists parcels_id_doc_number_idx on public.parcels (id_doc_number);

alter table public.parcels add column if not exists tags text[] not null default '{}';
create index if not exists parcels_tags_idx on public.parcels using gin (tags);

alter table public.app_settings add column if not exists tag_options text[] not null default array[
  'Παραλήφθηκε ανοιχτό','Παραλήφθηκε με φθορά','Έγινε εκκαθάριση','Στο υπόγειο','Βρεγμένο','Εύθραυστο',
  'Ογκώδες / βαρύ','Ευπαθές / τρόφιμα','Λείπει τεμάχιο','Θα το παραλάβει τρίτος','Ειδοποιήθηκε τηλεφωνικά','Επιστροφή στον αποστολέα'];


-- ---------- 0005_manifests.sql ----------
-- 0005 — Καταστάσεις πρακτορείων (ιστορικό ελέγχων)
create table if not exists public.manifests (
  id uuid primary key default gen_random_uuid(),
  origin_city text,
  departure_at timestamptz,
  agency text,
  items jsonb not null default '[]'::jsonb,
  total_declared int,
  found int, missing int, extra int,
  operator text,
  created_at timestamptz default now(),
  created_by uuid default auth.uid()
);
alter table public.manifests enable row level security;
drop policy if exists staff_all on public.manifests;
create policy staff_all on public.manifests for all to authenticated using (true) with check (true);
-- δέματα που καταχωρούνται απευθείας από κατάσταση
alter table public.parcels drop constraint if exists parcels_source_check;
alter table public.parcels add constraint parcels_source_check check (source in ('photo_auto','photo_reviewed','manual','import','manifest'));

-- ---------- 0006_channels_sms.sql ----------
-- 0006 — Κανάλι ειδοποίησης ανά πελάτη (WhatsApp/Viber/SMS) + σύντομο SMS
alter table public.customers add column if not exists channel text;
alter table public.customers drop constraint if exists customers_channel_check;
alter table public.customers add constraint customers_channel_check check (channel is null or channel in ('whatsapp','viber','sms'));
alter table public.customers add column if not exists channel_at timestamptz;
create index if not exists customers_channel_idx on public.customers (channel);

alter table public.parcels add column if not exists sms_message_id text;

alter table public.app_settings add column if not exists sms_template text not null default
'ΚΤΕΛ Αγρινίου: το δέμα σας{αρ} ήρθε. Κωδ. {κωδ}. Παραλαβή 06:30-21:30 ή delivery 3,50€ στο 6979334186';

-- διακόπτης υπηρεσίας SMS (κλειστός μέχρι να ξεκινήσει το delivery)
alter table public.app_settings add column if not exists sms_enabled boolean not null default false;
alter table public.app_settings add column if not exists whatsapp_enabled boolean not null default false;
alter table public.app_settings add column if not exists viber_enabled boolean not null default false;


select 'OK — όλες οι αλλαγές πέρασαν (αριθμός εγγράφου, παρατηρήσεις, καταστάσεις, κανάλια)' as αποτέλεσμα;
