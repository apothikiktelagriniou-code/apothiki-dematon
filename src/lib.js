// Καθαρές συναρτήσεις (χωρίς DOM/δίκτυο) — ελέγχονται με tests/lib.test.js

export const HOME = "ΑΓΡΙΝΙΟ";

/** Κεφαλαία, χωρίς τόνους, ένα κενό. */
export function norm(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();
}

/** Ράφι = πρώτο γράμμα του επωνύμου (πρώτη λέξη). Λατινικά → ελληνικά. */
export function shelfFor(name) {
  const w = norm(name).replace(/^[^A-ZΑ-Ω]+/, "").split(/[\s,.-]+/)[0] || "";
  if (!w) return "";
  const c = w[0];
  if (/[Α-Ω]/.test(c)) return c === "Ϊ" ? "Ι" : c === "Ϋ" ? "Υ" : c;
  const di = { TH: "Θ", CH: "Χ", PS: "Ψ", KS: "Ξ", PH: "Φ" };
  if (di[w.slice(0, 2)]) return di[w.slice(0, 2)];
  const one = { A: "Α", B: "Β", V: "Β", G: "Γ", D: "Δ", E: "Ε", Z: "Ζ", H: "Χ", I: "Ι", J: "Τ", K: "Κ", C: "Κ", Q: "Κ",
    L: "Λ", M: "Μ", N: "Ν", O: "Ο", P: "Π", R: "Ρ", S: "Σ", T: "Τ", Y: "Υ", U: "Ο", F: "Φ", X: "Χ", W: "Ο" };
  return one[c] || "";
}

/** Κινητό/σταθερό 10 ψηφίων. Επιστρέφει "" αν δεν είναι έγκυρο. */
export function cleanPhone(s) {
  let d = String(s ?? "").replace(/\D/g, "");
  d = d.replace(/^0030(?=\d{10}$)/, "").replace(/^30(?=\d{10}$)/, "");
  return /^(69\d{8}|2\d{9})$/.test(d) ? d : "";
}
export const isPhone = s => !!cleanPhone(s);
export const fmtPhone = p => (p && p.length === 10 ? p.slice(0, 3) + " " + p.slice(3, 6) + " " + p.slice(6) : p || "");

/** "31/10/2026 17:00" ή "31/10/2026" → Date (τοπική ώρα) ή null. */
export function parseGrDate(s) {
  const t = String(s ?? "");
  const d = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!d) return null;
  const m = t.match(/(\d{1,2}):(\d{2})(?!.*\d{1,2}:\d{2})/);
  const dt = new Date(+d[3], +d[2] - 1, +d[1], m ? +m[1] : 0, m ? +m[2] : 0);
  return isNaN(dt) ? null : dt;
}
const p2 = n => String(n).padStart(2, "0");
/** Date/ISO → "31/10/2026 17:00" */
export function fmtGr(v, withTime = true) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return "";
  const s = p2(d.getDate()) + "/" + p2(d.getMonth() + 1) + "/" + d.getFullYear();
  return withTime ? s + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()) : s;
}
/** Date → value για <input type=datetime-local> */
export function toLocalInput(v) {
  const d = v ? new Date(v) : new Date();
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + "T" + p2(d.getHours()) + ":" + p2(d.getMinutes());
}
export const money = n => (n == null || n === "" ? "" : Number(n).toFixed(2).replace(".", ",") + " €");
export function hoursSince(iso) { return iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : 0; }
export function daysSince(iso) { return Math.floor(hoursSince(iso) / 24); }

/** Κλειδί δρομολογίου άφιξης / αποστολής. */
function minuteKey(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
}
export function tripsOf(p) {
  const a = [p.departure_at ? (p.origin_city || "?") + "|" + minuteKey(p.departure_at) : "__none"];
  if (p.fwd_departure_at) a.push(">" + (p.fwd_destination || p.destination_city || "?") + "|" + minuteKey(p.fwd_departure_at));
  return a;
}
export function tripLabel(t) {
  if (t === "__none") return "Χωρίς δρομολόγιο";
  const [c, k] = t.split("|");
  const [d, hm] = k.split(" ");
  const [y, mo, da] = d.split("-");
  return (c[0] === ">" ? "Αποστολή ΑΓΡΙΝΙΟ → " + c.slice(1) : c) + " · " + da + "/" + mo + "/" + y + " " + hm;
}
export function sortTrips(keys) {
  return keys.sort((a, b) => a === "__none" ? 1 : b === "__none" ? -1 :
    b.split("|")[1].localeCompare(a.split("|")[1]) || a.localeCompare(b));
}

export const CLOSED = ["done", "forwarded", "returned"];
export const isClosed = p => CLOSED.includes(p.status);
export const isTransit = p => !!p.destination_city && norm(p.destination_city) !== HOME;

/** Ανάγνωση κειμένου ετικέτας ΚΤΕΛ (από σάρωση/επικόλληση). */
export function parseLabel(raw) {
  const t = norm(raw).replace(/\r/g, "");
  const lines = String(raw ?? "").split(/\n/).map(norm).filter(Boolean);
  const o = {};
  const after = re => {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (m) { const v = (m[1] || "").trim(); if (v) return v; const nx = lines[i + 1] || ""; return nx && !/:/.test(nx) ? nx : ""; }
    }
    return "";
  };
  const rc = t.match(/\b(\d{3}\s?-\s?\d{3}\s?-\s?\d{4,7})\b/); if (rc) o.receipt_no = rc[1].replace(/\s/g, "");
  const lat = { Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X" };
  const cd = t.match(/ΚΩΔ\.?\s*ΔΕΜΑΤΟΣ\s*:?\s*([A-ZΑ-Ω0-9]{5,12})/); if (cd) o.parcel_code = cd[1].replace(/[Α-Ω]/g, c => lat[c] || c);
  const fr = t.match(/ΚΟΜΙΣΤΡΟ\s*:?\s*(\d+(?:[.,]\d+)?)/); if (fr) o.fare_eur = Number(fr[1].replace(",", "."));
  if (/ΑΣΥΝΟΔΕΥΤ/.test(t)) o.kind = "Ασυνόδευτο"; else if (/ΣΥΝΟΔΕΥΤΙΚ|ΑΠΟΣΚΕΥ/.test(t)) o.kind = "Συνοδευτικό";
  const it = after(/^ΕΙΔΟΣ\s*:?\s*(.*)$/); if (it) o.item = it === "ΑΠΛΟ ΔΕΜΑ" ? "Απλό δέμα" : it.charAt(0) + it.slice(1).toLowerCase();
  const is = t.match(/ΕΚΔΟΣΗΣ[^\d]*(\d{1,2}\/\d{1,2}\/\d{4})(?:[^\d\n]*(\d{1,2}:\d{2}))?/); if (is) o.issued = is[1] + (is[2] ? " " + is[2] : "");
  const dp = t.match(/ΑΝΑΧΩΡΗΣΗΣ[^\d]*(\d{1,2}\/\d{1,2}\/\d{4})(?:[^\d\n]*(\d{1,2}:\d{2}))?/); if (dp) o.departure = dp[1] + (dp[2] ? " " + dp[2] : "");
  const rp = after(/^ΠΑΡΑΛΗΠΤΗΣ\s*:?\s*(.*)$/); if (rp && !/^(ΤΗΛ|ΑΠΟ)/.test(rp)) o.recipient_name = rp;
  const sn = after(/^ΑΠΟΣΤΟΛΕΑΣ\s*:?\s*(.*)$/); if (sn && !/^(ΠΑΡΑΛΗΠΤΗΣ|ΤΗΛ)/.test(sn)) o.sender_name = sn;
  const ph = t.match(/ΤΗΛ\.?\s*:?\s*((?:\+?30)?[\s\d]{10,14})/); if (ph) { const c = cleanPhone(ph[1]); if (c) o.recipient_phone = c; }
  const fm = after(/^ΑΠΟ\s*-?\s*FROM\s*:?\s*(.*)$/); if (fm) o.origin_city = fm;
  const to = after(/^ΠΡΟΣ\s*-?\s*(?:ΤΟ|TO)\s*:?\s*(.*)$/); if (to) o.destination_city = to;
  return o;
}

/** Αριθμός εγγράφου: κεφαλαία, χωρίς κενά, ελληνικά γράμματα που μοιάζουν → λατινικά (ΑΚ123456 = AK123456). */
export function cleanIdDoc(s) {
  const m = { Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X" };
  return norm(s).replace(/[^A-Z0-9Α-Ω]/g, "").replace(/[ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]/g, c => m[c]);
}

/** Κείμενο ειδοποίησης από πρότυπο. */
export function fillTemplate(tpl, p) {
  return String(tpl)
    .replace("{αρ}", p.receipt_no ? " (αρ. " + p.receipt_no + ")" : "")
    .replace("{από}", p.origin_city ? "από " + p.origin_city : "")
    .replace("{κωδικός}", p.pickup_code ? "Κωδικός παραλαβής: " + p.pickup_code : "")
    .replace("{κωδ}", p.pickup_code || "")
    .replace(/ +\n/g, "\n").replace(/ {2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** CSV για Excel (ελληνικό): ; διαχωριστικό, BOM. */
export function toCSV(rows, cols) {
  const esc = v => { v = v == null ? "" : String(v); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return "﻿" + [cols.map(c => esc(c[1])).join(";"), ...rows.map(r => cols.map(c => esc(c[2] ? c[2](r) : r[c[0]])).join(";"))].join("\r\n");
}

/**
 * Κανόνας αυτόματης καταχώρησης (§6.3 προδιαγραφής).
 * d = καθαρισμένο αποτέλεσμα AI. exists(receipt_no) → boolean.
 * Επιστρέφει { auto: boolean, problems: string[] }.
 */
export function autoSaveDecision(d, exists, maxFare = 40) {
  const p = [];
  if (!/^\d{3}-\d{3}-\d{4,7}$/.test(d.receipt_no || "")) p.push("missing_receipt_no");
  else if (exists(d.receipt_no)) p.push("duplicate");
  if (!String(d.recipient || "").trim()) p.push("missing_recipient");
  if (!d.origin_city) p.push("missing_origin");
  if (d.fare_eur == null || d.fare_eur === "") p.push("missing_fare");
  else if (!(Number(d.fare_eur) > 0 && Number(d.fare_eur) <= maxFare)) p.push("fare_out_of_range");
  if (!parseGrDate(d.departure)) p.push("missing_departure");
  if (d.phone && !cleanPhone(d.phone)) p.push("invalid_phone");
  for (const u of d.unsure || []) p.push("unsure:" + u);
  if (d.is_handwritten_receipt) p.push("handwritten_receipt");
  return { auto: p.length === 0, problems: p };
}
export const PROBLEM_TEXT = {
  missing_receipt_no: "Δεν διαβάστηκε αριθμός απόδειξης", duplicate: "Υπάρχει ήδη στη βάση", missing_recipient: "Λείπει παραλήπτης",
  missing_origin: "Λείπει πόλη", missing_fare: "Λείπει κόμιστρο", fare_out_of_range: "Περίεργο κόμιστρο", missing_departure: "Λείπει ώρα αναχώρησης",
  invalid_phone: "Λάθος μορφή τηλεφώνου", handwritten_receipt: "Χειρόγραφη απόδειξη", pair_mismatch: "Η φωτογραφία δέματος δεν ταιριάζει με την ετικέτα", ai_unavailable: "Δεν διαβάστηκε αυτόματα",
};
export const problemText = k => k.startsWith("unsure:") ? "Αβέβαιο: " + ({ receipt_no: "αριθμός απόδειξης", phone: "τηλέφωνο", fare_eur: "κόμιστρο", recipient: "παραλήπτης", departure: "αναχώρηση", origin_city: "πόλη", parcel_code: "κωδικός" }[k.slice(7)] || k.slice(7)) : (PROBLEM_TEXT[k] || k);

/** Αποτέλεσμα AI → εγγραφή parcels. */
/** Χειρόγραφη απόδειξη: κόκκινος αριθμός (π.χ. 3401) + αριθμός μπλοκ (33950048) → «3401 (33950048)», μοναδικό και ψάχνεται με το 3401. */
export function handwrittenReceipt(d) {
  const red = String(d.receipt_no || "").replace(/\D/g, ""), blk = String(d.parcel_code || "").replace(/\D/g, "");
  if (d.is_handwritten_receipt && red.length >= 2 && red.length <= 6 && blk.length >= 6) return red + " (" + blk + ")";
  return d.receipt_no || null;
}
export function extractedToParcel(d) {
  const dest = norm(d.destination_city) || HOME;
  const phone = cleanPhone(d.phone);
  return {
    receipt_no: handwrittenReceipt(d), parcel_code: d.parcel_code || null, kind: "Ασυνόδευτο" /* το «ΣΥΝΟΔΕΥΤΙΚΟ» της ετικέτας αφορά το χαρτί, όχι το δέμα */, item: d.item || null,
    origin_city: norm(d.origin_city) || null, destination_city: dest,
    issued_at: parseGrDate(d.issued)?.toISOString() || null, departure_at: parseGrDate(d.departure)?.toISOString() || null,
    fare_eur: d.fare_eur == null || d.fare_eur === "" ? null : Number(d.fare_eur),
    sender_name: d.sender || null, recipient_name: String(d.recipient || "").trim(),
    recipient_phone: phone || null, phone_source: phone ? (d.phone_is_handwritten ? "handwritten" : "label") : null,
    phone_confirmed: !!phone && !d.phone_is_handwritten,
    shelf: dest === HOME ? (shelfFor(d.recipient) || null) : null,
    status: dest === HOME ? "arrived" : "transit",
    damaged: !!d.damage_visible, notes: shortNote(d.notes), package_desc: String(d.package_desc || "").trim() || null,
    pieces_total: Math.max(1, Number(d.pieces) || 1), pieces_in: 1,
  };
}

/**
 * Σύγκριση κατάστασης πρακτορείου με τα καταχωρημένα δέματα.
 * items: γραμμές κατάστασης. parcels: υποψήφια δέματα (π.χ. ίδιας πόλης, τελευταίες μέρες).
 * Ταίριασμα: 1) αριθμός απόδειξης (σίγουρο) 2) επώνυμο + πόλη (πιθανό, μόνο αν μοναδικό).
 * extra: δέματα του ίδιου δρομολογίου που δεν υπάρχουν στην κατάσταση.
 */
/** Ίδιος αριθμός απόδειξης/φορτωτικής; Η κατάσταση γράφει «2-255-349-11663», η ετικέτα «255-349-11663». */
export function sameReceipt(a, b) {
  const x = String(a || "").replace(/\D/g, ""), y = String(b || "").replace(/\D/g, "");
  if (x.length < 8 || y.length < 8) return false;
  if (x === y) return true;
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  return s.length >= 10 && l.length - s.length <= 2 && l.endsWith(s);
}
/** «ΣΤΑΘΜΟΣ ΑΓΡΙΝΙΟΥ» → ΑΓΡΙΝΙΟ, «ΚΤΕΛ ΝΑΥΠΑΚΤΟΥ» → ΝΑΥΠΑΚΤΟΣ, «ΘΕΣΣΑΛΟΝΙΚΗ_ΣΤΑΘΜΟΣ» → ΘΕΣΣΑΛΟΝΙΚΗ */
export function cityFromStation(s) {
  const stop = new Set(["ΚΤΕΛ", "ΣΤΑΘΜΟΣ", "ΣΤΑΘΜΟΥ", "ΠΡΑΚΤΟΡΕΙΟ", "ΠΡΑΚΤΟΡΕΙΟΥ"]);
  const t = norm(String(s || "").replace(/_/g, " ")).split(" ").filter(w => w && !stop.has(w)).join(" ");
  const known = ["ΑΓΡΙΝΙΟ", "ΑΘΗΝΑ", "ΘΕΣΣΑΛΟΝΙΚΗ", "ΠΑΤΡΑ", "ΙΩΑΝΝΙΝΑ", "ΠΡΕΒΕΖΑ", "ΑΡΤΑ", "ΛΕΥΚΑΔΑ", "ΜΕΣΟΛΟΓΓΙ", "ΝΑΥΠΑΚΤΟΣ", "ΑΜΦΙΛΟΧΙΑ", "ΑΙΤΩΛΙΚΟ", "ΒΟΝΙΤΣΑ", "ΑΣΤΑΚΟΣ", "ΘΕΡΜΟ", "ΛΑΜΙΑ", "ΛΑΡΙΣΑ", "ΒΟΛΟΣ", "ΚΟΖΑΝΗ"];
  const k = known.find(c => t === c || t.startsWith(c.slice(0, Math.max(4, c.length - 2))));
  return k || t;
}

export function reconcile(items, parcels, trip = null, namePool = null) {
  const used = new Set(), found = [], missing = [];
  const digits = s => String(s || "").replace(/\D/g, "");
  const surname = s => norm(s).split(" ")[0] || "";
  for (const it of items) {
    let p = null, how = "";
    const rd = digits(it.receipt_no);
    if (rd.length >= 8) { p = parcels.find(x => !used.has(x.id) && sameReceipt(x.receipt_no, it.receipt_no)); if (p) how = "receipt"; }
    if (!p && rd.length >= 10) { p = parcels.find(x => !used.has(x.id) && likelySameParcel(x, it) === "near"); if (p) how = "receipt~"; }
    if (!p && surname(it.recipient)) {
      const c = (namePool || parcels).filter(x => !used.has(x.id) && surname(x.recipient_name) === surname(it.recipient) && (!trip || !trip.origin || x.origin_city === trip.origin));
      const full = c.filter(x => norm(x.recipient_name) === norm(it.recipient));
      const pick = full.length === 1 ? full : c;
      if (pick.length === 1) { p = pick[0]; how = "name"; }
    }
    if (p) { used.add(p.id); found.push({ item: it, parcel: p, how }); } else missing.push(it);
  }
  const extra = trip && trip.key ? parcels.filter(x => !used.has(x.id) && tripsOf(x)[0] === trip.key) : [];
  return { found, missing, extra };
}

/** Σύντομη σημείωση AI: πρώτη πρόταση, έως 90 χαρακτήρες· περιγραφές εντύπου πετιούνται. */
export function shortNote(s) {
  let t = String(s || "").replace(/\s+/g, " ").trim(); if (!t) return null;
  t = t.split(/(?<=[.;!])\s+/)[0].replace(/[.;]$/, "");
  if (/^(Χειρόγραφη|Τυπωμένη|Θερμική|Εκτυπωμένη) (απόδειξη|ετικέτα)/i.test(t) && !/αμφιβολ|δυσανάγν|ασαφ|λείπ|δεν (φαίν|διαβ)|ζημι|σκισ|βρεγ/i.test(t)) return null;
  return t.length > 90 ? t.slice(0, 87).replace(/\s\S*$/, "") + "…" : t;
}

/** Απόσταση Levenshtein (μικρά strings). */
function lev(a, b) {
  const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
const surnameOf = s => norm(s).split(" ")[0] || "";
/** Αριθμοί απόδειξης που διαφέρουν το πολύ ένα ψηφίο (λάθος ανάγνωσης). Μόνο μαζί με ίδιο επώνυμο! */
export function nearReceipt(a, b) {
  const x = String(a || "").replace(/\D/g, ""), y = String(b || "").replace(/\D/g, "");
  if (x.length < 10 || y.length < 10) return false;
  return sameReceipt(a, b) || lev(x.slice(-11), y.slice(-11)) <= 1;
}
/** Το ίδιο δέμα; ίδιος αριθμός, ή σχεδόν ίδιος αριθμός + ίδιο επώνυμο. */
export function likelySameParcel(a, b) {
  if (sameReceipt(a.receipt_no, b.receipt_no)) return "receipt";
  const sa = surnameOf(a.recipient_name || a.recipient), sb = surnameOf(b.recipient_name || b.recipient);
  if (sa && sa.length >= 3 && sa === sb && nearReceipt(a.receipt_no, b.receipt_no)) return "near";
  return "";
}
/** Ίδιο επώνυμο + ίδια πόλη + ίδια μέρα αναχώρησης (για προτάσεις, όχι αυτόματα). */
export function sameNameTrip(a, b) {
  const sa = surnameOf(a.recipient_name), sb = surnameOf(b.recipient_name);
  if (!sa || sa.length < 3 || sa !== sb || !a.origin_city || a.origin_city !== b.origin_city || !a.departure_at || !b.departure_at) return false;
  return new Date(a.departure_at).toDateString() === new Date(b.departure_at).toDateString();
}
