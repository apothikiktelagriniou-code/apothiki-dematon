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
