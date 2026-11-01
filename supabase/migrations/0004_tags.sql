-- =====================================================================
-- 0004 — Παρατηρήσεις δέματος (έτοιμα κουμπιά) + αριθμός εγγράφου
-- Περιλαμβάνει και το 0003, οπότε αρκεί να τρέξει μόνο αυτό.
-- Επικόλληση στο Supabase → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================
alter table public.parcels add column if not exists id_doc_number text;
create index if not exists parcels_id_doc_number_idx on public.parcels (id_doc_number);

alter table public.parcels add column if not exists tags text[] not null default '{}';
create index if not exists parcels_tags_idx on public.parcels using gin (tags);

alter table public.app_settings add column if not exists tag_options text[] not null default array[
  'Παραλήφθηκε ανοιχτό','Παραλήφθηκε με φθορά','Έγινε εκκαθάριση','Στο υπόγειο','Βρεγμένο','Εύθραυστο',
  'Ογκώδες / βαρύ','Ευπαθές / τρόφιμα','Λείπει τεμάχιο','Θα το παραλάβει τρίτος','Ειδοποιήθηκε τηλεφωνικά','Επιστροφή στον αποστολέα'];

select 'OK — προστέθηκαν παρατηρήσεις και αριθμός εγγράφου' as αποτέλεσμα;
