-- =====================================================================
-- 0026 — 🗓 Δρομολόγια ΙΣΤΟΣΕΛΙΔΑΣ (ποια λεωφορεία παίρνουν δέματα)
-- Ξεχωριστός πίνακας site_schedule: ΔΕΝ συνδέεται με τα δρομολόγια της εφαρμογής (route_times).
-- Αλλάζει από τη σελίδα διαχείρισης (diaxeirisi.html) με τον λογαριασμό της εφαρμογής.
-- Η δημόσια σελίδα διαβάζει μόνο όσα έχουν «Εμφάνιση» (site_departures).
-- Επικόλληση → SQL Editor → Run. Ασφαλές να τρέξει ξανά (δεν σβήνει αλλαγές σου).
-- =====================================================================
create table if not exists public.site_schedule (
  id bigserial primary key,
  dest text not null check (char_length(dest) between 2 and 40),
  time text not null check (time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  days text not null default '1111111' check (days ~ '^[01]{7}$'),
  express boolean not null default false,
  conn boolean not null default false,
  notes text check (char_length(notes) <= 120),
  shown boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (dest, time)
);
alter table public.site_schedule enable row level security;
drop policy if exists staff_all on public.site_schedule;
create policy staff_all on public.site_schedule for all to authenticated using (true) with check (true);
revoke all on public.site_schedule from anon;

insert into public.site_schedule (dest, time, days, express, conn, notes) values
('ΑΘΗΝΑ','04:00','1111100',false,false,'ΠΛΑΤΕΙΑ ΚΑΡΑΙΣΚΑΚΗ'),
('ΑΘΗΝΑ','06:30','1111111',false,false,''),
('ΑΘΗΝΑ','08:15','1111111',true,false,''),
('ΑΘΗΝΑ','09:30','1111101',false,false,''),
('ΑΘΗΝΑ','11:00','1111111',false,false,''),
('ΑΘΗΝΑ','13:00','1111111',false,false,''),
('ΑΘΗΝΑ','15:00','1111111',true,false,'ΣΤΑΘΜΟΣ ΕΛΑΙΩΝΑ'),
('ΑΘΗΝΑ','17:00','1111101',false,false,''),
('ΑΘΗΝΑ','19:00','1111111',false,false,'ΣΤΑΘΜΟΣ ΕΛΑΙΩΝΑ'),
('ΚΟΖΑΝΗ','09:30','1111111',false,false,''),
('ΒΕΡΟΙΑ','09:30','1111111',false,false,''),
('ΘΕΣΣΑΛΟΝΙΚΗ','09:30','1111111',false,false,''),
('ΛΑΡΙΣΑ','14:00','0000101',false,false,'ΜΕΣΩ ΙΤΕΑΣ'),
('ΑΡΤΑ','06:30','1111100',false,false,''),
('ΑΡΤΑ','13:45','0101000',false,false,''),
('ΑΡΤΑ','19:30','0000101',false,false,''),
('ΙΩΑΝΝΙΝΑ','06:30','1111100',false,false,''),
('ΙΩΑΝΝΙΝΑ','13:45','0101000',false,false,''),
('ΙΩΑΝΝΙΝΑ','19:30','0000101',false,false,''),
('ΓΡΕΒΕΝΑ','09:30','1111111',false,false,''),
('ΒΟΝΙΤΣΑ','05:00','1111111',false,false,''),
('ΒΟΝΙΤΣΑ','09:30','1111111',false,false,''),
('ΒΟΝΙΤΣΑ','15:00','1111111',false,false,''),
('ΒΟΝΙΤΣΑ','16:45','1111111',false,false,''),
('ΒΟΝΙΤΣΑ','19:30','0000101',false,true,'ΜΕΣΩ ΑΜΦΙΛΟΧΙΑΣ. ΑΛΛΑΓΗ ΛΕΟΦΩΡΕΙΟΥ 20:50'),
('ΒΟΝΙΤΣΑ','20:00','1111000',false,true,'ΜΕΣΩ ΑΜΦΙΛΟΧΙΑΣ. ΑΛΛΑΓΗ ΛΕΟΦΩΡΕΙΟΥ 20:50'),
('ΠΡΕΒΕΖΑ','09:30','1111100',false,true,'ΑΝΤΑΠ/ΣΗ 11.00 ΒΟΝΙΤΣΑ-ΠΡΕΒΕΖΑ'),
('ΠΡΕΒΕΖΑ','16:45','0000001',false,true,'ΑΝΤ/ΣΗ ΒΟΝΙΤΣΑ'),
('ΛΕΥΚΑΔΑ','05:00','1111100',false,true,'ΑΛΛΑΓΗ ΛΕΩΦΟΡΕΙΟΥ ΣΤΗ ΒΟΝΙΤΣΑ 7.30'),
('ΛΕΥΚΑΔΑ','09:30','1111111',false,true,'ΑΛΛΑΓΗ ΛΕΩΦΟΡΕΙΟΥ ΣΤΗ ΒΟΝΙΤΣΑ 11.00'),
('ΛΕΥΚΑΔΑ','16:45','1111111',false,false,''),
('ΑΣΤΑΚΟΣ','06:30','1111100',false,false,''),
('ΑΣΤΑΚΟΣ','10:30','1111111',false,false,''),
('ΑΣΤΑΚΟΣ','14:15','1000000',false,false,''),
('ΑΜΦΙΛΟΧΙΑ','05:00','1111111',false,false,''),
('ΑΜΦΙΛΟΧΙΑ','06:30','1111100',false,false,''),
('ΑΜΦΙΛΟΧΙΑ','09:30','1111111',false,false,''),
('ΑΜΦΙΛΟΧΙΑ','13:00','1111100',false,false,''),
('ΑΜΦΙΛΟΧΙΑ','13:45','0101000',false,false,''),
('ΑΜΦΙΛΟΧΙΑ','15:00','1111101',false,false,''),
('ΑΜΦΙΛΟΧΙΑ','16:45','1111111',false,false,''),
('ΑΜΦΙΛΟΧΙΑ','19:30','0000101',false,false,''),
('ΑΜΦΙΛΟΧΙΑ','20:00','1111000',false,false,''),
('ΜΕΣΟΛΟΓΓΙ','04:00','1111100',false,false,''),
('ΜΕΣΟΛΟΓΓΙ','05:30','1111100',false,false,''),
('ΜΕΣΟΛΟΓΓΙ','06:30','1111111',false,false,''),
('ΜΕΣΟΛΟΓΓΙ','07:00','1111110',false,false,''),
('ΜΕΣΟΛΟΓΓΙ','09:15','1111111',false,false,''),
('ΜΕΣΟΛΟΓΓΙ','11:00','1111111',false,false,''),
('ΜΕΣΟΛΟΓΓΙ','12:30','1111100',false,false,''),
('ΜΕΣΟΛΟΓΓΙ','13:00','1111100',false,false,''),
('ΜΕΣΟΛΟΓΓΙ','14:00','1111111',false,false,''),
('ΜΕΣΟΛΟΓΓΙ','16:00','1111111',false,false,''),
('ΜΕΣΟΛΟΓΓΙ','19:00','1111111',false,false,''),
('ΜΕΣΟΛΟΓΓΙ','21:30','1111111',false,false,''),
('ΑΙΤΩΛΙΚΟ','04:00','1111100',false,false,''),
('ΑΙΤΩΛΙΚΟ','05:30','1111100',false,false,''),
('ΑΙΤΩΛΙΚΟ','06:30','1111111',false,false,''),
('ΑΙΤΩΛΙΚΟ','07:00','1111110',false,false,''),
('ΑΙΤΩΛΙΚΟ','09:15','1111111',false,false,''),
('ΑΙΤΩΛΙΚΟ','12:30','1111100',false,false,''),
('ΑΙΤΩΛΙΚΟ','13:00','1111100',false,false,''),
('ΑΙΤΩΛΙΚΟ','14:00','1111111',false,false,''),
('ΑΙΤΩΛΙΚΟ','16:00','1111111',false,false,''),
('ΑΙΤΩΛΙΚΟ','19:00','1111111',false,false,''),
('ΑΙΤΩΛΙΚΟ','21:30','1111111',false,false,''),
('ΝΑΥΠΑΚΤΟΣ','13:00','1111100',false,false,''),
('ΝΑΥΠΑΚΤΟΣ','14:00','1111111',false,false,''),
('ΝΑΥΠΑΚΤΟΣ','21:30','1111111',false,false,''),
('ΜΥΤΙΚΑΣ','05:00','1111111',false,false,''),
('ΜΥΤΙΚΑΣ','10:30','1111111',false,true,'ΜΕΣΩ ΑΣΤΑΚΟΥ'),
('ΜΥΤΙΚΑΣ','15:00','1111111',false,false,''),
('ΚΑΤΟΥΝΑ','05:00','1111111',false,false,'ΑΠΟ ΣΑΜΑΡΙ'),
('ΚΑΤΟΥΝΑ','12:45','1111111',false,false,'ΜΕΣΩ ΦΥΤΕΙΕΣ'),
('ΚΑΤΟΥΝΑ','15:00','1111111',false,false,'ΜΕΣΩ ΦΥΤΕΙΕΣ'),
('ΜΑΚΡΥΝΕΙΑ','05:30','1111100',false,false,''),
('ΜΑΚΡΥΝΕΙΑ','13:00','1111111',false,false,'ΣΙΤΑΡΑΛΩΝΑ'),
('ΘΕΡΜΟ','05:30','1111100',false,false,'ΜΕΣΩ ΜΑΚΡΥΝΕΙΑΣ'),
('ΘΕΡΜΟ','06:45','1111111',false,false,'ΜΕΣΩ ΜΥΡΤΙΑΣ'),
('ΘΕΡΜΟ','12:45','1111100',false,false,'ΜΕΣΩ ΜΥΡΤΙΑΣ'),
('ΘΕΡΜΟ','13:00','1111100',false,false,'ΜΕΣΩ ΜΑΚΡΥΝΕΙΑΣ'),
('ΘΕΡΜΟ','14:00','1111111',false,false,'ΜΕΣΩ ΜΥΡΤΙΑΣ'),
('ΘΕΡΜΟ','20:00','1111111',false,false,'ΜΕΣΩ ΜΥΡΤΙΑΣ'),
('ΑΝΤΙΡΡΙΟ','04:00','1111100',false,false,''),
('ΑΝΤΙΡΡΙΟ','05:30','1111100',false,false,''),
('ΠΑΤΡΑ','05:30','1111100',false,false,''),
('ΠΑΤΡΑ','06:45','1111100',true,false,''),
('ΠΑΤΡΑ','07:00','1111110',false,false,''),
('ΠΑΤΡΑ','09:15','1111111',false,false,''),
('ΠΑΤΡΑ','12:30','1111100',false,false,''),
('ΠΑΤΡΑ','14:00','1111111',false,false,''),
('ΠΑΤΡΑ','16:00','1111111',false,false,''),
('ΠΑΤΡΑ','19:00','1111101',false,false,''),
('ΒΟΛΟΣ','14:00','0000101',false,false,'ΜΕΣΩ ΛΑΜΙΑΣ'),
('ΑΝΤΙΡΡΙΟ','07:00','1111110',false,false,''),
('ΑΝΤΙΡΡΙΟ','09:15','1111111',false,false,''),
('ΑΝΤΙΡΡΙΟ','11:00','1111111',false,false,''),
('ΑΝΤΙΡΡΙΟ','12:30','1111111',false,false,''),
('ΑΝΤΙΡΡΙΟ','14:00','1111111',false,false,''),
('ΑΝΤΙΡΡΙΟ','16:00','1111111',false,false,''),
('ΑΝΤΙΡΡΙΟ','19:00','1111111',false,false,''),
('ΝΑΥΠΑΚΤΟΣ','07:00','1111110',false,false,''),
('ΝΑΥΠΑΚΤΟΣ','09:15','1111111',false,false,''),
('ΝΑΥΠΑΚΤΟΣ','11:00','1111111',false,false,''),
('ΝΑΥΠΑΚΤΟΣ','12:30','1111111',false,false,''),
('ΝΑΥΠΑΚΤΟΣ','16:00','1111111',false,false,''),
('ΝΑΥΠΑΚΤΟΣ','19:00','1111111',false,false,''),
('ΗΡΑΚΛΕΙΟ','14:30','0110101',false,false,''),
('ΧΑΝΙΑ','14:00','0101000',false,false,''),
('ΚΑΛΑΜΑΤΑ','12:15','0000101',false,false,''),
('ΚΕΡΚΥΡΑ','14:00','1000100',false,false,''),
('ΙΤΕΑ','14:00','0000101',false,false,''),
('ΛΙΒΑΔΕΙΑ','14:00','0000101',false,false,''),
('ΧΑΛΚΙΔΑ','14:00','0000101',false,false,''),
('ΠΥΡΓΟΣ','15:00','0100100',false,false,''),
('ΚΑΝΔΗΛΑ','15:00','1111111',false,false,''),
('ΠΑΛΑΙΡΟΣ','15:00','1111111',false,false,''),
('ΑΕΤΟΣ','15:00','1111111',false,false,'')
on conflict (dest, time) do nothing;

create or replace function public.site_departures()
returns table (dest text, "time" text, days text, express boolean, conn boolean, notes text)
language sql stable security definer set search_path = public as $$
  select s.dest, s.time, s.days, s.express, s.conn, s.notes from public.site_schedule s
   where s.shown and s.days <> '0000000' order by s.dest, s.time;
$$;
revoke all on function public.site_departures() from public;
grant execute on function public.site_departures() to anon, authenticated;
-- αν είχε τρέξει παλιότερη έκδοση του 0026
drop function if exists public.public_departures();
alter table public.route_times drop column if exists parcels;
select 'OK — ' || (select count(*) from public.site_schedule) || ' δρομολόγια ιστοσελίδας (' || (select count(*) from public.site_schedule where shown) || ' εμφανίζονται)' as αποτέλεσμα;
