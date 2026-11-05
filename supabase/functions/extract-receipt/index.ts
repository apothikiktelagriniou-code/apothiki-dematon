// Supabase Edge Function: extract-receipt
// Διαβάζει 1–3 φωτογραφίες απόδειξης (+ προαιρετικά ολόκληρο το δέμα) ή ταξινομεί φωτογραφίες (mode=classify) ΚΤΕΛ με Claude Haiku και επιστρέφει τα πεδία σε JSON.
// Το κλειδί ANTHROPIC_API_KEY ζει ΜΟΝΟ στα Secrets του Supabase — ποτέ στην εφαρμογή.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const MODEL = "claude-haiku-5-5";
const MAX_TOKENS = 4096; // αρκετό και αν το μοντέλο «σκεφτεί» πριν απαντήσει
const PRICE_IN = 0.10 / 1e6, PRICE_OUT = 0.50 / 1e6; // USD ανά token
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const SYSTEM = `Διαβάζεις φωτογραφίες από αποδείξεις δεμάτων (ΔΕΛΤΙΟ ΑΠΟΣΚΕΥΩΝ) του ΚΤΕΛ Αιτωλοακαρνανίας. Μπορεί να είναι τυπωμένη θερμική ετικέτα ή χειρόγραφη απόδειξη. Μπορεί να υπάρχει και χειρόγραφο κινητό τηλέφωνο πάνω στην ετικέτα ή κάπου αλλού στο δέμα (δεύτερη φωτογραφία).

Τυπική διάταξη τυπωμένης ετικέτας:
ΚΤΕΛ ΑΙΤΩΛΟΑΚΑΡΝΑΝΙΑΣ ΑΕ / Εκδότης:258 / ΔΕΛΤΙΟ ΑΠΟΣΚΕΥΩΝ / ΣΥΝΟΔΕΥΤΙΚΟ (ή ΑΣΥΝΟΔΕΥΤΟ) / ΚΟΜΙΣΤΡΟ: 5 € / Είδος: Απλό δέμα / Ημ/νία έκδοσης: Σαβ 31/10/2026 Ωρα:16:40 / Ημ/νία Αναχώρησης: Σαβ 31/10/2026 Ωρα:17:00 / Αρ. Απόδειξης: 258-341-23682 / Κωδ. Δέματος: 8CAM5U8B / Αποστολέας : / Παραλήπτης: ΧΑΤΖΗΣ / Τηλ: / Απο-From: ΠΑΤΡΑ / Προς-Το: ΑΓΡΙΝΙΟ / [QR] — Το QR αγνόησέ το.

ΚΑΝΟΝΕΣ:
- Διάβασε ΜΟΝΟ ό,τι φαίνεται. ΜΗΝ μαντεύεις. Ό,τι λείπει ή δεν διαβάζεται → κενό string "".
- Αν κάποιο πεδίο διαβάζεται αλλά υπάρχει αμφιβολία (π.χ. 0/8, 1/7, 5/6, Ο/0, θολό, τσαλακωμένο, βρεγμένο), βάλε το κλειδί του στη λίστα "unsure".
- Οι χειρόγραφοι αριθμοί τηλεφώνου είναι πάντα επικίνδυνοι: αν το τηλέφωνο είναι χειρόγραφο, phone_is_handwritten=true.
- Πόλεις: κεφαλαία χωρίς τόνους (π.χ. ΠΑΤΡΑ, ΑΘΗΝΑ, ΙΩΑΝΝΙΝΑ).
- Ημερομηνίες: DD/MM/YYYY HH:MM.
- ΧΕΙΡΟΓΡΑΦΗ «ΑΠΟΔΕΙΞΗ ΜΕΤΑΦΟΡΑΣ ΑΣΥΝΟΔΕΥΤΟΥ ΜΙΚΡΟΔΕΜΑΤΟΣ» (μπλοκ ΚΤΕΛ Ν. ΑΙΤΩΛ/ΝΙΑΣ): is_handwritten_receipt=true. receipt_no = ο ΚΟΚΚΙΝΟΣ αριθμός πάνω δεξιά (π.χ. 3401). Ο ΜΑΥΡΟΣ τυπωμένος αριθμός ακριβώς από πάνω του (π.χ. 33950048) είναι αριθμός μπλοκ → parcel_code. Χειρόγραφα πεδία: ΠΡΟΟΡΙΣΜΟΣ → destination_city, ΑΠΟΣΤΟΛΕΑΣ → sender, ΠΑΡΑΛΗΠΤΗΣ → recipient, ΔΕΜΑΤΑ → pieces, ΚΟΜΙΣΤΡΑ → fare_eur, ΗΜΕΡΟΜΗΝΙΑ → issued (μόνο ημερομηνία). Δεν έχει ώρα αναχώρησης → departure "". Τα ΤΥΠΩΜΕΝΑ στοιχεία της φόρμας (Μεσολόγγι, Αγρίνιο, διευθύνσεις, ΑΦΜ, τηλέφωνα αποθηκών Αθηνών/Αγρινίου/Μεσολογγίου) ΔΕΝ είναι αποστολέας, παραλήπτης, πόλη ή τηλέφωνο παραλήπτη. origin_city μόνο αν γράφεται με το χέρι ή από σφραγίδα.
- ΕΤΙΚΕΤΑ ΚΤΕΛ ΙΩΑΝΝΙΝΩΝ («ΥΠΕΡΑΣΤΙΚΟ Κ.Τ.Ε.Λ. ΙΩΑΝΝΙΝΩΝ Α.Ε.» · ΑΣΥΝΟΔΕΥΤΑ): receipt_no = ο αριθμός κάτω από τη λέξη «Κωδικός» (π.χ. 202682615) — ΔΕΝ υπάρχει άλλος αριθμός απόδειξης· parcel_code "". ΑΠΟΣΤΟΛΕΑΣ → sender, ΠΑΡΑΛΗΠΤΗΣ → recipient, ΔΡΟΜΟΛΟΓΙΟ «ΙΩΑΝΝΙΝΑ - ΑΓΡΙΝΙΟ» → origin_city = η 1η πόλη, ΑΝΑΧΩΡΗΣΗ (ημερομηνία + ΩΡΑ) → departure, ΠΡΟΟΡΙΣΜΟΣ → destination_city, ΤΕΜΑΧΙΑ «4 / 5» → pieces=5, ΤΙΜΗ (Με ΦΠΑ) → fare_eur, η ημερομηνία-ώρα στο κάτω μέρος → issued. Το ΑΦΜ/διεύθυνση/site του ΚΤΕΛ δεν είναι αποστολέας ή παραλήπτης. «ΜΕΤΕΠΙΒΙΒΑΣΗ» και «ΧΡΕΩΣΗ ΑΠΟΣΤΟΛΕΑ/ΠΑΡΑΛΗΠΤΗ» δεν είναι παρατηρήσεις προβλήματος.
- recipient (ιδιώτης): γράψ' το ΠΑΝΤΑ «ΕΠΩΝΥΜΟ ΟΝΟΜΑ». Αν η ετικέτα γράφει πρώτα το μικρό όνομα (π.χ. «ΓΙΩΡΓΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ», «Μαρία Κωστοπούλου», «Ν. ΔΗΜΟΥ»), αντέστρεψέ το → «ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ», «ΚΩΣΤΟΠΟΥΛΟΥ ΜΑΡΙΑ», «ΔΗΜΟΥ Ν.». Αν δεν είσαι σίγουρος ποιο είναι το επώνυμο, άφησέ το όπως είναι. Επιχειρήσεις: όπως γράφονται.
- GREEKLISH: αν ο παραλήπτης (ή αποστολέας) είναι ελληνικό όνομα γραμμένο με λατινικά (π.χ. «PAPADOPOULOS GIORGOS», «XATZIS», «KOSTOPOULOU MARIA»), γράψ' το με ΕΛΛΗΝΙΚΑ ΚΕΦΑΛΑΙΑ με τη σωστή ορθογραφία (ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ, ΧΑΤΖΗΣ, ΚΩΣΤΟΠΟΥΛΟΥ ΜΑΡΙΑ) και βάλε το αρχικό στο "recipient_latin". Ξένα ονόματα (JOHN SMITH) και εταιρείες/μάρκες με λατινικά μένουν όπως είναι.
- recipient_is_business: true αν ο ΠΑΡΑΛΗΠΤΗΣ μοιάζει με επιχείρηση και όχι με ιδιώτη (κατάστημα, εταιρεία, Ο.Ε./Ε.Ε./ΕΠΕ/ΙΚΕ/Α.Ε., ΑΦΟΙ, φαρμακείο, ιατρείο, συνεργείο, ξενοδοχείο, εμπορική ονομασία ή μάρκα, φορέας/δήμος/σχολείο). Ονοματεπώνυμο ανθρώπου → false. Κρίνε ΜΟΝΟ από το όνομα.
- notes: ΜΟΝΟ αν υπάρχει πρόβλημα που πρέπει να δει ο υπάλληλος, σε ΜΙΑ σύντομη φράση έως 10 λέξεις (π.χ. «Αμφιβολία κωδικού: 0 ή Ο», «Χειρόγραφο τηλέφωνο, δυσανάγνωστο»). ΟΧΙ περιγραφή της απόδειξης ή του εντύπου. Αν δεν υπάρχει πρόβλημα → "".
- Αν υπάρχει φωτογραφία ΟΛΟΚΛΗΡΟΥ του δέματος: package_desc = σύντομη περιγραφή έως 8 λέξεις: τι είναι, χρώμα, μέγεθος, φίρμα/λογότυπο αν φαίνεται μεγάλο (π.χ. «Καφέ κουτί JUMBO, μεσαίο», «Λευκός φάκελος A4», «Μαύρη σακούλα, μαλακή»). Αν πάνω στο δέμα φαίνεται ετικέτα με ΑΛΛΟΝ αριθμό απόδειξης ή άλλο παραλήπτη από την ετικέτα → pair_mismatch=true. Χειρόγραφο τηλέφωνο πάνω στο δέμα μετράει κανονικά για το phone. Χωρίς φωτογραφία δέματος → package_desc "", pair_mismatch false.
- pieces = πόσα τεμάχια/δέματα έχει η αποστολή, αν γράφεται (π.χ. «Αριθμός δεμάτων: 3», «Τεμάχια 3», «Ποσ 3», «1/3», «2 ΤΕΜ»). Αν δεν γράφεται → 1. Αν γράφει «2/3» = τεμάχιο 2 από 3 → pieces=3.

Απάντησε ΜΟΝΟ με ένα JSON αντικείμενο, χωρίς άλλο κείμενο, με ακριβώς αυτά τα κλειδιά:
{"receipt_no":"","parcel_code":"","kind":"Συνοδευτικό|Ασυνόδευτο|","item":"","fare_eur":null,"issued":"","departure":"","sender":"","recipient":"","phone":"","phone_is_handwritten":false,"pieces":1,"origin_city":"","destination_city":"","is_handwritten_receipt":false,"damage_visible":false,"unsure":[],"notes":"","package_desc":"","pair_mismatch":false,"recipient_is_business":false,"recipient_latin":""}`;

const SYSTEM_DESCRIBE = `Βλέπεις φωτογραφία ενός δέματος σε αποθήκη ΚΤΕΛ. Δώσε σύντομη περιγραφή έως 8 λέξεις: τι είναι (κουτί, φάκελος, σακούλα, βαλίτσα κ.λπ.), χρώμα, μέγεθος (μικρό/μεσαίο/μεγάλο), φίρμα ή λογότυπο ΜΟΝΟ αν φαίνεται καθαρά. Π.χ. «Καφέ κουτί JUMBO, μεσαίο», «Λευκός φάκελος A4», «Μαύρη σακούλα, μαλακή». Αν φαίνεται χειρόγραφο κινητό τηλέφωνο πάνω στο δέμα, γράψ' το στο phone, αλλιώς "".
Απάντησε ΜΟΝΟ με JSON: {"package_desc":"","phone":"","damage_visible":false}`;

const SYSTEM_BIZ = `Είσαι βοηθός αποθήκης δεμάτων στο Αγρίνιο. Ψάχνεις ΜΟΝΟ δημόσια ΕΠΑΓΓΕΛΜΑΤΙΚΑ τηλέφωνα ΕΠΙΧΕΙΡΗΣΕΩΝ (καταστήματα, εταιρείες, ιατρεία, συνεργεία κ.λπ.), για να ειδοποιηθούν ότι έφτασε δέμα τους.
ΚΑΝΟΝΕΣ:
- Αν το όνομα είναι φυσικό πρόσωπο (π.χ. «ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ») και όχι επιχείρηση → ΜΗΝ ψάξεις καθόλου, is_business=false, phone "". Δεν δίνουμε ποτέ προσωπικά τηλέφωνα ιδιωτών.
- Ψάξε κυρίως Αγρίνιο / Αιτωλοακαρνανία. Χρησιμοποίησε ιστοσελίδα της επιχείρησης ή επαγγελματικούς καταλόγους (vrisko.gr, 11888.gr, xo.gr, Google Business).
- Δώσε τηλέφωνο ΜΟΝΟ αν η επιχείρηση ταιριάζει καθαρά με το όνομα και την περιοχή. Αν βρεις πολλές ίδιες επιχειρήσεις ή δεν είσαι σίγουρος → confidence "low". Αν δεν βρεις → phone "".
- Τηλέφωνο σε 10 ψηφία χωρίς κενά (σταθερό 2xxxxxxxxx ή κινητό 69xxxxxxxx που δημοσιεύει η ίδια η επιχείρηση).
- email: ΜΟΝΟ το δημόσιο επαγγελματικό email της επιχείρησης όπως το δημοσιεύει η ίδια (ιστοσελίδα/κατάλογος). Ποτέ προσωπικό email ιδιώτη. Αν δεν βρεις → "".
Απάντησε στο τέλος ΜΟΝΟ με JSON: {"is_business":true,"business_name":"","phone":"","email":"","address":"","source_url":"","confidence":"high|medium|low","note":""}`;

const SYSTEM_CLASSIFY = `Σου δίνω μικρές φωτογραφίες από αποθήκη δεμάτων ΚΤΕΛ, με τη σειρά. Για ΚΑΘΕ φωτογραφία, με την ίδια σειρά, πες τι δείχνει:
- "label": κυρίως ετικέτα/απόδειξη από κοντά (ΔΕΛΤΙΟ ΑΠΟΣΚΕΥΩΝ, θερμικό χαρτάκι ή χειρόγραφη απόδειξη) — το κείμενο πιάνει μεγάλο μέρος της εικόνας.
- "parcel": ολόκληρο δέμα/συσκευασία (κουτί, φάκελος, σακούλα κ.λπ.) από πιο μακριά, ακόμα κι αν φαίνεται μικρή ετικέτα πάνω του.
Απάντησε ΜΟΝΟ με JSON: {"types":["label","parcel",...]} με ακριβώς τόσα στοιχεία όσες οι φωτογραφίες.`;

const SYSTEM_MANIFEST = `Διαβάζεις φωτογραφίες από ΚΑΤΑΣΤΑΣΗ ΦΟΡΤΩΣΗΣ / λίστα δεμάτων που στέλνει πρακτορείο ΚΤΕΛ μαζί με ένα λεωφορείο προς το Αγρίνιο. Μπορεί να είναι τυπωμένη, χειρόγραφη ή φωτογραφία οθόνης, σε μία ή περισσότερες σελίδες (οι φωτογραφίες είναι σελίδες της ΙΔΙΑΣ κατάστασης).

Τυπική μορφή (τυπωμένη από το σύστημα ΚΤΕΛ):
ΚΤΕΛ ΑΙΤΩΛΟΑΚΑΡΝΑΝΙΑΣ ΑΕ / Ημ.Αναχώρησης: Κυρ 01/11/2026 16:00 / Συνοδευτική Κατάσταση ΑΣΥΝΟΔΕΥΤΟ ...
Στήλες: Φορτωτική | Παραλήπτης | Παράδοση | Ποσ | Είδος | Τιμή
Γραμμή: 2-255-349-11663 | ΑΠΟΣΤΟΛΟΠΟΥΛΟΣ | ΚΤΕΛ ΝΑΥΠΑΚΤΟΥ | 1 | Απλό δέμα | 15,0
Το «ΣΤΑΘΜΟΣ ΑΓΡΙΝΙΟΥ» μπορεί να σπάει σε δύο γραμμές («ΣΤΑΘΜΟΣ ΑΓΡΙΝΙ» + «ΟΥ») — είναι ΕΝΑΣ προορισμός, όχι νέα γραμμή.
Στο τέλος: πίνακας Προορισμός/Ποσότητα, «Αναχώρηση: ΘΕΣΣΑΛΟΝΙΚΗ_ΣΤΑΘΜΟΣ 5» (= πόλη αναχώρησης και πλήθος), «Σύνολο: 5», «Γεν.Σύνολο: €49,00».
- receipt_no = η Φορτωτική ΑΚΡΙΒΩΣ όπως είναι τυπωμένη (π.χ. 2-255-349-11663).
- destination_city = η στήλη Παράδοση σε ονομαστική πόλης (ΣΤΑΘΜΟΣ ΑΓΡΙΝΙΟΥ → ΑΓΡΙΝΙΟ, ΚΤΕΛ ΝΑΥΠΑΚΤΟΥ → ΝΑΥΠΑΚΤΟΣ).
- origin_city = η πόλη της «Αναχώρηση:» (ΘΕΣΣΑΛΟΝΙΚΗ_ΣΤΑΘΜΟΣ → ΘΕΣΣΑΛΟΝΙΚΗ). departure = Ημ.Αναχώρησης. total_declared = «Σύνολο». fare_eur = Τιμή.

ΚΑΝΟΝΕΣ:
- Βγάλε ΚΑΘΕ γραμμή δέματος. Μην παραλείψεις καμία, μη διπλασιάσεις καμία (αν η ίδια γραμμή φαίνεται σε δύο φωτογραφίες, γράψ' την μία φορά).
- Διάβασε μόνο ό,τι φαίνεται· ό,τι λείπει → "". Αμφιβολία σε γραμμή → "unsure": true.
- Αριθμός απόδειξης συνήθως σε μορφή 258-341-23682.
- Πόλεις κεφαλαία χωρίς τόνους. Ημερομηνία/ώρα DD/MM/YYYY HH:MM.
- pieces = ΤΕΜΑΧΙΑ της γραμμής: στήλη «Ποσ» / «Ποσότητα» / «Τεμ.» / «Τεμάχια» (ή «1/3», «3 ΤΕΜ» δίπλα στη γραμμή). Διάβασέ τη για ΚΑΘΕ γραμμή· αν δεν υπάρχει τέτοια στήλη → null. Μην τη μπερδέψεις με την τιμή ή με αριθμό απόδειξης.
- ΣΗΜΑΔΙ ΜΕ ΣΤΥΛΟ: αν δίπλα ή πάνω σε μια γραμμή υπάρχει χειρόγραφο τσεκ (✓), Χ, κύκλος, υπογράμμιση ή διαγράμμιση με στυλό/μαρκαδόρο → "checked": true. Χωρίς σημάδι → false. Κοίτα προσεκτικά κάθε γραμμή.

Απάντησε ΜΟΝΟ με JSON:
{"origin_city":"","departure":"","agency":"","items":[{"receipt_no":"","recipient":"","destination_city":"","pieces":null,"fare_eur":null,"checked":false,"unsure":false}],"total_declared":null,"notes":""}
όπου total_declared = το σύνολο δεμάτων αν γράφεται στην κατάσταση.`;

const SYSTEM_CASH = `Διαβάζεις φωτογραφίες από ΚΛΕΙΣΙΜΟ ΤΑΜΕΙΟΥ του ΚΤΕΛ ΑΙΤΩΛΟΑΚΑΡΝΑΝΙΑΣ (τυπωμένη λίστα, πολλές σελίδες· οι φωτογραφίες είναι σελίδες της ΙΔΙΑΣ αναφοράς).
Επάνω (μόνο στην 1η σελίδα): «Αρ.Ταμείου: 1078 Ημερομηνία:04/11/2026 ... Αριθμός Χρήστη:228», «Δέματα:150 ... με μετρητά(ποσό):1.041,00 €», «Ποσό πληρωμής:1.041,00 €».
Στήλες: Αριθμός | Ημερ/νια Έκδοσης | Από | Έως | Ημερ/νια Δρομολογίου | Είδος Επιβάτη | Είδος Εισιτηρίου | Δέμα | Ποσό
Γραμμή: 2-000-228-336-142315 | 04/11/2026 17:17:49 | ΑΓΡΙΝΙΟ | ΑΘΗΝΑ | 04/11/2026 17:00:00 | | | ΝΑΙ | 6

ΚΑΝΟΝΕΣ:
- Βγάλε ΚΑΘΕ πλήρη γραμμή. Αν η ίδια γραμμή φαίνεται σε δύο φωτογραφίες, γράψ' την μία φορά.
- ΑΓΝΟΗΣΕ γραμμές κομμένες στην άκρη της φωτογραφίας ή από σελίδα που φαίνεται από κάτω/πλάγια (λείπει αριθμός ή ημερομηνία ή προορισμός).
- receipt_no = ο Αριθμός ΑΚΡΙΒΩΣ (π.χ. 2-000-228-336-142315). issued / departure = DD/MM/YYYY HH:MM:SS. to = η στήλη «Έως», κεφαλαία χωρίς τόνους. amount = η στήλη «Ποσό» (αριθμός, μπορεί 0).
- Αμφιβολία σε ψηφίο → "unsure": true.
- Οι τελευταίοι αριθμοί είναι συνεχόμενοι· μη «διορθώσεις» — γράψε ό,τι βλέπεις.

Απάντησε ΜΟΝΟ με JSON:
{"date":"DD/MM/YYYY","user":"","total_count":null,"total_amount":null,"items":[{"receipt_no":"","issued":"","from":"","to":"","departure":"","amount":null,"unsure":false}]}
όπου total_count = «Δέματα:» και total_amount = «Ποσό πληρωμής» (μόνο αν φαίνονται, αλλιώς null).`;

const GR2LAT: Record<string, string> = { Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X" };
const up = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

function clean(d: Record<string, unknown>) {
  const o: Record<string, unknown> = { ...d };
  o.receipt_no = String(d.receipt_no ?? "").replace(/\s/g, "");
  o.parcel_code = up(d.parcel_code).replace(/[Α-Ω]/g, c => GR2LAT[c] || c).replace(/\s/g, "");
  o.origin_city = up(d.origin_city);
  o.destination_city = up(d.destination_city);
  let ph = String(d.phone ?? "").replace(/\D/g, "").replace(/^0030(?=\d{10}$)/, "").replace(/^30(?=\d{10}$)/, "");
  o.phone = ph;
  const f = d.fare_eur;
  o.fare_eur = f === null || f === "" || f === undefined ? null : Number(String(f).replace(",", "."));
  if (o.fare_eur !== null && isNaN(o.fare_eur as number)) o.fare_eur = null;
  o.kind = /ΑΣΥΝ/.test(up(d.kind)) ? "Ασυνόδευτο" : /ΣΥΝ/.test(up(d.kind)) ? "Συνοδευτικό" : "";
  o.unsure = Array.isArray(d.unsure) ? d.unsure.map(String) : [];
  o.package_desc = String(d.package_desc ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  o.pair_mismatch = d.pair_mismatch === true || d.pair_mismatch === "true";
  o.recipient_is_business = d.recipient_is_business === true || d.recipient_is_business === "true";
  const pc = Number(String(d.pieces ?? "1").replace(/\D/g, "")) || 1; o.pieces = Math.min(Math.max(pc, 1), 99);
  return o;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (url.searchParams.get("health") === "1") return json({ ok: true, hasKey: !!key, model: MODEL, version: "2026-11-05-pieces" });
  if (url.searchParams.get("health") === "2") {
    // διαγνωστικό: μια μικρή κλήση στο AI για να φανεί αν δουλεύουν κλειδί/μοντέλο/πίστωση (δεν επιστρέφει το κλειδί)
    if (!key) return json({ ok: false, error: "missing_key" });
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 5, messages: [{ role: "user", content: "Απάντησε μόνο: OK" }] }) });
    const j = await r.json().catch(() => ({}));
    return json({ ok: r.ok, status: r.status, model: MODEL, error: j?.error?.message || null, type: j?.error?.type || null });
  }
  if (url.searchParams.get("health") === "3") {
    // διαγνωστικό: η πλήρης οδηγία ανάγνωσης χωρίς εικόνα — δείχνει αν βγαίνει JSON και γιατί σταματά
    if (!key) return json({ ok: false, error: "missing_key" });
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM,
        messages: [{ role: "user", content: "Δοκιμή χωρίς εικόνα: Αρ. Απόδειξης: 258-341-23682, ΚΟΜΙΣΤΡΟ: 5 €, Παραλήπτης: ΧΑΤΖΗΣ, Απο-From: ΠΑΤΡΑ, Προς-Το: ΑΓΡΙΝΙΟ, Ημ/νία Αναχώρησης: 31/10/2026 17:00. Επέστρεψε το JSON." }] }) });
    const j = await r.json().catch(() => ({}));
    const text = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
    return json({ ok: r.ok, status: r.status, stop_reason: j.stop_reason, blocks: (j.content || []).map((c: { type: string }) => c.type), usage: j.usage, text: text.slice(0, 600), error: j?.error?.message || null });
  }

  // μόνο συνδεδεμένοι χρήστες της εφαρμογής
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "", {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!key) return json({ error: "missing_key" }, 500);

  let body: { mode?: string; images?: { data: string; media_type?: string }[] };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const cash = body.mode === "cashclose";
  const manifest = body.mode === "manifest", classify = body.mode === "classify", describe = body.mode === "describe";
  const pkgIdx = typeof (body as { package_index?: number }).package_index === "number" ? (body as { package_index: number }).package_index : -1;
  const imgs = (body.images || []).slice(0, manifest || cash ? 4 : classify ? 30 : 3).filter(i => i && typeof i.data === "string" && i.data.length < 6_000_000);
  if (body.mode === "bizphone") return await bizPhone(body as unknown as Record<string, unknown>, key!, sb);
  if (!imgs.length) return json({ error: "no_image" }, 400);

  const content = [
    ...imgs.map(i => ({ type: "image", source: { type: "base64", media_type: i.media_type || "image/jpeg", data: i.data } })),
    { type: "text", text: cash ? imgs.length + " σελίδες από το κλείσιμο ταμείου. Επέστρεψε το JSON." : manifest ? (imgs.length > 1 ? imgs.length + " σελίδες της ίδιας κατάστασης. " : "") + "Επέστρεψε το JSON."
      : classify ? imgs.length + " φωτογραφίες. Επέστρεψε το JSON."
      : describe ? "Περιέγραψε το δέμα. Επέστρεψε το JSON."
      : pkgIdx >= 0 && pkgIdx < imgs.length ? "Φωτογραφίες του ΙΔΙΟΥ δέματος. Η φωτογραφία νούμερο " + (pkgIdx + 1) + " δείχνει ΟΛΟΚΛΗΡΟ το δέμα (για package_desc και έλεγχο pair_mismatch)" + (pkgIdx === 0 ? " — δεν υπάρχει ξεχωριστή ετικέτα από κοντά, διάβασε ό,τι φαίνεται." : "; οι υπόλοιπες είναι η ετικέτα.") + " Επέστρεψε το JSON."
      : imgs.length > 1 ? "Δύο φωτογραφίες του ΙΔΙΟΥ δέματος (η 2η συνήθως δείχνει χειρόγραφο τηλέφωνο). Επέστρεψε το JSON." : "Επέστρεψε το JSON." },
  ];

  async function call() {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: manifest || cash ? 16000 : MAX_TOKENS, system: cash ? SYSTEM_CASH : manifest ? SYSTEM_MANIFEST : classify ? SYSTEM_CLASSIFY : describe ? SYSTEM_DESCRIBE : SYSTEM, messages: [{ role: "user", content }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error("anthropic " + r.status + ": " + (j?.error?.message || ""));
    return j;
  }

  let parsed: Record<string, unknown> | null = null, usage = { input_tokens: 0, output_tokens: 0 }, err = "";
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    try {
      const j = await call();
      usage.input_tokens += j.usage?.input_tokens || 0; usage.output_tokens += j.usage?.output_tokens || 0;
      const text = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text?: string }) => c.text || "").join("");
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { err = "invalid_json: " + text.slice(0, 200); } }
      else err = "no_json (stop=" + j.stop_reason + ", blocks=" + (j.content || []).map((c: { type: string }) => c.type).join("+") + ", out=" + (j.usage?.output_tokens ?? "?") + "): " + text.slice(0, 200);
    } catch (e) { err = String(e); }
  }
  const cost = usage.input_tokens * PRICE_IN + usage.output_tokens * PRICE_OUT;
  await sb.from("ai_usage").insert({ input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_usd: cost, ok: !!parsed });
  if (!parsed) { console.error("extract_failed", err); return json({ error: "extract_failed", detail: err.slice(0, 300) }, 502); }
  if (describe) {
    const p = parsed as Record<string, unknown>;
    const ph = String(p.phone ?? "").replace(/\D/g, "").replace(/^0030(?=\d{10}$)/, "").replace(/^30(?=\d{10}$)/, "");
    return json({ data: { package_desc: String(p.package_desc ?? "").replace(/\s+/g, " ").trim().slice(0, 80), phone: ph, damage_visible: p.damage_visible === true }, usage, cost_usd: cost });
  }
  if (classify) {
    const t = Array.isArray((parsed as { types?: unknown[] }).types) ? (parsed as { types: unknown[] }).types : [];
    return json({ data: { types: imgs.map((_, i) => (t[i] === "parcel" ? "parcel" : "label")) }, usage, cost_usd: cost });
  }
  if (cash) {
    const p = parsed as { items?: Record<string, unknown>[] } & Record<string, unknown>;
    const num = (v: unknown) => { if (v == null || v === "") return null; if (typeof v === "number") return v;
      const s = String(v).replace(/[^\d.,-]/g, ""); const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); return isNaN(n) ? null : n; };
    const items = (Array.isArray(p.items) ? p.items : []).map(it => ({
      receipt_no: String(it.receipt_no ?? "").replace(/\s/g, ""), issued: String(it.issued ?? "").trim(), from: up(it.from), to: up(it.to),
      departure: String(it.departure ?? "").trim(), amount: num(it.amount), unsure: !!it.unsure })).filter(it => it.receipt_no);
    return json({ data: { date: String(p.date ?? ""), user: String(p.user ?? ""), total_count: num(p.total_count), total_amount: num(p.total_amount), items }, usage, cost_usd: cost });
  }
  if (manifest) {
    const p = parsed as { items?: Record<string, unknown>[] } & Record<string, unknown>;
    const items = (Array.isArray(p.items) ? p.items : []).map(it => ({
      receipt_no: String(it.receipt_no ?? "").replace(/\s/g, ""), recipient: String(it.recipient ?? "").trim(),
      destination_city: up(it.destination_city), pieces: it.pieces == null || it.pieces === "" ? null : Number(it.pieces),
      fare_eur: it.fare_eur == null || it.fare_eur === "" ? null : Number(String(it.fare_eur).replace(",", ".")),
      checked: it.checked === true || it.checked === "true", unsure: !!it.unsure }));
    return json({ data: { origin_city: up(p.origin_city), departure: String(p.departure ?? ""), agency: String(p.agency ?? ""), items,
      total_declared: p.total_declared == null || p.total_declared === "" ? null : Number(p.total_declared), notes: String(p.notes ?? "") }, usage, cost_usd: cost });
  }
  return json({ data: clean(parsed), usage, cost_usd: cost });
});


// ---------- επαγγελματικό τηλέφωνο επιχείρησης από το web (web search) ----------
// deno-lint-ignore no-explicit-any
async function bizPhone(body: Record<string, unknown>, key: string, sb: any) {
  const name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const city = String(body.city ?? "").trim().slice(0, 60);
  if (!name) return json({ error: "no_name" }, 400);
  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3, allowed_callers: ["direct"] }]; // χωρίς user_location: η Google/Anthropic δεν δέχεται χώρα GR — η περιοχή δίνεται στο κείμενο
  // deno-lint-ignore no-explicit-any
  let messages: any[] = [{ role: "user", content: "Παραλήπτης δέματος: «" + name + "»" + (city ? " · περιοχή: " + city : "") + ". Αν είναι επιχείρηση, βρες το δημόσιο επαγγελματικό τηλέφωνό της. Επέστρεψε το JSON." }];
  let inT = 0, outT = 0, searches = 0, text = ""; const urls = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: SYSTEM_BIZ, tools, messages }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: "anthropic", detail: String(j?.error?.message || r.status).slice(0, 300) }, 502);
    inT += j.usage?.input_tokens || 0; outT += j.usage?.output_tokens || 0; searches += j.usage?.server_tool_use?.web_search_requests || 0;
    for (const c of j.content || []) {
      if (c.type === "text") text += c.text || "";
      if (c.type === "web_search_tool_result" && Array.isArray(c.content)) c.content.forEach((x: { url?: string }) => x.url && urls.add(x.url));
    }
    if (j.stop_reason === "pause_turn") { messages = [...messages, { role: "assistant", content: j.content }]; continue; }
    break;
  }
  const cost = inT * PRICE_IN + outT * PRICE_OUT + searches * 0.01;
  await sb.from("ai_usage").insert({ input_tokens: inT, output_tokens: outT, cost_usd: cost, ok: true });
  const m = text.match(/\{[\s\S]*\}/g); let p: Record<string, unknown> = {};
  if (m) { try { p = JSON.parse(m[m.length - 1]); } catch { /* */ } }
  let ph = String(p.phone ?? "").replace(/\D/g, "").replace(/^0030(?=\d{10}$)/, "").replace(/^30(?=\d{10}$)/, "");
  if (!/^(2\d{9}|69\d{8})$/.test(ph) || p.is_business === false) ph = "";
  const src = String(p.source_url ?? "").slice(0, 300);
  let conf = ["high", "medium", "low"].includes(String(p.confidence)) ? String(p.confidence) : "low";
  if (src && urls.size && ![...urls].some(u => u.startsWith(src) || src.startsWith(u))) conf = "low"; // πηγή που δεν βρέθηκε στην αναζήτηση
  const em = String(p.email ?? "").trim().toLowerCase();
  const email = p.is_business !== false && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(em) ? em.slice(0, 120) : "";
  return json({ data: { is_business: p.is_business !== false, business_name: String(p.business_name ?? "").slice(0, 120), phone: ph, email,
    address: String(p.address ?? "").slice(0, 160), source_url: src, confidence: ph || email ? conf : "", note: String(p.note ?? "").slice(0, 160), searches }, cost_usd: cost });
}
