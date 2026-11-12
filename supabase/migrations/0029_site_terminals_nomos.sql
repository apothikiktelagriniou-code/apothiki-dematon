-- 0029: σταθμοί/τηλέφωνα εντός νομού (από την επίσημη σελίδα του ΚΤΕΛ Αιτωλοακαρνανίας).
-- Συμπληρώνει μόνο όσους προορισμούς δεν έχουν ήδη σταθμό. Ασφαλές να ξανατρέξει.
update public.site_destinations set terminal = 'ΚΤΕΛ Αιτωλοακαρνανίας Μεσολογγίου', terminal_phone = '26310 22371' where name = 'Μεσολόγγι' and terminal is null;
update public.site_destinations set terminal = 'ΚΤΕΛ Αιτωλοακαρνανίας Αιτωλικού', terminal_phone = '26320 22227' where name = 'Αιτωλικό' and terminal is null;
update public.site_destinations set terminal = 'ΚΤΕΛ Αιτωλοακαρνανίας Αντιρρίου', terminal_phone = '26340 31500' where name = 'Αντίρριο' and terminal is null;
update public.site_destinations set terminal = 'ΚΤΕΛ Αιτωλοακαρνανίας Ναυπάκτου', terminal_phone = '26340 27224, 26340 22074' where name = 'Ναύπακτος' and terminal is null;
update public.site_destinations set terminal = 'ΚΤΕΛ Αιτωλοακαρνανίας Θέρμου', terminal_phone = '26440 24021' where name = 'Θέρμο' and terminal is null;
update public.site_destinations set terminal = 'ΚΤΕΛ Αιτωλοακαρνανίας Βόνιτσας', terminal_phone = '26430 22500' where name = 'Βόνιτσα' and terminal is null;
update public.site_destinations set terminal = 'ΚΤΕΛ Αιτωλοακαρνανίας Αμφιλοχίας', terminal_phone = '26420 22225' where name = 'Αμφιλοχία' and terminal is null;
update public.site_destinations set terminal = 'ΚΤΕΛ Αιτωλοακαρνανίας Αστακού', terminal_phone = '26460 41133, 26460 42183' where name = 'Αστακός' and terminal is null;
update public.site_destinations set terminal = 'ΚΤΕΛ Αιτωλοακαρνανίας Κατούνας', terminal_phone = '695 548 0190' where name = 'Κατούνα' and terminal is null;
