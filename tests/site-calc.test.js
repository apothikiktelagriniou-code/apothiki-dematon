// Έλεγχοι για τον υπολογισμό της ιστοσελίδας (site/src/calc.mjs): στήλη τιμοκαταλόγου και μέρες προορισμού.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "../site/src/data.mjs";
import { tariffKey, destDays, quote } from "../site/src/calc.mjs";

const SITE = { ...D };
const SCHED = [{ dest: "ΑΘΗΝΑ", time: "08:00", days: "1111111" }, { dest: "ΚΑΛΑΜΑΤΑ", time: "09:00", days: "1111100" }];

test("tariffKey: απευθείας → η στήλη του προορισμού", () => {
  assert.equal(tariffKey(SITE, { type: "direct", tariff: "patra" }), "patra");
});
test("tariffKey: ανταπόκριση χωρίς δική της στήλη → του σταθμού", () => {
  assert.equal(tariffKey(SITE, { type: "transfer", hub: "korinthos", tariff: null }), "athina");
});
test("tariffKey: ανταπόκριση με δική της στήλη → η δική της", () => {
  assert.equal(tariffKey(SITE, { type: "transfer", hub: "korinthos", tariff: "patra" }), "patra");
});
test("quote: ανταπόκριση με δική της στήλη χρεώνει από αυτή", () => {
  const dests = [{ name: "Τρίπολη", type: "transfer", hub: "korinthos", tariff: "patra" }];
  const q = quote({ ...SITE, DESTINATIONS: dests }, { dest: "Τρίπολη", catId: "fakelos" });
  assert.equal(q.base, D.TARIFFS.patra.p.fakelos);
});
test("destDays: από τα δρομολόγια", () => {
  assert.equal(destDays(SITE, SCHED, { type: "direct", sched: ["ΚΑΛΑΜΑΤΑ"] }), "Δευτέρα – Παρασκευή");
});
test("destDays: οι μέρες με το χέρι υπερισχύουν", () => {
  assert.equal(destDays(SITE, SCHED, { type: "direct", sched: ["ΑΘΗΝΑ"], days: "0000101" }), "Παρ, Κυρ");
});
test("destDays: ανταπόκριση → μέρες του σταθμού, εκτός αν viaHub:false", () => {
  const d = { type: "transfer", hub: "korinthos" };
  assert.equal(destDays(SITE, SCHED, d), "Καθημερινά");
  assert.equal(destDays(SITE, SCHED, d, "el", { viaHub: false }), "");
});
