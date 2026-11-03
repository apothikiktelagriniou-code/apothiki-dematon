-- 0012: «ψευδώνυμα» πελάτη — άλλες γραφές του ονόματος όπως εμφανίζονται στις ετικέτες
alter table public.customers add column if not exists aliases text[] not null default '{}';
create index if not exists customers_aliases_idx on public.customers using gin (aliases);
select 'OK — 0012' as αποτέλεσμα;
