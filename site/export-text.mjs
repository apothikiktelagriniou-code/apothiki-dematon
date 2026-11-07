// Βγάζει όλους τους προορισμούς και τις τιμές σε απλό κείμενο, από τα ίδια δεδομένα με την ιστοσελίδα.
// node site/export-text.mjs > Προορισμοί_και_τιμές.txt
import * as D from "./src/data.mjs";
import { SCHEDULE_TIMES } from "../src/schedule-seed.js";

const S = ["Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ", "Κυρ"];
const dayStr = d => d === "1111111" ? "καθημερινά" : d === "1111100" ? "Δευ–Παρ" : d === "1111110" ? "Δευ–Σαβ" : S.filter((_, i) => d[i] === "1").join(", ");
const times = keys => {
  const by = new Map(); // ίδια ώρα σε πολλές γραμμές → ενώνονται οι μέρες
  for (const r of SCHEDULE_TIMES.filter(r => keys.includes(r.dest))) {
    const m = by.get(r.time) || "0000000";
    by.set(r.time, [...m].map((c, i) => (c === "1" || r.days[i] === "1") ? "1" : "0").join(""));
  }
  return [...by].sort((a, b) => a[0].localeCompare(b[0])).map(([t, d]) => `${t} (${dayStr(d)})`).join(", ") || "—";
};
const C = D.CATEGORIES;
const priceLine = t => C.map(c => `${c.name}: ${t.p[c.id] == null ? "ρωτήστε" : t.p[c.id] + " €"}`).join(" | ");
const sortEl = a => a.slice().sort((x, y) => x.name.localeCompare(y.name, "el"));
const L = [];
const line = (s = "") => L.push(s);
const today = new Intl.DateTimeFormat("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());

line(`ΑΠΟΘΗΚΗ ΔΕΜΑΤΩΝ ΚΤΕΛ ΑΓΡΙΝΙΟΥ — ΠΡΟΟΡΙΣΜΟΙ ΚΑΙ ΤΙΜΕΣ (${today})`);
line("Τιμές ΚΤΕΛ Αιτωλοακαρνανίας, ανά τεμάχιο, με ΦΠΑ.");
line(`Το δέμα παραδίδεται στο ταμείο το αργότερο ${D.BUSINESS.cutoffMin} λεπτά πριν την αναχώρηση.`);
line();
line("1. ΚΑΤΗΓΟΡΙΕΣ ΜΕΓΕΘΟΥΣ (πρόταση — να ελεγχθεί στο ταμείο)");
for (const c of C) {
  if (c.box) line(`- ${c.name}: χωράει σε ${c.box.L} × ${c.box.W} × ${c.box.H} εκ., έως ${String(c.kg).replace(".", ",")} kg`);
  else line(`- ${c.name}${c.kg ? `: έως ${c.kg} kg` : ""}${c.note ? ` — ${c.note}` : ""}`);
}
line("- Μεγαλύτερο από 80 × 60 × 60 εκ. ή πάνω από 30 kg: ρωτήστε.");
line("- Μετράει η μεγαλύτερη κατηγορία από διαστάσεις και βάρος (μικρό κουτί 8 kg = μεσαίο).");
line();
line("2. ΤΙΜΟΚΑΤΑΛΟΓΟΣ");
for (const t of Object.values(D.TARIFFS)) { line(`${t.label}`); line(`   ${priceLine(t)}`); }
line();
line("3. ΑΠΕΥΘΕΙΑΣ ΔΡΟΜΟΛΟΓΙΑ");
for (const d of sortEl(D.DESTINATIONS.filter(x => x.type === "direct"))) {
  line(`- ${d.name} — τιμές: ${D.TARIFFS[d.tariff].label}`);
  line(`   Αναχωρήσεις: ${times(d.sched)}`);
  line(`   Παράδοση: ${d.eta}${d.note ? ` · ${d.note}` : ""}`);
}
line();
line("4. ΕΝΤΟΣ ΝΟΜΟΥ ΑΙΤΩΛΟΑΚΑΡΝΑΝΙΑΣ — τιμές «Εντός Νομού»");
for (const d of sortEl(D.DESTINATIONS.filter(x => x.type === "local"))) line(`- ${d.name}: ${times(d.sched)}`);
line();
line("5. ΜΕ ΑΝΤΑΠΟΚΡΙΣΗ");
line("   Εδώ πληρώνεται η τιμή του κόμβου (ΚΤΕΛ Αιτωλοακαρνανίας). Ο αποστολέας πληρώνει και περίπου άλλο τόσο,");
line("   που μπαίνει σε φάκελο πάνω στο δέμα για το πρακτορείο που συνεχίζει τη μεταφορά.");
for (const [k, h] of Object.entries(D.HUBS)) {
  const list = sortEl(D.DESTINATIONS.filter(x => x.hub === k));
  line(`- Μέσω ${h.label} (τιμές ${D.TARIFFS[h.tariff].label}) — ${h.eta}`);
  line(`   ${list.map(x => x.name + (x.eta ? ` [${x.eta}]` : "")).join(", ")}`);
}
line();
line("6. ΔΕΝ ΕΞΥΠΗΡΕΤΟΥΝΤΑΙ");
line(`   ${sortEl(D.DESTINATIONS.filter(x => x.type === "none")).map(x => x.name).join(", ")}`);
line();
line("7. ΑΛΛΕΣ ΧΡΕΩΣΕΙΣ ΚΑΙ ΠΛΗΡΩΜΕΣ");
line(`- Φύλαξη δέματος: δωρεάν ${D.STORAGE.freeDays} ημέρες από την άφιξη, μετά ${D.STORAGE.perDay} €/ημέρα, έως ${D.STORAGE.cap} € συνολικά.`);
line(`- Φύλαξη αποσκευών: ${D.LUGGAGE.perPiecePerDay} € ${D.LUGGAGE.note.toLowerCase()}`);
line(`- Παράδοση/παραλαβή στο σπίτι (ΔΕΝ έχει ξεκινήσει): ${D.HOME.zones.map(z => `${z.name} ${z.price} €`).join(", ")}, ${D.HOME.hours}, ${D.HOME.vehicles.toLowerCase()}. ${D.HOME.athensNote}`);
line(`- Πληρωμή: ${D.BUSINESS.payments.join(", ")}.`);
console.log(L.join("\n"));
