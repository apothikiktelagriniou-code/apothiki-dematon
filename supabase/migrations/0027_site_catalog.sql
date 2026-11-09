-- =====================================================================
-- 0027 — 🗺 Προορισμοί & τιμοκατάλογος ιστοσελίδας (διαχείριση από diaxeirisi-proorismon.html)
-- Μόνο για την ιστοσελίδα· ΔΕΝ αγγίζει πίνακες της εφαρμογής.
-- Η ιστοσελίδα τα διαβάζει όταν χτίζεται (site_catalog), άρα μια αλλαγή φαίνεται
-- μετά την ανανέωση του σάιτ (κουμπί «Αποθήκευση» → αυτόματη ανανέωση, αν έχει μπει ο σύνδεσμος).
-- Επικόλληση → SQL Editor → Run. Ασφαλές να τρέξει ξανά (δεν σβήνει αλλαγές σας).
-- =====================================================================
create table if not exists public.site_tariffs (
  key text primary key check (key ~ '^[a-z0-9_]{1,24}$'),
  label text not null check (char_length(label) between 1 and 60),
  p jsonb not null default '{}'::jsonb,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.site_destinations (
  id bigserial primary key,
  name text not null unique check (char_length(name) between 1 and 60),
  region text not null default '' check (char_length(region) <= 60),
  type text not null check (type in ('direct', 'local', 'transfer', 'ask', 'none')),
  tariff text,
  hub text,
  sched text[] not null default '{}',
  days text check (days ~ '^[01]{7}$'),
  eta text check (char_length(eta) <= 300),
  note text check (char_length(note) <= 300),
  shown boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.site_settings (key text primary key, value text);

alter table public.site_tariffs enable row level security;
alter table public.site_destinations enable row level security;
alter table public.site_settings enable row level security;
drop policy if exists staff_all on public.site_tariffs;
create policy staff_all on public.site_tariffs for all to authenticated using (true) with check (true);
drop policy if exists staff_all on public.site_destinations;
create policy staff_all on public.site_destinations for all to authenticated using (true) with check (true);
drop policy if exists staff_all on public.site_settings;
create policy staff_all on public.site_settings for all to authenticated using (true) with check (true);
revoke all on public.site_tariffs, public.site_destinations, public.site_settings from anon;

-- Για το χτίσιμο της σελίδας (δημόσια, μόνο ανάγνωση): τιμοκατάλογος + προορισμοί που φαίνονται.
create or replace function public.site_catalog()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tariffs', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'p', p) order by sort, key) from public.site_tariffs), '[]'::jsonb),
    'destinations', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'region', region, 'type', type, 'tariff', tariff, 'hub', hub,
        'sched', sched, 'days', days, 'eta', eta, 'note', note) order by name) from public.site_destinations where shown), '[]'::jsonb));
$$;
revoke all on function public.site_catalog() from public;
grant execute on function public.site_catalog() to anon, authenticated;

-- Αρχικά δεδομένα = ό,τι έχει σήμερα η ιστοσελίδα (μπαίνουν μόνο αν λείπουν).
insert into public.site_tariffs (key, label, p, sort) values ('athina', 'Αθήνα', '{"fakelos":5,"mikro":7,"mesaio":8,"megalo":10,"tenekes":12,"tenekes_syn":5,"tsouvali":12,"arni":12}'::jsonb, 0) on conflict (key) do nothing;
insert into public.site_tariffs (key, label, p, sort) values ('patra', 'Πάτρα', '{"fakelos":5,"mikro":6,"mesaio":7,"megalo":8,"tenekes":10,"tenekes_syn":5,"tsouvali":10,"arni":10}'::jsonb, 1) on conflict (key) do nothing;
insert into public.site_tariffs (key, label, p, sort) values ('thess', 'Θεσσαλονίκη', '{"fakelos":7,"mikro":8,"mesaio":10,"megalo":12,"tenekes":12,"tenekes_syn":5,"tsouvali":15,"arni":15}'::jsonb, 2) on conflict (key) do nothing;
insert into public.site_tariffs (key, label, p, sort) values ('ioannina', 'Ιωάννινα', '{"fakelos":5,"mikro":6,"mesaio":7,"megalo":8,"tenekes":10,"tenekes_syn":5,"tsouvali":10,"arni":10}'::jsonb, 3) on conflict (key) do nothing;
insert into public.site_tariffs (key, label, p, sort) values ('larisa', 'Λάρισα', '{"fakelos":7,"mikro":7,"mesaio":10,"megalo":12,"tenekes":12,"tenekes_syn":5,"tsouvali":15,"arni":15}'::jsonb, 4) on conflict (key) do nothing;
insert into public.site_tariffs (key, label, p, sort) values ('lamia', 'Λαμία', '{"fakelos":7,"mikro":7,"mesaio":8,"megalo":10,"tenekes":10,"tenekes_syn":5,"tsouvali":10,"arni":12}'::jsonb, 5) on conflict (key) do nothing;
insert into public.site_tariffs (key, label, p, sort) values ('volos', 'Βόλος', '{"fakelos":7,"mikro":7,"mesaio":10,"megalo":12,"tenekes":12,"tenekes_syn":5,"tsouvali":15,"arni":15}'::jsonb, 6) on conflict (key) do nothing;
insert into public.site_tariffs (key, label, p, sort) values ('nomos', 'Εντός Νομού', '{"fakelos":5,"mikro":5,"mesaio":5,"megalo":7,"tenekes":8,"tenekes_syn":5,"tsouvali":8,"arni":8}'::jsonb, 7) on conflict (key) do nothing;
insert into public.site_tariffs (key, label, p, sort) values ('ipeiros', 'Πρέβεζα · Άρτα · Λευκάδα', '{"fakelos":5,"mikro":6,"mesaio":7,"megalo":10,"tenekes":10,"tenekes_syn":5,"tsouvali":10,"arni":10}'::jsonb, 8) on conflict (key) do nothing;
insert into public.site_tariffs (key, label, p, sort) values ('kriti', 'Χανιά · Ηράκλειο · Κέρκυρα', '{"fakelos":7,"mikro":10,"mesaio":15,"megalo":20,"tenekes":17,"tenekes_syn":10,"tsouvali":20,"arni":20}'::jsonb, 9) on conflict (key) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Αθήνα', 'Αττική', 'direct', 'athina', null, array['ΑΘΗΝΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', 'Παραλαβή από τον σταθμό ΚΤΕΛ Κηφισού.') on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Πάτρα', 'Πελοπόννησος', 'direct', 'patra', null, array['ΠΑΤΡΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Θεσσαλονίκη', 'Μακεδονία', 'direct', 'thess', null, array['ΘΕΣΣΑΛΟΝΙΚΗ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ιωάννινα', 'Ήπειρος', 'direct', 'ioannina', null, array['ΙΩΑΝΝΙΝΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Λάρισα', 'Θεσσαλία', 'direct', 'larisa', null, array['ΛΑΡΙΣΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Βόλος', 'Θεσσαλία', 'direct', 'volos', null, array['ΒΟΛΟΣ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Λαμία', 'Στερεά Ελλάδα', 'direct', 'lamia', null, array['ΒΟΛΟΣ','ΛΑΡΙΣΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', 'Με το λεωφορείο Βόλου – Λάρισας, κάθε Παρασκευή και Κυριακή.') on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Πρέβεζα', 'Ήπειρος', 'direct', 'ipeiros', null, array['ΠΡΕΒΕΖΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Άρτα', 'Ήπειρος', 'direct', 'ipeiros', null, array['ΑΡΤΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Λευκάδα', 'Ιόνια Νησιά', 'direct', 'ipeiros', null, array['ΛΕΥΚΑΔΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Βέροια', 'Μακεδονία', 'direct', 'thess', null, array['ΒΕΡΟΙΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Γρεβενά', 'Μακεδονία', 'direct', 'thess', null, array['ΓΡΕΒΕΝΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Κοζάνη', 'Μακεδονία', 'direct', 'thess', null, array['ΚΟΖΑΝΗ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ισθμός', 'Πελοπόννησος', 'direct', 'athina', null, array['ΑΘΗΝΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', 'Με τα λεωφορεία της Αθήνας.') on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Χαλκίδα', 'Στερεά Ελλάδα', 'direct', 'athina', null, array['ΧΑΛΚΙΔΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Λιβαδειά', 'Στερεά Ελλάδα', 'direct', 'athina', null, array['ΛΙΒΑΔΕΙΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', 'Με το λεωφορείο της Χαλκίδας, κάθε Παρασκευή και Κυριακή.') on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ιτέα', 'Στερεά Ελλάδα', 'direct', 'athina', null, array['ΙΤΕΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', 'Με το λεωφορείο της Χαλκίδας, κάθε Παρασκευή και Κυριακή.') on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Κέρκυρα', 'Ιόνια Νησιά', 'direct', 'kriti', null, array['ΚΕΡΚΥΡΑ']::text[], 'Με το δρομολόγιο Δευτέρας και Παρασκευής.', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Πύργος', 'Πελοπόννησος', 'direct', 'athina', null, array['ΠΥΡΓΟΣ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Καλαμάτα', 'Πελοπόννησος', 'direct', 'athina', null, array['ΚΑΛΑΜΑΤΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Χανιά', 'Κρήτη', 'direct', 'kriti', null, array['ΧΑΝΙΑ']::text[], 'Με το δρομολόγιο της ημέρας· ρωτήστε για την ώρα άφιξης.', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ηράκλειο', 'Κρήτη', 'direct', 'kriti', null, array['ΗΡΑΚΛΕΙΟ']::text[], 'Με το δρομολόγιο της ημέρας· ρωτήστε για την ώρα άφιξης.', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Μεσολόγγι', 'Αιτωλοακαρνανία', 'local', 'nomos', null, array['ΜΕΣΟΛΟΓΓΙ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ναύπακτος', 'Αιτωλοακαρνανία', 'local', 'nomos', null, array['ΝΑΥΠΑΚΤΟΣ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Αιτωλικό', 'Αιτωλοακαρνανία', 'local', 'nomos', null, array['ΑΙΤΩΛΙΚΟ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Αμφιλοχία', 'Αιτωλοακαρνανία', 'local', 'nomos', null, array['ΑΜΦΙΛΟΧΙΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Βόνιτσα', 'Αιτωλοακαρνανία', 'local', 'nomos', null, array['ΒΟΝΙΤΣΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Αστακός', 'Αιτωλοακαρνανία', 'local', 'nomos', null, array['ΑΣΤΑΚΟΣ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Θέρμο', 'Αιτωλοακαρνανία', 'local', 'nomos', null, array['ΘΕΡΜΟ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Κατούνα', 'Αιτωλοακαρνανία', 'local', 'nomos', null, array['ΚΑΤΟΥΝΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Μύτικας', 'Αιτωλοακαρνανία', 'local', 'nomos', null, array['ΜΥΤΙΚΑΣ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Αντίρριο', 'Αιτωλοακαρνανία', 'local', 'nomos', null, array['ΑΝΤΙΡΡΙΟ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Μακρυνεία', 'Αιτωλοακαρνανία', 'local', 'nomos', null, array['ΜΑΚΡΥΝΕΙΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Κάνδηλα', 'Αιτωλοακαρνανία', 'local', 'nomos', null, array['ΚΑΝΔΗΛΑ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Πάλαιρος', 'Αιτωλοακαρνανία', 'local', 'nomos', null, array['ΠΑΛΑΙΡΟΣ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Αετός', 'Αιτωλοακαρνανία', 'local', 'nomos', null, array['ΑΕΤΟΣ']::text[], 'Αυθημερόν, με τα δρομολόγια της ημέρας', null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Κατερίνη', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Κιλκίς', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Σέρρες', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Δράμα', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Καβάλα', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ξάνθη', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Κομοτηνή', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Αλεξανδρούπολη', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ορεστιάδα', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Έδεσσα', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Γιαννιτσά', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Νάουσα', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Πτολεμαΐδα', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Φλώρινα', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Καστοριά', 'Μακεδονία – Θράκη', 'transfer', null, 'makedonia', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Τρίκαλα', 'Θεσσαλία', 'transfer', null, 'ioannina', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Καλαμπάκα', 'Θεσσαλία', 'transfer', null, 'ioannina', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Καρδίτσα', 'Θεσσαλία', 'transfer', null, 'ioannina', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ηγουμενίτσα', 'Ήπειρος', 'transfer', null, 'ioannina', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Κεφαλονιά', 'Ιόνια Νησιά', 'transfer', null, 'patra', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ρέθυμνο', 'Κρήτη', 'transfer', null, 'kriti', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Άγιος Νικόλαος', 'Κρήτη', 'transfer', null, 'kriti', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ιεράπετρα', 'Κρήτη', 'transfer', null, 'kriti', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Σητεία', 'Κρήτη', 'transfer', null, 'kriti', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Κόρινθος', 'Πελοπόννησος', 'transfer', null, 'korinthos', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Κιάτο', 'Πελοπόννησος', 'transfer', null, 'korinthos', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Αίγιο', 'Πελοπόννησος', 'transfer', null, 'korinthos', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Άργος', 'Πελοπόννησος', 'transfer', null, 'korinthos', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ναύπλιο', 'Πελοπόννησος', 'transfer', null, 'korinthos', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Τρίπολη', 'Πελοπόννησος', 'transfer', null, 'korinthos', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Μεγαλόπολη', 'Πελοπόννησος', 'transfer', null, 'korinthos', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Σπάρτη', 'Πελοπόννησος', 'transfer', null, 'korinthos', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Γύθειο', 'Πελοπόννησος', 'transfer', null, 'korinthos', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Μολάοι', 'Πελοπόννησος', 'transfer', null, 'korinthos', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Κυπαρισσία', 'Πελοπόννησος', 'transfer', null, 'korinthos', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Αμαλιάδα', 'Πελοπόννησος', 'transfer', null, 'korinthos', '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Χαλκιδική', 'Μακεδονία', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Καρπενήσι', 'Στερεά Ελλάδα', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Κάτω Αχαΐα', 'Πελοπόννησος', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Πειραιάς', 'Αττική', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ελευσίνα', 'Αττική', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Μέγαρα', 'Αττική', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Λαύριο', 'Αττική', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ραφήνα', 'Αττική', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ζάκυνθος', 'Ιόνια Νησιά', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Ιθάκη', 'Ιόνια Νησιά', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Θήβα', 'Στερεά Ελλάδα', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Άμφισσα', 'Στερεά Ελλάδα', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Αταλάντη', 'Στερεά Ελλάδα', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Φιλιππιάδα', 'Ήπειρος', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Πάργα', 'Ήπειρος', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Κόνιτσα', 'Ήπειρος', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
insert into public.site_destinations (name, region, type, tariff, hub, sched, eta, note) values ('Μέτσοβο', 'Ήπειρος', 'none', null, null, '{}'::text[], null, null) on conflict (name) do nothing;
select 'OK — προορισμοί και τιμοκατάλογος έτοιμοι' as αποτέλεσμα;
