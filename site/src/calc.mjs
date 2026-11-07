// Λογική υπολογιστή κόστους, αναχωρήσεων και φύλαξης. Καθαρές συναρτήσεις: τρέχουν και στον browser και σε node --test.
// Ο build αφαιρεί τα `export` και τα βάζει σε assets/app.js μαζί με τα δεδομένα (global SITE).

export const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ς/g, "σ");

const BOX_IDS = ["fakelos", "mikro", "mesaio", "megalo"];

// Βρίσκει κατηγορία από διαστάσεις (εκ.) και βάρος (kg). Κρατά τη μεγαλύτερη από «κατά διαστάσεις» και «κατά βάρος».
// fromId: από ποια κατηγορία ξεκινά (ο φάκελος μετράει μόνο αν ο πελάτης διάλεξε φάκελο).
export function classifyBox(cats, dims, kg, fromId = "mikro") {
  const list = cats.filter(c => BOX_IDS.includes(c.id));
  const start = Math.max(0, list.findIndex(c => c.id === fromId));
  const d = (dims || []).map(Number).filter(n => n > 0).sort((a, b) => b - a);
  const w = Number(kg) || 0;
  let byDims = -1, byKg = -1;
  if (d.length === 3) byDims = list.findIndex((c, i) => i >= start && d[0] <= c.box.L && d[1] <= c.box.W && d[2] <= c.box.H);
  else byDims = start;
  byKg = w > 0 ? list.findIndex((c, i) => i >= start && w <= c.kg) : start;
  if (byDims < 0 || byKg < 0) return { id: null, oversize: true, by: byDims < 0 ? "dims" : "kg" };
  const i = Math.max(byDims, byKg);
  return { id: list[i].id, oversize: false, by: byKg > byDims ? "kg" : byDims > byKg ? "dims" : "both" };
}

export function findDest(dests, name) {
  const n = norm(name).trim();
  return dests.find(x => norm(x.name) === n) || null;
}

// Ενδεικτική τιμή. Επιστρέφει { status, perPiece, total, ... }
// status: ok | transfer | ask | none | noprice | oversize
export function quote(site, { dest, catId, pieces = 1, kg = 0 }) {
  const d = typeof dest === "string" ? findDest(site.DESTINATIONS, dest) : dest;
  const n = Math.max(1, Math.min(99, Math.floor(Number(pieces) || 1)));
  if (!d) return { status: "ask" };
  if (d.type === "none") return { status: "none", dest: d };
  if (d.type === "ask") return { status: "ask", dest: d };
  const hub = d.type === "transfer" ? site.HUBS[d.hub] : null;
  const t = site.TARIFFS[hub ? hub.tariff : d.tariff];
  const p = t && t.p[catId];
  if (p == null) return { status: "noprice", dest: d };
  const ow = site.OVERWEIGHT, w = Number(kg) || 0;
  const extra = ow && ow.enabled && w > ow.fromKg ? Math.round((w - ow.fromKg) * ow.perKg * 100) / 100 : 0;
  const per = Math.round((p + extra) * 100) / 100;
  const out = { status: hub ? "transfer" : "ok", dest: d, hub, base: p, extra, perPiece: per, pieces: n, total: Math.round(per * n * 100) / 100, eta: (hub && !d.eta) ? hub.eta : d.eta };
  if (hub) { out.otherEstimate = p * n; out.grandEstimate = p * n * 2; }
  return out;
}

// Τρέχουσα ημέρα (0 = Δευτέρα) και λεπτά, ώρα Ελλάδας.
export function athensNow(date = new Date()) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(f.formatToParts(date).map(p => [p.type, p.value]));
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  return { dow, minutes: Number(parts.hour) * 60 + Number(parts.minute), ymd: `${parts.year}-${parts.month}-${parts.day}` };
}

const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const DAYS = ["Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"];

// Επόμενες αναχωρήσεις από Αγρίνιο για τα κλειδιά προορισμού. days: '1111100' = Δευ..Κυρ.
export function nextDepartures(schedule, keys, now, count = 3) {
  const rows = schedule.filter(r => keys.includes(r.dest));
  const out = [], seen = new Set();
  for (let k = 0; k < 8 && out.length < count; k++) {
    const dow = (now.dow + k) % 7;
    const today = rows.filter(r => r.days[dow] === "1" && (k > 0 || toMin(r.time) > now.minutes))
      .sort((a, b) => toMin(a.time) - toMin(b.time));
    for (const r of today) {
      const key = k + r.time;
      if (seen.has(key)) continue; seen.add(key);
      out.push({ time: r.time, day: k === 0 ? "Σήμερα" : k === 1 ? "Αύριο" : DAYS[dow], express: !!r.express, conn: !!r.conn, notes: r.notes || "" });
      if (out.length >= count) break;
    }
  }
  return out;
}

// Ημέρες που φεύγει λεωφορείο (για την καρτέλα προορισμού): «Καθημερινά», «Δευ–Παρ», «Παρ, Κυρ» κ.λπ.
export function daysLabel(schedule, keys) {
  const mask = [0, 1, 2, 3, 4, 5, 6].map(i => schedule.some(r => keys.includes(r.dest) && r.days[i] === "1"));
  if (mask.every(Boolean)) return "Καθημερινά";
  const S = ["Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ", "Κυρ"];
  if (mask.slice(0, 5).every(Boolean) && !mask[5] && !mask[6]) return "Δευτέρα – Παρασκευή";
  const on = S.filter((_, i) => mask[i]);
  return on.length ? on.join(", ") : "";
}

// Φύλαξη: δωρεάν έως και την ημέρα άφιξη + freeDays, μετά perDay ανά ημέρα, μέχρι cap.
export function storageFee(storage, arrivedYmd, todayYmd) {
  const day = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
  const since = Math.max(0, day(todayYmd) - day(arrivedYmd));
  const charged = Math.max(0, since - storage.freeDays);
  const free = new Date((day(arrivedYmd) + storage.freeDays) * 864e5);
  const freeUntil = `${String(free.getUTCDate()).padStart(2, "0")}/${String(free.getUTCMonth() + 1).padStart(2, "0")}`;
  return { since, charged, fee: Math.min(storage.cap, charged * storage.perDay), freeUntil };
}

export function prohibitedHit(words, text) {
  const t = norm(text);
  return words.find(w => t.includes(norm(w))) || null;
}
