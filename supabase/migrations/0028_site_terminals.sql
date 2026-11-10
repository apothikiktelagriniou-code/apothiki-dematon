-- =====================================================================
-- 0028 — 🚏 Σταθμός παραλαβής ανά προορισμό (ιστοσελίδα)
-- Πού παραλαμβάνει ο παραλήπτης στον προορισμό: σταθμός, διεύθυνση, τηλέφωνο.
-- Φαίνεται στον υπολογισμό κόστους και στις σελίδες προορισμών. Αλλάζει από diaxeirisi-proorismon.html.
-- Επικόλληση → SQL Editor → Run. Ασφαλές να τρέξει ξανά.
-- =====================================================================
alter table public.site_destinations add column if not exists terminal text check (char_length(terminal) <= 120);
alter table public.site_destinations add column if not exists terminal_addr text check (char_length(terminal_addr) <= 160);
alter table public.site_destinations add column if not exists terminal_phone text check (char_length(terminal_phone) <= 80);

create or replace function public.site_catalog()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tariffs', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'p', p) order by sort, key) from public.site_tariffs), '[]'::jsonb),
    'destinations', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'region', region, 'type', type, 'tariff', tariff, 'hub', hub,
        'sched', sched, 'days', days, 'eta', eta, 'note', note,
        'terminal', terminal, 'terminal_addr', terminal_addr, 'terminal_phone', terminal_phone) order by name) from public.site_destinations where shown), '[]'::jsonb));
$$;
revoke all on function public.site_catalog() from public;
grant execute on function public.site_catalog() to anon, authenticated;

-- Αρχικά στοιχεία σταθμών (μόνο όπου λείπουν· δεν σβήνουν αλλαγές σας).
update public.site_destinations set terminal = 'ΚΤΕΛ Κηφισού, γραφείο ΚΤΕΛ Αιτωλοακαρνανίας', terminal_addr = 'Κηφισού 100, Αθήνα', terminal_phone = '210 5129293' where name = 'Αθήνα' and terminal is null;
update public.site_destinations set terminal = 'ΚΤΕΛ Μακεδονία, γραφείο ΚΤΕΛ Αιτωλοακαρνανίας', terminal_addr = 'Γιαννιτσών 244, Θεσσαλονίκη', terminal_phone = '2310 595491' where name = 'Θεσσαλονίκη' and terminal is null;
update public.site_destinations set terminal = 'Υπεραστικός σταθμός ΚΤΕΛ Ιωαννίνων', terminal_addr = 'Γεωργίου Παπανδρέου 45, Ιωάννινα', terminal_phone = '26510 30711, 26510 25014' where name = 'Ιωάννινα' and terminal is null;
update public.site_destinations set terminal = 'Πρακτορείο ΚΤΕΛ Αιτωλοακαρνανίας Λάρισας', terminal_addr = null, terminal_phone = '2410 571600' where name = 'Λάρισα' and terminal is null;
update public.site_destinations set terminal = 'ΚΤΕΛ Πρέβεζας', terminal_addr = 'Ιωαννίνων 205α, Πρέβεζα', terminal_phone = '26820 22246' where name = 'Πρέβεζα' and terminal is null;
update public.site_destinations set terminal = 'Υπεραστικός σταθμός ΚΤΕΛ Χανίων – Ρεθύμνου, αποθήκη', terminal_addr = 'Κυδωνίας & Παρθενίου Κελαϊδή, Χανιά', terminal_phone = '28210 97497' where name = 'Χανιά' and terminal is null;
update public.site_destinations set terminal = 'ΚΤΕΛ Αιτωλοακαρνανίας, σταθμός «Π. Κανελλόπουλος» (παλαιό λιμάνι)', terminal_addr = 'Ηρώων Πολυτεχνείου, Πάτρα', terminal_phone = '2610 421205' where name = 'Πάτρα' and terminal is null;
update public.site_destinations set terminal = 'Υπεραστικό ΚΤΕΛ Μαγνησίας', terminal_addr = 'Ζάχου 5, Βόλος', terminal_phone = '24210 33254' where name = 'Βόλος' and terminal is null;
update public.site_destinations set terminal = 'Υπεραστικό ΚΤΕΛ Άρτας', terminal_addr = 'Πλατεία Κρυστάλλη, Άρτα', terminal_phone = '26810 27348' where name = 'Άρτα' and terminal is null;
update public.site_destinations set terminal = 'ΚΤΕΛ Λευκάδας', terminal_addr = 'Φιλοσόφων & Τζεβελέκη, Λευκάδα', terminal_phone = '26450 22364' where name = 'Λευκάδα' and terminal is null;
update public.site_destinations set terminal = 'Υπεραστικός σταθμός ΚΤΕΛ Μεσσηνίας', terminal_addr = 'Τέρμα Αρτέμιδος, Καλαμάτα', terminal_phone = '27210 28581' where name = 'Καλαμάτα' and terminal is null;
update public.site_destinations set terminal = 'Πρακτορείο ΚΤΕΛ Αιτωλοακαρνανίας Λαμίας', terminal_addr = null, terminal_phone = '22310 22802' where name = 'Λαμία' and terminal is null;
update public.site_destinations set terminal = 'Πρακτορείο ΚΤΕΛ Αιτωλοακαρνανίας Βέροιας', terminal_addr = null, terminal_phone = '23310 75170' where name = 'Βέροια' and terminal is null;
update public.site_destinations set terminal = 'Πρακτορείο ΚΤΕΛ Αιτωλοακαρνανίας Γρεβενών', terminal_addr = null, terminal_phone = '24620 81511' where name = 'Γρεβενά' and terminal is null;
update public.site_destinations set terminal = 'Υπεραστικός σταθμός ΚΤΕΛ Κοζάνης', terminal_addr = 'Ε. Γιάνναρη 22, Κοζάνη', terminal_phone = '24610 34454' where name = 'Κοζάνη' and terminal is null;
update public.site_destinations set terminal = 'ΚΤΕΛ Αιτωλοακαρνανίας Κορίνθου / σταθμός Ισθμού', terminal_addr = null, terminal_phone = '27410 73987' where name = 'Ισθμός' and terminal is null;
update public.site_destinations set terminal = 'Υπεραστικός σταθμός ΚΤΕΛ Εύβοιας', terminal_addr = 'Φαβιέρου 28, Χαλκίδα', terminal_phone = '22210 22640' where name = 'Χαλκίδα' and terminal is null;
update public.site_destinations set terminal = 'Υπεραστικός σταθμός ΚΤΕΛ Λιβαδειάς', terminal_addr = 'Τέρμα Χαιρωνείας, Λιβαδειά', terminal_phone = '22610 28272' where name = 'Λιβαδειά' and terminal is null;
update public.site_destinations set terminal = 'Πρακτορείο ΚΤΕΛ Φωκίδας Ιτέας', terminal_addr = '28ης Οκτωβρίου 31, Ιτέα', terminal_phone = '22650 32336' where name = 'Ιτέα' and terminal is null;
update public.site_destinations set terminal = 'Υπεραστικό ΚΤΕΛ Κέρκυρας', terminal_addr = 'Εθνική Οδός Λευκίμμης 13, Κέρκυρα', terminal_phone = '26610 28900' where name = 'Κέρκυρα' and terminal is null;
update public.site_destinations set terminal = 'Υπεραστικός σταθμός ΚΤΕΛ Ηλείας', terminal_addr = 'Ερυθρού Σταυρού 6, Πύργος', terminal_phone = '26210 20600' where name = 'Πύργος' and terminal is null;
update public.site_destinations set terminal = 'ΚΤΕΛ Ηρακλείου – Λασιθίου, αποθήκη δεμάτων', terminal_addr = null, terminal_phone = '2810 246538' where name = 'Ηράκλειο' and terminal is null;
select 'OK — σταθμοί παραλαβής έτοιμοι' as αποτέλεσμα;
