import { test } from "node:test";
import assert from "node:assert/strict";
import { shelfFor, cleanPhone, parseLabel, parseGrDate, fmtGr, tripsOf, tripLabel, fillTemplate, toCSV, norm } from "../src/lib.js";

test("ράφι από επώνυμο", () => {
  const cases = { "ΧΑΤΖΗΣ": "Χ", "Γαλανός": "Γ", "Ωραιόπουλος": "Ω", "Ένας Δύο": "Ε", "THEODOROU": "Θ", "Chatzis": "Χ",
    "Papadopoulos": "Π", "Psaras": "Ψ", "  -Ηλίας": "Η", "": "" };
  for (const [n, s] of Object.entries(cases)) assert.equal(shelfFor(n), s, n);
});

test("τηλέφωνα", () => {
  assert.equal(cleanPhone("694 123 4567"), "6941234567");
  assert.equal(cleanPhone("+30 6941234567"), "6941234567");
  assert.equal(cleanPhone("2641024446"), "2641024446");
  assert.equal(cleanPhone("12345"), "");
  assert.equal(cleanPhone("5941234567"), "");
});

const LABEL = `ΚΤΕΛ ΑΙΤΩΛΟΑΚΑΡΝΑΝΙΑΣ ΑΕ
Εκδότης:258
ΔΕΛΤΙΟ ΑΠΟΣΚΕΥΩΝ
ΣΥΝΟΔΕΥΤΙΚΟ
ΚΟΜΙΣΤΡΟ: 5 €
Είδος: Απλό δέμα
Ημ/νία έκδοσης: Σαβ 31/10/2026 Ωρα:16:40
Ημ/νία Αναχώρησης: Σαβ 31/10/2026 Ωρα:17:00
Αρ. Απόδειξης: 258-341-23682
Κωδ. Δέματος: 8CAM5U8B
Αποστολέας :
Παραλήπτης: ΧΑΤΖΗΣ
Τηλ:
Απο-From:
ΠΑΤΡΑ
Προς-Το:
ΑΓΡΙΝΙΟ`;

test("ανάγνωση ετικέτας ΚΤΕΛ", () => {
  const o = parseLabel(LABEL);
  assert.equal(o.receipt_no, "258-341-23682");
  assert.equal(o.parcel_code, "8CAM5U8B");
  assert.equal(o.fare_eur, 5);
  assert.equal(o.kind, "Συνοδευτικό");
  assert.equal(o.item, "Απλό δέμα");
  assert.equal(o.issued, "31/10/2026 16:40");
  assert.equal(o.departure, "31/10/2026 17:00");
  assert.equal(o.recipient_name, "ΧΑΤΖΗΣ");
  assert.equal(o.origin_city, "ΠΑΤΡΑ");
  assert.equal(o.destination_city, "ΑΓΡΙΝΙΟ");
  assert.equal(o.recipient_phone, undefined);
  assert.equal(o.sender_name, undefined);
});

test("ελληνικά γράμματα στον κωδικό δέματος → λατινικά", () => {
  assert.equal(parseLabel("Κωδ. Δέματος: 23CKGZΤΤ").parcel_code, "23CKGZTT");
});

test("ημερομηνίες", () => {
  const d = parseGrDate("Σαβ 31/10/2026 Ωρα:17:00");
  assert.equal(fmtGr(d), "31/10/2026 17:00");
  assert.equal(parseGrDate("χωρίς"), null);
});

test("δρομολόγια", () => {
  const dep = new Date(2026, 9, 31, 17, 0).toISOString();
  const fw = new Date(2026, 10, 1, 8, 15).toISOString();
  const t = tripsOf({ origin_city: "ΠΑΤΡΑ", departure_at: dep, fwd_destination: "ΙΩΑΝΝΙΝΑ", fwd_departure_at: fw });
  assert.equal(tripLabel(t[0]), "ΠΑΤΡΑ · 31/10/2026 17:00");
  assert.equal(tripLabel(t[1]), "Αποστολή ΑΓΡΙΝΙΟ → ΙΩΑΝΝΙΝΑ · 01/11/2026 08:15");
  assert.deepEqual(tripsOf({}), ["__none"]);
});

test("πρότυπο μηνύματος χωρίς κενά όταν λείπουν στοιχεία", () => {
  const tpl = "Το δέμα σας{αρ} {από} έφτασε.\n{κωδικός}\n\nΤέλος";
  assert.equal(fillTemplate(tpl, { receipt_no: "1-2-3", origin_city: "ΠΑΤΡΑ", pickup_code: "0042" }),
    "Το δέμα σας (αρ. 1-2-3) από ΠΑΤΡΑ έφτασε.\nΚωδικός παραλαβής: 0042\n\nΤέλος");
  assert.equal(fillTemplate(tpl, {}), "Το δέμα σας έφτασε.\n\nΤέλος");
});

test("CSV για Excel", () => {
  const s = toCSV([{ a: 'x;y', b: 2 }], [["a", "Α"], ["b", "Β"]]);
  assert.ok(s.startsWith("﻿"));
  assert.equal(s.slice(1), 'Α;Β\r\n"x;y";2');
});

test("norm", () => { assert.equal(norm("  Ιωάννινα "), "ΙΩΑΝΝΙΝΑ"); });

import { autoSaveDecision, extractedToParcel } from "../src/lib.js";
const good = { receipt_no: "258-341-23682", recipient: "ΧΑΤΖΗΣ", origin_city: "ΠΑΤΡΑ", fare_eur: 5, departure: "31/10/2026 17:00", unsure: [], phone: "" };
test("αυτόματη καταχώρηση: καλή ετικέτα χωρίς τηλέφωνο περνά", () => {
  assert.deepEqual(autoSaveDecision(good, () => false), { auto: true, problems: [] });
});
test("αυτόματη καταχώρηση: κάθε πρόβλημα στέλνει σε έλεγχο", () => {
  const chk = (patch, prob, exists = false) => { const r = autoSaveDecision({ ...good, ...patch }, () => exists); assert.equal(r.auto, false); assert.ok(r.problems.includes(prob), prob + " → " + r.problems); };
  chk({ receipt_no: "" }, "missing_receipt_no");
  chk({}, "duplicate", true);
  chk({ recipient: "" }, "missing_recipient");
  chk({ origin_city: "" }, "missing_origin");
  chk({ fare_eur: null }, "missing_fare");
  chk({ fare_eur: 50 }, "fare_out_of_range");
  chk({ departure: "" }, "missing_departure");
  chk({ phone: "12345" }, "invalid_phone");
  chk({ unsure: ["phone"] }, "unsure:phone");
  chk({ is_handwritten_receipt: true }, "handwritten_receipt");
});
test("αποτέλεσμα AI → δέμα (χειρόγραφο τηλέφωνο, μεταφόρτωση)", () => {
  const a = extractedToParcel({ ...good, phone: "6941234567", phone_is_handwritten: true });
  assert.equal(a.shelf, "Χ"); assert.equal(a.status, "arrived"); assert.equal(a.phone_source, "handwritten"); assert.equal(a.phone_confirmed, false);
  const t = extractedToParcel({ ...good, destination_city: "Ιωάννινα" });
  assert.equal(t.status, "transit"); assert.equal(t.shelf, null); assert.equal(t.destination_city, "ΙΩΑΝΝΙΝΑ");
});
import { cleanIdDoc } from "../src/lib.js";
test("αριθμός εγγράφου: ελληνικά/λατινικά ίδια", () => {
  assert.equal(cleanIdDoc("ΑΚ 123456"), "AK123456");
  assert.equal(cleanIdDoc("ak-123456"), "AK123456");
  assert.equal(cleanIdDoc("Χ 00112233"), "X00112233");
});
import { reconcile, tripsOf as _t } from "../src/lib.js";
test("σύγκριση κατάστασης: απόδειξη, όνομα, λείπει, επιπλέον", () => {
  const dep = new Date(2026, 9, 31, 17, 0).toISOString();
  const P = [
    { id: "a", receipt_no: "258-341-23682", recipient_name: "ΧΑΤΖΗΣ", origin_city: "ΠΑΤΡΑ", departure_at: dep },
    { id: "b", receipt_no: null, recipient_name: "ΓΑΛΑΝΟΣ ΝΙΚΟΣ", origin_city: "ΠΑΤΡΑ", departure_at: dep },
    { id: "c", receipt_no: "258-341-99999", recipient_name: "ΔΗΜΟΥ", origin_city: "ΠΑΤΡΑ", departure_at: dep },
    { id: "d", receipt_no: "1-1-1", recipient_name: "ΠΑΠΑΣ", origin_city: "ΠΑΤΡΑ", departure_at: dep },
    { id: "e", receipt_no: "1-1-2", recipient_name: "ΠΑΠΑΣ", origin_city: "ΠΑΤΡΑ", departure_at: dep },
  ];
  const items = [
    { receipt_no: "258 341 23682", recipient: "Χατζής" },  // απόδειξη
    { receipt_no: "", recipient: "Γαλανός" },              // όνομα (μοναδικό)
    { receipt_no: "", recipient: "Παπάς" },                // δύο ΠΑΠΑΣ → αβέβαιο → λείπει
    { receipt_no: "258-341-00000", recipient: "Κώστα" },   // δεν υπάρχει
  ];
  const trip = { origin: "ΠΑΤΡΑ", key: tripsOf(P[0])[0] };
  const r = reconcile(items, P, trip);
  assert.deepEqual(r.found.map(f => [f.parcel.id, f.how]), [["a", "receipt"], ["b", "name"]]);
  assert.deepEqual(r.missing.map(m => m.recipient), ["Παπάς", "Κώστα"]);
  assert.deepEqual(r.extra.map(x => x.id).sort(), ["c", "d", "e"]);
});

import { sameReceipt, cityFromStation } from "../src/lib.js";
test("φορτωτική κατάστασης = απόδειξη ετικέτας", () => {
  assert.equal(sameReceipt("2-255-349-11663", "255-349-11663"), true);
  assert.equal(sameReceipt("258-341-23682", "258-341-23682"), true);
  assert.equal(sameReceipt("2-255-349-11663", "255-349-11664"), false);
  assert.equal(sameReceipt("123", "123"), false);
  assert.equal(reconcile([{ receipt_no: "2-255-349-11663", recipient: "ΑΠΟΣΤΟΛΟΠΟΥΛΟΣ" }], [{ id: "x", receipt_no: "255-349-11663", recipient_name: "ΑΠΟΣΤΟΛΟΠΟΥΛΟΣ" }]).found.length, 1);
});
test("σταθμός → πόλη", () => {
  assert.equal(cityFromStation("ΣΤΑΘΜΟΣ ΑΓΡΙΝΙΟΥ"), "ΑΓΡΙΝΙΟ");
  assert.equal(cityFromStation("ΚΤΕΛ ΝΑΥΠΑΚΤΟΥ"), "ΝΑΥΠΑΚΤΟΣ");
  assert.equal(cityFromStation("ΘΕΣΣΑΛΟΝΙΚΗ_ΣΤΑΘΜΟΣ"), "ΘΕΣΣΑΛΟΝΙΚΗ");
  assert.equal(cityFromStation("ΣΤΑΘΜΟΣ ΑΓΡΙΝΙ"), "ΑΓΡΙΝΙΟ");
});
