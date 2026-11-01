-- 0010: φωτογραφία & περιγραφή συσκευασίας (σβήνεται όταν κλείσει το δέμα)
alter table public.parcels add column if not exists package_desc text;
alter table public.parcels add column if not exists package_photo_path text;
alter table public.extraction_queue add column if not exists package_thumb text;

insert into storage.buckets (id, name, public) values ('packages','packages',false) on conflict (id) do nothing;

drop policy if exists staff_files on storage.objects;
create policy staff_files on storage.objects for all to authenticated
  using (bucket_id in ('signatures','damage','backups','packages'))
  with check (bucket_id in ('signatures','damage','backups','packages'));
