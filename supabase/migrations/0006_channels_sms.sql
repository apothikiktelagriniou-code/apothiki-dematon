-- =====================================================================
-- 0006 — Κανάλι ειδοποίησης ανά πελάτη (WhatsApp/Viber/SMS) + σύντομο SMS
-- Επικόλληση στο Supabase → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================
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

select 'OK — κανάλια ειδοποίησης και SMS' as αποτέλεσμα;
