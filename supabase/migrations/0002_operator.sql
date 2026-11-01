-- =====================================================================
-- 0002 — «Ποιος δουλεύει τώρα»: όνομα χειριστή σε κάθε κίνηση
-- Επικόλληση στο Supabase → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================

alter table public.parcels      add column if not exists operator text;
alter table public.activity_log add column if not exists operator text;
alter table public.shift_notes  add column if not exists operator text;
alter table public.batches      add column if not exists operator text;

-- το ιστορικό γράφει και το όνομα του χειριστή
create or replace function public.log_parcel_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text; d jsonb;
begin
  if tg_op = 'INSERT' then
    a := 'create'; d := jsonb_build_object('source', new.source);
  elsif new.status is distinct from old.status then
    a := 'status:' || new.status; d := jsonb_build_object('from', old.status, 'channel', new.notify_channel);
  elsif new.damaged and not old.damaged then
    a := 'damage'; d := jsonb_build_object('note', new.damage_note);
  else
    a := 'update'; d := null;
  end if;
  insert into activity_log(parcel_id, action, details, user_id, operator)
  values (new.id, a, d, auth.uid(), new.operator);
  return new;
end $$;

select 'OK — προστέθηκε το «Ποιος δουλεύει»' as αποτέλεσμα;
