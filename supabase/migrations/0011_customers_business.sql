-- 0011: καρτέλα πελάτη (επιχείρηση) + πρόταση επαγγελματικού τηλεφώνου από το web
alter table public.customers add column if not exists is_business boolean not null default false;
alter table public.customers add column if not exists business_source text;
alter table public.parcels add column if not exists phone_suggestion jsonb;
alter table public.parcels drop constraint if exists parcels_phone_source_check;
alter table public.parcels add constraint parcels_phone_source_check
  check (phone_source is null or phone_source in ('label','handwritten','customer_db','manual','business_web'));
select 'OK — 0011' as αποτέλεσμα;
