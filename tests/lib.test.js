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
  assert.deepEqual(autoSaveDecision(good, () => false), { auto: true, problems: [], flags: [] });
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
  chk({ unsure: ["recipient"] }, "unsure:recipient");
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

import { shortNote } from "../src/lib.js";
test("shortNote κόβει τις μεγάλες περιγραφές", () => {
  assert.equal(shortNote(""), null);
  assert.equal(shortNote("Χειρόγραφη απόδειξη μεταφοράς ασυνόδευτου μικροδέματος (έντυπο ΚΤΕΛ Ν. Αιτωλοακαρνανίας, αποθήκη Μεσολογγίου). Πεδία γραμμένα με στυλό."), null);
  assert.equal(shortNote("Ο κωδικός δέματος έχει αμφιβολία μεταξύ 0 και Ο στις θέσεις 4 και 8."), "Ο κωδικός δέματος έχει αμφιβολία μεταξύ 0 και Ο στις θέσεις 4 και 8");
  assert.ok(shortNote("α ".repeat(80)).length <= 90);
});

import { nearReceipt, likelySameParcel, sameNameTrip } from "../src/lib.js";
test("διπλά: σχεδόν ίδιος αριθμός μόνο με ίδιο επώνυμο", () => {
  assert.ok(nearReceipt("258-341-23682", "2-258-341-23682"));
  assert.ok(nearReceipt("258-341-23682", "258-341-23632"));
  assert.equal(likelySameParcel({ receipt_no: "258-341-23682", recipient_name: "ΧΑΤΖΗΣ" }, { receipt_no: "258-341-23683", recipient_name: "ΓΑΛΑΝΟΣ" }), "");
  assert.equal(likelySameParcel({ receipt_no: "258-341-23682", recipient_name: "ΧΑΤΖΗΣ Γ" }, { receipt_no: "258-341-23632", recipient_name: "ΧΑΤΖΗΣ ΓΙΩΡΓΟΣ" }), "near");
  assert.equal(likelySameParcel({ receipt_no: "2-255-349-11663", recipient_name: "Α" }, { receipt_no: "255-349-11663", recipient_name: "Β" }), "receipt");
  assert.ok(sameNameTrip({ recipient_name: "ΧΑΤΖΗΣ", origin_city: "ΠΑΤΡΑ", departure_at: "2026-11-02T15:00:00Z" }, { recipient_name: "ΧΑΤΖΗΣ ΝΙΚ", origin_city: "ΠΑΤΡΑ", departure_at: "2026-11-02T17:00:00Z" }));
});

import { handwrittenReceipt } from "../src/lib.js";
test("χειρόγραφη απόδειξη: κόκκινος αριθμός + μπλοκ", () => {
  assert.equal(handwrittenReceipt({ is_handwritten_receipt: true, receipt_no: "3401", parcel_code: "33950048" }), "3401 (33950048)");
  assert.equal(handwrittenReceipt({ is_handwritten_receipt: false, receipt_no: "258-341-23682", parcel_code: "8CAM5U8B" }), "258-341-23682");
  assert.equal(handwrittenReceipt({ is_handwritten_receipt: true, receipt_no: "3401", parcel_code: "" }), "3401");
});

test("αριθμός απόδειξης ΚΤΕΛ Ιωαννίνων (σκέτος αριθμός) δεν πάει για έλεγχο λόγω μορφής", () => {
  const d = { receipt_no: "202682615", recipient: "ΓΑΛΑΖΟΥΛΑΣ", origin_city: "ΙΩΑΝΝΙΝΑ", fare_eur: 8, departure: "03/11/2026 13:00", unsure: [] };
  assert.deepEqual(autoSaveDecision(d, () => false).problems, []);
});

import { surnameFirst } from "../src/lib.js";
test("πρώτα το επώνυμο", () => {
  assert.equal(surnameFirst("ΓΙΩΡΓΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ"), "ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ");
  assert.equal(surnameFirst("Μαρία Κωστοπούλου"), "Κωστοπούλου Μαρία");
  assert.equal(surnameFirst("Ν. ΔΗΜΟΥ"), "ΔΗΜΟΥ Ν.");
  assert.equal(surnameFirst("ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ"), "ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ");
  assert.equal(surnameFirst("ΘΩΜΑΣ ΓΙΩΡΓΟΣ"), "ΘΩΜΑΣ ΓΙΩΡΓΟΣ"); // αμφίσημο → όπως είναι
  assert.equal(surnameFirst("ΝΙΚΟΣ ΣΤΑΘΗΣ ΑΦΟΙ", true), "ΝΙΚΟΣ ΣΤΑΘΗΣ ΑΦΟΙ");
  assert.equal(surnameFirst("ΧΑΤΖΗΣ"), "ΧΑΤΖΗΣ");
});

import { smsFor, gsmGreek, smsLen } from "../src/lib.js";
test("SMS ελληνικά σε 1 μήνυμα", () => {
  const s = smsFor("", { receipt_no: "123 (2183981826)", pickup_code: "4821" });
  assert.ok(smsLen(s) <= 160, s.length + " " + s);
  assert.ok(!/[\u0370-\u03ff]/.test(s.replace(/[ΓΔΘΛΞΠΣΦΨΩ]/g, "")), s);
  assert.ok(!/DELIVERY|ΣΠΙΤΙ|3,50/.test(s));
  assert.equal(gsmGreek("Ήρθε το δέμα"), "HPΘE TO ΔEMA");
});

import { autoSaveDecision as asd } from "../src/lib.js";
test("αβέβαιος αριθμός δεν στέλνει για έλεγχο", () => {
  const base = { receipt_no: "258-341-23682", recipient: "ΠΑΠΑΣ ΝΙΚΟΣ", origin_city: "ΑΘΗΝΑ", fare_eur: 6, departure: "03/11/2026 09:30" };
  let r = asd({ ...base, unsure: ["receipt_no", "parcel_code", "phone", "issued"] }, () => false);
  assert.equal(r.auto, true); assert.deepEqual(r.flags, ["receipt_no", "phone"]);
  r = asd({ ...base, unsure: ["recipient"] }, () => false); assert.equal(r.auto, false);
  r = asd({ ...base, receipt_no: "3401", parcel_code: "33950048", is_handwritten_receipt: true, departure: "", issued: "03/11/2026" }, () => false);
  assert.equal(r.auto, true, r.problems.join());
  r = asd({ ...base, receipt_no: "", parcel_code: "", is_handwritten_receipt: true }, () => false); assert.equal(r.auto, false);
});

import { receiptFixes, fixedReceiptNote } from "../src/lib.js";
test("διόρθωση αριθμού από κατάσταση", () => {
  const p1 = { id: 1, receipt_no: "255-349-11668", recipient_name: "ΠΑΠΑΣ ΝΙΚΟΣ", notes: "⚠ Έλεγξε: αριθμό απόδειξης, κόμιστρο (αβέβαιη ανάγνωση)" };
  const p2 = { id: 2, receipt_no: "111-222-33333", recipient_name: "ΔΗΜΟΥ ΜΑΡΙΑ" };
  const p3 = { id: 3, receipt_no: "999-888-77777", recipient_name: "ΚΟΝΤΟΣ ΓΙΩΡΓΟΣ" };
  const all = [p1, p2, p3, { id: 4, receipt_no: "555-555-55555" }];
  const fx = receiptFixes([
    { item: { receipt_no: "2-255-349-11663", recipient: "ΠΑΠΑΣ ΝΙΚΟΣ" }, parcel: p1, how: "receipt~" },
    { item: { receipt_no: "444-444-44444", recipient: "ΔΗΜΟΥ ΜΑΡΙΑ" }, parcel: p2, how: "name" },
    { item: { receipt_no: "444-444-00000", recipient: "ΚΟΝΤΟΣ" }, parcel: p3, how: "name" },          // μόνο επώνυμο → όχι
    { item: { receipt_no: "555-555-55555", recipient: "ΚΟΝΤΟΣ ΓΙΩΡΓΟΣ" }, parcel: p3, how: "name" }, // ανήκει σε άλλο → όχι
    { item: { receipt_no: "111-222-33334", recipient: "ΔΗΜΟΥ ΜΑΡΙΑ", unsure: true }, parcel: p2, how: "receipt~" },
  ], all);
  assert.deepEqual(fx.map(f => [f.parcel.id, f.to]), [[1, "255-349-11663"], [2, "444-444-44444"]]);
  assert.equal(fixedReceiptNote(p1.notes, "255-349-11668"), "⚠ Έλεγξε: κόμιστρο (αβέβαιη ανάγνωση) · ✎ Αριθμός διορθώθηκε από την κατάσταση (ήταν 255-349-11668)");
  assert.equal(fixedReceiptNote("⚠ Έλεγξε: αριθμό απόδειξης (αβέβαιη ανάγνωση)", "1"), "✎ Αριθμός διορθώθηκε από την κατάσταση (ήταν 1)");
});

import { greeklishToGreek, isGreeklishName, soundKey } from "../src/lib.js";
test("greeklish → ελληνικά", () => {
  assert.equal(greeklishToGreek("PAPADOPOULOS GIORGOS"), "ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΟΡΓΟΣ");
  assert.equal(greeklishToGreek("CHATZIS"), "ΧΑΤΖΗΣ");
  assert.equal(greeklishToGreek("NTOKOS THANASIS"), "ΝΤΟΚΟΣ ΘΑΝΑΣΗΣ");
  assert.equal(greeklishToGreek("MPAKALI"), "ΜΠΑΚΑΛΙ");
  assert.equal(isGreeklishName("PAPADOPOULOS GIORGOS"), true);
  assert.equal(isGreeklishName("JOHN SMITH"), false);
  assert.equal(isGreeklishName("ΠΑΠΑΣ"), false);
  assert.equal(isGreeklishName("SKROUTZ MARKET"), false);
  assert.equal(soundKey("XATZHS"), soundKey("ΧΑΤΖΗΣ"));
  assert.equal(soundKey("papadopoulos giorgos"), soundKey("ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ"));
});

import { greekName, surnameFirst as sf2 } from "../src/lib.js";
test("greeklish όνομα με σωστά μικρά ονόματα", () => {
  assert.equal(greekName("PAPADOPOULOS GIORGOS"), "ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ");
  assert.equal(sf2(greekName("MARIA KOSTOPOULOU")), "ΚΟΣΤΟΠΟΥΛΟΥ ΜΑΡΙΑ");
});

test("νέο κείμενο SMS", () => {
  const am = new Date(2026, 10, 3, 9, 0), pm = new Date(2026, 10, 3, 18, 0);
  const s = smsFor("", { receipt_no: "3401 (33950048)", pickup_code: "4821" }, pm);
  assert.equal(s, gsmGreek("ΚΑΛΗΣΠΕΡΑ ΣΑΣ! ΤΟ ΔΕΜΑ ΣΑΣ ΗΡΘΕ ΣΤΟ ΣΤΑΘΜΟ ΚΤΕΛ ΑΓΡΙΝΙΟΥ. ΚΩΔ. ΠΑΡΑΛΑΒΗΣ 4821. ΩΡΑΡΙΟ ΔΕΥ-ΠΑΡ 06:30-21:30, ΣΚ 08:00-21:30. ΤΗΛ. 2641024446"));
  assert.ok(smsLen(s) <= 160);
  assert.ok(smsFor("", {}, am).startsWith(gsmGreek("ΚΑΛΗΜΕΡΑ ΣΑΣ! ΤΟ ΔΕΜΑ ΣΑΣ ΗΡΘΕ ΣΤΟ ΣΤΑΘΜΟ ΚΤΕΛ ΑΓΡΙΝΙΟΥ. ΩΡΑΡΙΟ")));
});

import { extractedToOutgoing, sameOutgoing, fillBlanks, outCheck, outCash, outSmsFor } from "../src/lib.js";
test("εξερχόμενα: ανάγνωση, ταίριασμα, ταμείο, SMS", () => {
  const o = extractedToOutgoing({ receipt_no: "228-336-142206", parcel_code: "C52WQPXG", fare_eur: 5, issued: "04/11/2026 10:34", departure: "04/11/2026 13:00",
    sender: "", recipient: "ΝΙΚΟΛΑΟΣ ΤΣΟΥΛΟΣ", phone: "", origin_city: "ΑΓΡΙΝΙΟ", destination_city: "ΝΑΥΠΑΚΤΟΣ" });
  assert.equal(o.receipt_no, "228-336-142206"); assert.equal(o.destination_city, "ΝΑΥΠΑΚΤΟΣ"); assert.equal(o.recipient_name, "ΤΣΟΥΛΟΣ ΝΙΚΟΛΑΟΣ"); assert.equal(o.fare_eur, 5);
  const h = extractedToOutgoing({ receipt_no: "3431", parcel_code: "33950048", is_handwritten_receipt: true, recipient: "ΠΑΠΑΣ", destination_city: "ΑΘΗΝΑ" });
  assert.equal(h.receipt_no, "3431 (33950048)"); assert.equal(h.is_handwritten, true);
  assert.ok(sameOutgoing({ receipt_no: "228-336-142206" }, { receipt_no: "228336142206" }));
  assert.ok(sameOutgoing({ parcel_code: "C52WQPXG" }, { parcel_code: "c52wqpxg" }));
  assert.deepEqual(fillBlanks({ recipient_phone: "6900000000", sender_name: "" }, { recipient_phone: "6911111111", sender_name: "ΚΩΣΤΑΣ" }), { sender_name: "ΚΩΣΤΑΣ" });
  const rows = [{ in_report: true, photographed: true, fare_eur: 5, destination_city: "ΝΑΥΠΑΚΤΟΣ", operator: "ΑΓΗΣ" }, { in_report: true, photographed: false, fare_eur: 8, destination_city: "ΑΘΗΝΑ", operator: "ΑΓΗΣ" },
    { in_report: false, photographed: true, fare_eur: 7.5, destination_city: "ΑΘΗΝΑ", operator: "ΕΛΕΝΗ" }, { status: "cancelled", in_report: true, photographed: true, fare_eur: 100 }];
  const c = outCheck(rows); assert.equal(c.ok.length, 1); assert.equal(c.noPhoto.length, 1); assert.equal(c.notInReport.length, 1);
  const k = outCash(rows, 18); assert.equal(k.fares, 20.5); assert.equal(k.commission, 3.69); assert.equal(k.byDest[0].key, "ΑΘΗΝΑ");
  const s = outSmsFor({ destination_city: "ΝΑΥΠΑΚΤΟΣ", departure_at: new Date(2026, 10, 4, 13, 0).toISOString(), receipt_no: "228-336-142206" }, new Date(2026, 10, 4, 10, 0));
  assert.ok(smsLen(s) <= 160, s); assert.ok(s.includes("13:00") && s.includes("142206"), s);
});

import { isAgrinioReceipt } from "../src/lib.js";
test("μόνο αποδείξεις 228 (αποθήκη Αγρινίου)", () => {
  assert.ok(isAgrinioReceipt("228-336-142206")); assert.ok(isAgrinioReceipt("2-228-336-142206")); assert.ok(isAgrinioReceipt("228336142206"));
  assert.ok(!isAgrinioReceipt("258-341-23682")); assert.ok(!isAgrinioReceipt("3431 (33950048)")); assert.ok(!isAgrinioReceipt("2-255-349-11663")); assert.ok(!isAgrinioReceipt(""));
});

import { routeOf } from "../src/lib.js";
test("δρομολόγιο από την κατάσταση", () => {
  assert.deepEqual(routeOf(["ΚΤΕΛ ΑΙΤΩΛΙΚΟΥ", "ΜΕΣΟΛΟΓΓΙ", "ΑΝΤΙΡΡΙΟ", "ΚΤΕΛ ΝΑΥΠΑΚΤΟΥ", "ΣΤΑΘΜΟΣ ΠΑΤΡΑΣ", "ΝΑΥΠΑΚΤΟΣ"]).end, "ΠΑΤΡΑ");
  assert.equal(routeOf(["ΑΜΦΙΛΟΧΙΑ", "ΑΜΦΙΛΟΧΙΑ", "ΒΟΝΙΤΣΑ"]).end, "ΑΜΦΙΛΟΧΙΑ");
});

import { find228 } from "../src/scan.js";
test("σάρωση: βρίσκει μόνο 228-…", () => {
  assert.deepEqual(find228("04 11 2026 10 34\n228-336-142206\nC52"), ["228-336-142206"]);
  assert.deepEqual(find228("228 336 142206"), ["228-336-142206"]);
  assert.deepEqual(find228("228\n336-142206"), []);          // όχι από διαφορετικές γραμμές
  assert.deepEqual(find228("258-341-23682"), []);
  assert.deepEqual(find228("1228-336-142206"), []);
});
