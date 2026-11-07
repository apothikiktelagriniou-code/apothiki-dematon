import { test } from "node:test";
import assert from "node:assert/strict";
import * as DATA from "../src/data.mjs";
import { classifyBox, quote, nextDepartures, storageFee, prohibitedHit, daysLabel } from "../src/calc.mjs";
import { SCHEDULE_TIMES } from "../../src/schedule-seed.js";

const C = DATA.CATEGORIES;

test("κατηγορία από διαστάσεις και βάρος", () => {
  assert.equal(classifyBox(C, [30, 20, 10], 2).id, "mikro");
  assert.equal(classifyBox(C, [20, 30, 10], 2).id, "mikro", "η σειρά των διαστάσεων δεν μετράει");
  assert.equal(classifyBox(C, [35, 25, 15], 8).id, "mesaio", "βαρύ μικρό κουτί → μεσαίο λόγω βάρους");
  assert.equal(classifyBox(C, [35, 25, 15], 8).by, "kg");
  assert.equal(classifyBox(C, [70, 50, 30], 4).id, "megalo");
  assert.equal(classifyBox(C, [100, 50, 30], 4).oversize, true);
  assert.equal(classifyBox(C, [30, 20, 10], 31).oversize, true);
  assert.equal(classifyBox(C, [32, 23, 1], 0.2, "fakelos").id, "fakelos");
  assert.equal(classifyBox(C, [32, 23, 5], 0.2, "fakelos").id, "mikro", "χοντρός φάκελος → μικρό κουτί");
  assert.equal(classifyBox(C, [32, 23, 1], 0.2).id, "mikro", "χωρίς επιλογή φακέλου ξεκινά από μικρό");
});

test("τιμές απευθείας, εντός νομού, ανταπόκριση", () => {
  assert.equal(quote(DATA, { dest: "Αθήνα", catId: "mesaio" }).total, 8);
  assert.equal(quote(DATA, { dest: "Βέροια", catId: "megalo", pieces: 2 }).total, 24, "τιμές Θεσσαλονίκης × 2");
  assert.equal(quote(DATA, { dest: "Ναύπακτος", catId: "tenekes" }).total, 8);
  assert.equal(quote(DATA, { dest: "Λευκαδα", catId: "fakelos" }).total, 5, "χωρίς τόνους");
  const t = quote(DATA, { dest: "Τρίπολη", catId: "mikro" });
  assert.equal(t.status, "transfer"); assert.equal(t.total, 7); assert.equal(t.grandEstimate, 14);
  assert.equal(quote(DATA, { dest: "Χανιά", catId: "tenekes_syn" }).total, 10);
  assert.equal(quote(DATA, { dest: "Κέρκυρα", catId: "mikro" }).total, 10, "Κέρκυρα = τιμές Ηρακλείου");
  assert.equal(quote(DATA, { dest: "Ρέθυμνο", catId: "mikro" }).total, 10, "Κρήτη μέσω Χανίων/Ηρακλείου");
  assert.ok(quote(DATA, { dest: "Ηγουμενίτσα", catId: "mikro" }).eta.includes("επόμενη"));
  assert.ok(quote(DATA, { dest: "Κεφαλονιά", catId: "mikro" }).eta.includes("14:00"));
  assert.equal(quote(DATA, { dest: "Χαλκιδική", catId: "mikro" }).status, "none");
  assert.equal(quote(DATA, { dest: "Άμφισσα", catId: "mikro" }).status, "none");
  assert.equal(quote(DATA, { dest: "Θήβα", catId: "mikro" }).status, "none");
});

test("κάθε προορισμός με τιμή έχει πίνακα, κάθε κλειδί δρομολογίου υπάρχει", () => {
  const keys = new Set(SCHEDULE_TIMES.map(r => r.dest));
  for (const d of DATA.DESTINATIONS) {
    if (d.type === "direct" || d.type === "local") {
      assert.ok(DATA.TARIFFS[d.tariff], d.name);
      for (const k of d.sched) assert.ok(keys.has(k), `${d.name}: ${k}`);
    }
    if (d.type === "transfer") assert.ok(DATA.HUBS[d.hub], d.name);
  }
  const names = DATA.DESTINATIONS.map(d => d.name);
  assert.equal(new Set(names).size, names.length, "διπλός προορισμός");
});

test("επόμενες αναχωρήσεις", () => {
  const r = nextDepartures(SCHEDULE_TIMES, ["ΘΕΣΣΑΛΟΝΙΚΗ"], { dow: 0, minutes: 10 * 60 }, 2);
  assert.deepEqual(r.map(x => x.day + " " + x.time), ["Αύριο 09:30", "Τετάρτη 09:30"]);
  const a = nextDepartures(SCHEDULE_TIMES, ["ΑΘΗΝΑ"], { dow: 0, minutes: 10 * 60 }, 3);
  assert.equal(a[0].time, "11:00");
  assert.equal(daysLabel(SCHEDULE_TIMES, ["ΑΘΗΝΑ"]), "Καθημερινά");
});

test("φύλαξη: 10 μέρες δωρεάν, 3 €/ημέρα, έως 20 €", () => {
  const S = DATA.STORAGE;
  assert.equal(storageFee(S, "2026-11-01", "2026-11-11").fee, 0);
  assert.equal(storageFee(S, "2026-11-01", "2026-11-12").fee, 3);
  assert.equal(storageFee(S, "2026-11-01", "2026-11-17").fee, 18);
  assert.equal(storageFee(S, "2026-11-01", "2026-11-18").fee, 20);
  assert.equal(storageFee(S, "2026-11-01", "2026-12-30").fee, 20);
  assert.equal(storageFee(S, "2026-11-01", "2026-11-05").freeUntil, "11/11");
});

test("απαγορευμένα στην περιγραφή", () => {
  assert.ok(prohibitedHit(DATA.PROHIBITED, "Φιάλη ΥΓΡΑΕΡΙΟΥ"));
  assert.equal(prohibitedHit(DATA.PROHIBITED, "ανταλλακτικά αυτοκινήτου"), null);
});
