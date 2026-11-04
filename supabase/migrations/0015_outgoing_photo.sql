-- 0015: φωτογραφία απόδειξης εξερχομένων (κρατιέται 12 μήνες, μετά σβήνεται αυτόματα από την εφαρμογή)
alter table public.outgoing add column if not exists photo_path text;
insert into storage.buckets (id, name, public) values ('receipts','receipts',false) on conflict (id) do nothing;
drop policy if exists staff_files on storage.objects;
create policy staff_files on storage.objects for all to authenticated
  using (bucket_id in ('signatures','damage','backups','packages','receipts'))
  with check (bucket_id in ('signatures','damage','backups','packages','receipts'));
select 'OK — 0015' as αποτέλεσμα;
