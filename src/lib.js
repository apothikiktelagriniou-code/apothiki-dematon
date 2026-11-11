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
/** Όλες οι γραμμές ενός ερωτήματος σε σελίδες των 1000 — το Supabase δίνει έως 1000 γραμμές τη φορά («Max rows»).
 *  make() φτιάχνει ΝΕΟ query κάθε φορά (με σταθερή ταξινόμηση, π.χ. .order("id")). */
export async function fetchAll(make, max = 20000) {
  const out = [];
  for (let i = 0; i < max; i += 1000) {
    const { data, error } = await make().range(i, Math.min(i + 999, max - 1));
    if (error) return { data: out.length ? out : null, error };
    out.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return { data: out, error: null };
}
/** Αυτόματο κινητό από το αρχείο πελατών — ΜΟΝΟ αν ο πελάτης έχει ΕΝΑ κινητό και
 *  (είναι ⭐ τακτικός ή το όνομα στο δέμα έχει και μικρό όνομα, όχι μόνο επώνυμο).
 *  Αλλιώς επιστρέφει "" και η εφαρμογή ρωτά «ποιος είναι;». */
export function safeAutoPhone(c, name) {
  const ph = (c && c.phones) || [], mob = ph.filter(p => /^69/.test(p));
  // ένα κινητό (ο σταθερός δεν μετράει)· αν δεν έχει κινητό, ένα μόνο σταθερό
  const pick = mob.length === 1 ? mob[0] : !mob.length && ph.length === 1 ? ph[0] : "";
  return pick && (c.starred || norm(name).split(" ").filter(Boolean).length >= 2) ? pick : "";
}
/** «Ανακατεμένος» πελάτης: πάνω από ένα κινητό στο ίδιο όνομα — μπορεί να είναι διαφορετικοί άνθρωποι. */
export function mixedCustomer(c) { return ((c && c.phones) || []).filter(p => /^69/.test(p)).length > 1; }
/** Νέο δέμα με κινητό `phone` για τον πελάτη `c`: ταιριάζει; (διαφορετικό κινητό = διαφορετικός άνθρωπος) */
export function phoneFits(c, phone, name) {
  const ph = (c && c.phones) || [];
  if (phone) return !ph.length || ph.includes(phone);
  return !ph.length || !!safeAutoPhone(c, name);
}

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
/** SMS σε ελληνικά ΚΕΦΑΛΑΙΑ χωρίς τόνους, ώστε να χωράει σε 1 SMS (160 χαρακτήρες GSM αντί 70 Unicode).
 *  Τα γράμματα που μοιάζουν με λατινικά (Α Β Ε Ζ Η Ι Κ Μ Ν Ο Ρ Τ Υ Χ) γράφονται με λατινικά· τα Γ Δ Θ Λ Ξ Π Σ Φ Ψ Ω υπάρχουν στο GSM. */
const GSM_MAP = { "Α":"A","Β":"B","Ε":"E","Ζ":"Z","Η":"H","Ι":"I","Κ":"K","Μ":"M","Ν":"N","Ο":"O","Ρ":"P","Τ":"T","Υ":"Y","Χ":"X" };
const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";
export function gsmGreek(text) {
  const up = String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[‘’´`]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, "-");
  let out = "";
  for (const ch of up) { const c = GSM_MAP[ch] || ch; if (GSM_BASIC.includes(c) || GSM_EXT.includes(c)) out += c; }
  return out.replace(/ {2,}/g, " ").trim();
}
/** Πόσα «κουτάκια» GSM πιάνει (τα € [ ] κ.λπ. μετράνε 2). */
export function smsLen(text) { let n = 0; for (const ch of String(text)) n += GSM_EXT.includes(ch) ? 2 : 1; return n; }
export const SMS_TEMPLATE = "{χαιρ} ΣΑΣ! ΤΟ ΔΕΜΑ ΣΑΣ ΗΡΘΕ ΣΤΟ ΣΤΑΘΜΟ ΚΤΕΛ ΑΓΡΙΝΙΟΥ. ΚΩΔ. ΠΑΡΑΛΑΒΗΣ {κωδ}. ΩΡΑΡΙΟ ΔΕΥ-ΠΑΡ 06:30-21:30, ΣΚ 08:00-21:30. ΤΗΛ. 2641024446";
const SMS_SHORT = "{χαιρ} ΣΑΣ! ΤΟ ΔΕΜΑ ΣΑΣ ΗΡΘΕ ΣΤΟ ΣΤΑΘΜΟ ΚΤΕΛ ΑΓΡΙΝΙΟΥ. ΚΩΔ. ΠΑΡΑΛΑΒΗΣ {κωδ}. ΤΗΛ. 2641024446";
/** Καλημέρα έως τις 12:00, μετά καλησπέρα. */
export const greeting = (d = new Date()) => d.getHours() < 12 ? "ΚΑΛΗΜΕΡΑ" : "ΚΑΛΗΣΠΕΡΑ";
/** Τελικό κείμενο SMS: πάντα 1 SMS. Αν δεν χωράει, πέφτει στη σύντομη μορφή και μετά κόβει τον αριθμό απόδειξης. */
export function smsFor(tpl, p, now = new Date()) {
  const fix = t => (p.pickup_code ? t : t.replace(/ ?ΚΩΔ\.( ΠΑΡΑΛΑΒΗΣ)? \{κωδ\}\./, "")).replace("{χαιρ}", greeting(now));
  for (const t of [fix(tpl || SMS_TEMPLATE), fix(SMS_SHORT)]) { const s = gsmGreek(fillTemplate(t, p)); if (smsLen(s) <= 160) return s; }
  return gsmGreek(fillTemplate(fix(SMS_SHORT).replace("{αρ}", ""), p)).slice(0, 160);
}
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
  // Κελιά που ξεκινούν με = + - @ (ή tab/CR) τα «εξουδετερώνουμε» με ' ώστε το Excel να μην τα τρέξει ως τύπο.
  const esc = v => { v = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+([.,]\d+)?$/.test(v)) v = "'" + v; return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return "﻿" + [cols.map(c => esc(c[1])).join(";"), ...rows.map(r => cols.map(c => esc(c[2] ? c[2](r) : r[c[0]])).join(";"))].join("\r\n");
}

/**
 * Κανόνας αυτόματης καταχώρησης (§6.3 προδιαγραφής).
 * d = καθαρισμένο αποτέλεσμα AI. exists(receipt_no) → boolean.
 * Επιστρέφει { auto: boolean, problems: string[] }.
 */
export function autoSaveDecision(d, exists, maxFare = 40) {
  const p = [], flags = [];
  const hw = d.is_handwritten_receipt && /^\d{2,6}$/.test(String(d.receipt_no || "").replace(/\D/g, "")) && String(d.parcel_code || "").replace(/\D/g, "").length >= 6;
  if (hw) { const rn = handwrittenReceipt(d); if (exists(rn)) p.push("duplicate"); }
  else // ΚΤΕΛ Αιτωλ/νίας: 258-341-23682 · άλλα ΚΤΕΛ (π.χ. Ιωαννίνων): σκέτος αριθμός 8–12 ψηφίων (202682615)
  if (!/^\d{3}-\d{3}-\d{4,7}$/.test(d.receipt_no || "") && !/^\d{8,12}$/.test(d.receipt_no || "")) p.push("missing_receipt_no");
  else if (exists(d.receipt_no)) p.push("duplicate");
  if (!String(d.recipient || "").trim()) p.push("missing_recipient");
  if (!d.origin_city) p.push("missing_origin");
  if (d.fare_eur == null || d.fare_eur === "") p.push("missing_fare");
  else if (!(Number(d.fare_eur) > 0 && Number(d.fare_eur) <= maxFare)) p.push("fare_out_of_range");
  if (!parseGrDate(d.departure) && !(hw && parseGrDate(d.issued))) p.push("missing_departure"); // η χειρόγραφη δεν έχει ώρα — φτάνει η ημερομηνία
  if (d.phone && !cleanPhone(d.phone)) p.push("invalid_phone");
  // Αβέβαιη ανάγνωση: έλεγχο ζητάμε ΜΟΝΟ για παραλήπτη/προορισμό (λάθος ράφι ή λάθος προώθηση).
  // Αριθμός απόδειξης, τηλέφωνο, κόμιστρο, πόλη → καταχωρείται και μπαίνει σημείωση «⚠ έλεγξε» στην κάρτα. Τα υπόλοιπα αγνοούνται.
  for (const u0 of d.unsure || []) {
    const u = String(u0).trim();
    if (u === "recipient" || u === "destination_city") p.push("unsure:" + u);
    else if (UNSURE_FLAG[u]) flags.push(u);
  }
  if (d.is_handwritten_receipt && !hw) p.push("handwritten_receipt");
  return { auto: p.length === 0, problems: p, flags };
}
const UNSURE_FLAG = { receipt_no: "αριθμό απόδειξης", phone: "τηλέφωνο", fare_eur: "κόμιστρο", origin_city: "πόλη αποστολής", departure: "ώρα αναχώρησης" };
/** Σημείωση για την κάρτα: «⚠ Έλεγξε: αριθμό απόδειξης, κόμιστρο (αβέβαιη ανάγνωση)». */
export const unsureNote = flags => flags && flags.length ? "⚠ Έλεγξε: " + flags.map(f => UNSURE_FLAG[f]).join(", ") + " (αβέβαιη ανάγνωση)" : "";
export const PROBLEM_TEXT = {
  missing_receipt_no: "Δεν διαβάστηκε αριθμός απόδειξης", duplicate: "Υπάρχει ήδη στη βάση", missing_recipient: "Λείπει παραλήπτης",
  missing_origin: "Λείπει πόλη", missing_fare: "Λείπει κόμιστρο", fare_out_of_range: "Περίεργο κόμιστρο", missing_departure: "Λείπει ώρα αναχώρησης",
  invalid_phone: "Λάθος μορφή τηλεφώνου", confirm_customer: "Ποιος πελάτης είναι;", handwritten_receipt: "Χειρόγραφη απόδειξη", pair_mismatch: "Η φωτογραφία δέματος δεν ταιριάζει με την ετικέτα", ai_unavailable: "Δεν διαβάστηκε αυτόματα",
};
export const problemText = k => k.startsWith("unsure:") ? "Αβέβαιο: " + ({ receipt_no: "αριθμός απόδειξης", phone: "τηλέφωνο", fare_eur: "κόμιστρο", recipient: "παραλήπτης", departure: "αναχώρηση", origin_city: "πόλη", parcel_code: "κωδικός" }[k.slice(7)] || k.slice(7)) : (PROBLEM_TEXT[k] || k);

/** Αποτέλεσμα AI → εγγραφή parcels. */
/** Χειρόγραφη απόδειξη: κόκκινος αριθμός (π.χ. 3401) + αριθμός μπλοκ (33950048) → «3401 (33950048)», μοναδικό και ψάχνεται με το 3401. */
export function handwrittenReceipt(d) {
  const red = String(d.receipt_no || "").replace(/\D/g, ""), blk = String(d.parcel_code || "").replace(/\D/g, "");
  if (d.is_handwritten_receipt && red.length >= 2 && red.length <= 6 && blk.length >= 6) return red + " (" + blk + ")";
  return d.receipt_no || null;
}
/** Greeklish → ελληνικά κεφαλαία (για ονόματα). Ό,τι δεν συμπεραίνεται (Ο/Ω, Ι/Η/Υ) γράφεται με τον συνηθέστερο τρόπο. */
const GL_MULTI = [["OPOULOS","ΟΠΟΥΛΟΣ"],["OPOULOU","ΟΠΟΥΛΟΥ"],["IDIS","ΙΔΗΣ"],["AKIS","ΑΚΗΣ"],["TH","Θ"],["CH","Χ"],["KS","Ξ"],["PS","Ψ"],["OU","ΟΥ"],["OY","ΟΥ"],["MP","ΜΠ"],["NT","ΝΤ"],["GK","ΓΚ"],["GG","ΓΓ"],["TS","ΤΣ"],["TZ","ΤΖ"]];
const GL_ONE = { A:"Α",B:"Β",V:"Β",G:"Γ",D:"Δ",E:"Ε",Z:"Ζ",H:"Η",I:"Ι",K:"Κ",L:"Λ",M:"Μ",N:"Ν",X:"Χ",O:"Ο",P:"Π",R:"Ρ",S:"Σ",T:"Τ",Y:"Υ",F:"Φ",W:"Ω",C:"Κ",Q:"Κ",J:"ΤΖ",U:"ΟΥ" };
export function greeklishToGreek(s) {
  return String(s || "").toUpperCase().split(/(\s+|[.\-])/).map(w => {
    if (!/[A-Z]/.test(w)) return w;
    let out = "", i = 0;
    while (i < w.length) {
      const m = GL_MULTI.find(([l]) => w.startsWith(l, i));
      if (m) { out += m[1]; i += m[0].length; continue; }
      out += GL_ONE[w[i]] || w[i]; i++;
    }
    return out.replace(/ΙΣ$/, "ΗΣ").replace(/^ΑΒ(?=[ΓΔΘΚΞΠΣΤΦΧΨ])/, "ΑΥ").replace(/^ΕΒ(?=[ΓΔΘΚΞΠΣΤΦΧΨ])/, "ΕΥ"); // ΧΑΤΖΙΣ→ΧΑΤΖΗΣ, AVGERINOS→ΑΥΓΕΡΙΝΟΣ
  }).join("");
}
/** Είναι ελληνικό όνομα γραμμένο με λατινικά; (όχι ξένο όνομα/εταιρεία) */
export function isGreeklishName(s) {
  const t = String(s || "").toUpperCase().trim();
  if (!t || /[\u0370-\u03FF]/.test(t) || !/^[A-Z .\-']+$/.test(t)) return false;
  if (/\b(LTD|SA|AE|IKE|EPE|OE|EE|SHOP|STORE|MARKET|CAFE|HOTEL|COM|GR)\b/.test(t)) return false;
  return t.split(/[\s.\-]+/).some(w => /(OS|IS|AS|OU|ES|AKIS|IDIS|OPOULOS|OGLOU|IDOU|AKI|INA|IA|OULA|ITSA|IKI|ATOU|AKOU|POULOU)$/.test(w) && w.length >= 4);
}
/** Φωνητικό «σκελετό» για αναζήτηση: ίδιο για «CHATZIS», «XATZHS» και «ΧΑΤΖΗΣ». */
export function soundKey(s) {
  let g = norm(/[A-Za-z]/.test(String(s || "")) ? greeklishToGreek(norm(s)) : s);
  return g.replace(/ΟΥ/g, "U").replace(/ΕΙ|ΟΙ|ΥΙ|[ΗΙΥ]/g, "I").replace(/ΑΙ/g, "Ε").replace(/Ω/g, "Ο").replace(/Β/g, "Β").replace(/(.)\1/g, "$1").replace(/ς/g, "Σ");
}
/** Συχνά μικρά ονόματα (κεφαλαία χωρίς τόνους) — για να μπαίνει πρώτα το επώνυμο. */
const FIRST_NAMES = new Set(["ΑΓΓΕΛΙΚΗ","ΑΓΓΕΛΟΣ","ΑΓΗΣ","ΑΘΑΝΑΣΙΑ","ΑΘΑΝΑΣΙΟΣ","ΑΙΚΑΤΕΡΙΝΗ","ΑΛΕΞΑΝΔΡΑ","ΑΛΕΞΑΝΔΡΟΣ","ΑΛΕΞΗΣ","ΑΝΑΣΤΑΣΙΑ","ΑΝΑΣΤΑΣΙΟΣ","ΑΝΔΡΕΑΣ","ΑΝΔΡΟΝΙΚΟΣ","ΑΝΝΑ","ΑΝΤΩΝΗΣ","ΑΝΤΩΝΙΑ","ΑΝΤΩΝΙΟΣ","ΑΠΟΣΤΟΛΟΣ","ΑΡΓΥΡΗΣ","ΑΡΓΥΡΙΟΣ","ΑΡΓΥΡΩ","ΑΡΕΤΗ","ΑΡΗΣ","ΑΡΙΣΤΕΙΔΗΣ","ΑΣΗΜΙΝΑ","ΑΦΡΟΔΙΤΗ","ΑΧΙΛΛΕΑΣ","ΒΑΓΓΕΛΗΣ","ΒΑΣΙΛΕΙΟΣ","ΒΑΣΙΛΗΣ","ΒΑΣΙΛΙΚΗ","ΒΟΥΛΑ","ΓΑΡΥΦΑΛΛΙΑ","ΓΕΩΡΓΙΑ","ΓΕΩΡΓΙΟΣ","ΓΙΑΝΝΑ","ΓΙΑΝΝΗΣ","ΓΙΩΡΓΗΣ","ΓΙΩΡΓΟΣ","ΓΙΩΤΑ","ΓΡΗΓΟΡΗΣ","ΓΡΗΓΟΡΙΟΣ","ΔΑΝΑΗ","ΔΕΣΠΟΙΝΑ","ΔΗΜΗΤΡΑ","ΔΗΜΗΤΡΗΣ","ΔΗΜΗΤΡΙΟΣ","ΔΙΑΜΑΝΤΩ","ΔΙΟΝΥΣΗΣ","ΔΙΟΝΥΣΙΟΣ","ΕΙΡΗΝΗ","ΕΛΕΝΗ","ΕΛΕΥΘΕΡΙΑ","ΕΛΠΙΔΑ","ΕΜΜΑΝΟΥΗΛ","ΕΥΑΓΓΕΛΙΑ","ΕΥΑΓΓΕΛΟΣ","ΕΥΘΥΜΙΑ","ΕΥΘΥΜΙΟΣ","ΕΥΣΤΑΘΙΟΣ","ΕΥΤΥΧΙΑ","ΕΦΗ","ΖΩΗ","ΗΛΙΑΝΑ","ΗΛΙΑΣ","ΘΑΝΑΣΗΣ","ΘΑΝΟΣ","ΘΕΟΔΩΡΑ","ΘΕΟΔΩΡΟΣ","ΘΕΟΠΙΣΤΗ","ΘΟΔΩΡΗΣ","ΘΥΜΙΟΣ","ΘΩΜΑΣ","ΙΑΣΩΝ","ΙΟΡΔΑΝΗΣ","ΙΩΑΝΝΑ","ΙΩΑΝΝΗΣ","ΚΑΛΛΙΟΠΗ","ΚΑΛΛΙΡΡΟΗ","ΚΑΤΕΡΙΝΑ","ΚΛΕΑΝΘΗΣ","ΚΥΡΙΑΚΗ","ΚΥΡΙΑΚΟΣ","ΚΩΝΣΤΑΝΤΙΑ","ΚΩΝΣΤΑΝΤΙΝΑ","ΚΩΝΣΤΑΝΤΙΝΟΣ","ΚΩΣΤΑΣ","ΚΩΣΤΗΣ","ΛΑΜΠΡΟΣ","ΛΕΩΝΙΔΑΣ","ΛΙΤΣΑ","ΜΑΓΔΑΛΗΝΗ","ΜΑΝΩΛΗΣ","ΜΑΡΙΑ","ΜΑΡΙΝΑ","ΜΑΡΙΟΣ","ΜΑΡΚΟΣ","ΜΙΛΤΙΑΔΗΣ","ΜΙΧΑΗΛ","ΜΙΧΑΛΗΣ","ΜΠΑΜΠΗΣ","ΜΥΡΤΩ","ΝΙΚΟΛΑΟΣ","ΝΙΚΟΛΕΤΑ","ΝΙΚΟΣ","ΝΤΙΝΑ","ΟΔΥΣΣΕΑΣ","ΟΛΓΑ","ΟΥΡΑΝΙΑ","ΠΑΝΑΓΙΩΤΑ","ΠΑΝΑΓΙΩΤΗΣ","ΠΑΝΟΣ","ΠΑΡΑΣΚΕΥΗ","ΠΑΥΛΟΣ","ΠΕΤΡΟΣ","ΠΗΝΕΛΟΠΗ","ΠΡΟΔΡΟΜΟΣ","ΡΑΦΑΗΛ","ΡΕΝΑ","ΣΑΒΒΑΣ","ΣΕΡΑΦΕΙΜ","ΣΟΦΙΑ","ΣΠΥΡΙΔΟΥΛΑ","ΣΠΥΡΙΔΩΝ","ΣΠΥΡΟΣ","ΣΤΑΘΗΣ","ΣΤΑΜΑΤΙΑ","ΣΤΑΥΡΟΣ","ΣΤΑΥΡΟΥΛΑ","ΣΤΕΛΙΟΣ","ΣΤΕΦΑΝΟΣ","ΣΤΥΛΙΑΝΗ","ΣΤΥΛΙΑΝΟΣ","ΣΩΤΗΡΗΣ","ΣΩΤΗΡΙΟΣ","ΤΑΣΙΑ","ΤΑΣΟΣ","ΤΡΙΑΝΤΑΦΥΛΛΟΣ","ΦΩΤΕΙΝΗ","ΦΩΤΗΝΗ","ΦΩΤΗΣ","ΦΩΤΙΟΣ","ΧΑΡΑΛΑΜΠΟΣ","ΧΑΡΗΣ","ΧΑΡΙΚΛΕΙΑ","ΧΡΗΣΤΟΣ","ΧΡΙΣΤΙΝΑ","ΧΡΙΣΤΟΦΟΡΟΣ","ΧΡΥΣΑΝΘΗ","ΧΡΥΣΟΥΛΑ"]);
let FN_BY_SOUND = null;
/** Greeklish όνομα → ελληνικά, με σωστή ορθογραφία στα γνωστά μικρά ονόματα (GIORGOS → ΓΙΩΡΓΟΣ). */
export function greekName(latin) {
  if (!FN_BY_SOUND) { FN_BY_SOUND = new Map(); for (const n of FIRST_NAMES) { const k = soundKey(n); if (!FN_BY_SOUND.has(k)) FN_BY_SOUND.set(k, n); } }
  return greeklishToGreek(latin).split(" ").map(w => FN_BY_SOUND.get(soundKey(w)) || w).join(" ");
}
/** «ΓΙΩΡΓΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ» / «Γ. ΠΑΠΑΔΟΠΟΥΛΟΣ» → «ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ» / «ΠΑΠΑΔΟΠΟΥΛΟΣ Γ.». Επιχειρήσεις μένουν όπως είναι. */
export function surnameFirst(name, isBusiness) {
  const s = String(name || "").replace(/\s+/g, " ").trim(); if (!s || isBusiness) return s;
  const t = s.split(" "); if (t.length !== 2) return s;
  const a = norm(t[0]).replace(/\./g, ""), b = norm(t[1]).replace(/\./g, "");
  if (a.length === 1 && b.length > 2) return t[1] + " " + (t[0].endsWith(".") ? t[0] : t[0] + ".");
  if (FIRST_NAMES.has(a) && !FIRST_NAMES.has(b)) return t[1] + " " + t[0];
  return s;
}
export function extractedToParcel(d) {
  const dest = norm(d.destination_city) || HOME;
  const phone = cleanPhone(d.phone);
  return {
    receipt_no: handwrittenReceipt(d), parcel_code: d.parcel_code || null, kind: "Ασυνόδευτο" /* το «ΣΥΝΟΔΕΥΤΙΚΟ» της ετικέτας αφορά το χαρτί, όχι το δέμα */, item: d.item || null,
    origin_city: norm(d.origin_city) || null, destination_city: dest,
    issued_at: parseGrDate(d.issued)?.toISOString() || null, departure_at: parseGrDate(d.departure)?.toISOString() || null,
    fare_eur: d.fare_eur == null || d.fare_eur === "" ? null : Number(d.fare_eur),
    sender_name: d.sender || null, recipient_name: surnameFirst(d.recipient, d.recipient_is_business),
    recipient_phone: phone || null, phone_source: phone ? (d.phone_is_handwritten ? "handwritten" : "label") : null,
    phone_confirmed: !!phone && !d.phone_is_handwritten,
    shelf: dest === HOME ? (shelfFor(surnameFirst(d.recipient, d.recipient_is_business)) || null) : null,
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

/** 2ος έλεγχος με την κατάσταση: ποια δέματα έχουν λάθος αριθμό απόδειξης και ποιος είναι ο σωστός.
 *  Διορθώνει ΜΟΝΟ όταν: (α) ο αριθμός διαφέρει κατά 1 ψηφίο + ίδιο επώνυμο, ή (β) ίδιο ΟΝΟΜΑΤΕΠΩΝΥΜΟ ακριβώς, μοναδικό, ίδια πόλη.
 *  Ποτέ όταν η γραμμή της κατάστασης διαβάστηκε αβέβαια, όταν ο νέος αριθμός ανήκει σε άλλο δέμα, ή σε χειρόγραφη απόδειξη. */
export function receiptFixes(found, allParcels, dep = null) {
  const fixes = [];
  const digits = s => String(s || "").replace(/\D/g, "");
  for (const f of found) {
    const it = f.item, p = f.parcel;
    if (!(f.how === "receipt~" || f.how === "name") || it.unsure) continue;
    const rd = digits(it.receipt_no); if (rd.length < 8) continue;
    if (sameReceipt(p.receipt_no, it.receipt_no)) continue;
    if (/\(/.test(p.receipt_no || "")) continue; // χειρόγραφη «3401 (33950048)»
    if (f.how === "name") {
      if (norm(p.recipient_name) !== norm(it.recipient)) continue; // μόνο επώνυμο → όχι
      const sameDay = dep && p.departure_at && new Date(p.departure_at).toDateString() === new Date(dep).toDateString();
      if (norm(it.recipient).split(" ").length < 2 && !sameDay) continue; // σκέτο επώνυμο: μόνο αν είναι και ίδια μέρα δρομολογίου
    }
    let nu = String(it.receipt_no).trim();
    if (/^\d-\d{3}-\d{3}-\d+$/.test(nu) && p.receipt_no && !/^\d-/.test(p.receipt_no)) nu = nu.slice(2); // ίδια μορφή με την ετικέτα
    if (allParcels.some(x => x.id !== p.id && sameReceipt(x.receipt_no, nu))) continue;
    fixes.push({ parcel: p, from: p.receipt_no || "", to: nu, how: f.how });
  }
  return fixes;
}
/** Βγάζει το «⚠ Έλεγξε: αριθμό απόδειξης…» από τις σημειώσεις και γράφει τη διόρθωση. */
export function fixedReceiptNote(notes, from) {
  let n = String(notes || "").replace(/⚠ Έλεγξε: ([^(]*)\(αβέβαιη ανάγνωση\)/, (m, list) => {
    const rest = list.split(",").map(s => s.trim()).filter(s => s && s !== "αριθμό απόδειξης");
    return rest.length ? "⚠ Έλεγξε: " + rest.join(", ") + " (αβέβαιη ανάγνωση)" : "";
  }).replace(/^ · | · $/g, "").replace(/ · · /g, " · ").trim();
  const add = "✎ Αριθμός διορθώθηκε από την κατάσταση" + (from ? " (ήταν " + from + ")" : "");
  return [n, add].filter(Boolean).join(" · ");
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

// ================================================================ ΕΞΕΡΧΟΜΕΝΑ
/** Ανάγνωση απόδειξης (ίδια μορφή με τις ετικέτες) → γραμμή του πίνακα outgoing. */
export function extractedToOutgoing(d) {
  const phone = cleanPhone(d.phone);
  const fare = d.fare_eur == null || d.fare_eur === "" ? null : Number(d.fare_eur);
  return {
    receipt_no: handwrittenReceipt(d) || null, parcel_code: String(d.parcel_code || "").trim() || null,
    fare_eur: isNaN(fare) ? null : fare,
    issued_at: parseGrDate(d.issued)?.toISOString() || null, departure_at: parseGrDate(d.departure)?.toISOString() || null,
    sender_name: String(d.sender || "").trim() || null, sender_phone: cleanPhone(d.sender_phone) || null,
    sender_is_business: d.sender_is_business === true || looksBusiness(d.sender),
    recipient_name: surnameFirst(String(d.recipient || "").trim(), d.recipient_is_business) || null,
    recipient_phone: phone || null,
    origin_city: norm(d.origin_city) || HOME, destination_city: cityFromStation(d.destination_city) || norm(d.destination_city) || null,
    pieces: Math.max(1, Number(d.pieces) || 1), is_handwritten: !!d.is_handwritten_receipt,
  };
}
/** Ίδιο εξερχόμενο; (αριθμός απόδειξης ή κωδικός δέματος) */
export function sameOutgoing(a, b) {
  if (a.receipt_no && b.receipt_no && (sameReceipt(a.receipt_no, b.receipt_no) || String(a.receipt_no).trim() === String(b.receipt_no).trim())) return true;
  const pa = String(a.parcel_code || "").toUpperCase().trim(), pb = String(b.parcel_code || "").toUpperCase().trim();
  return pa.length >= 6 && pa === pb;
}
/** Συμπληρώνει μόνο τα κενά πεδία (η φωτογραφία δεν σβήνει ό,τι γράφτηκε με το χέρι). */
export function fillBlanks(existing, incoming) {
  const patch = {};
  for (const [k, v] of Object.entries(incoming)) if (v != null && v !== "" && (existing[k] == null || existing[k] === "")) patch[k] = v;
  return patch;
}
/** Κατάσταση δρομολογίου ↔ φωτογραφίες: τι λείπει από πού. */
export function outCheck(rows) {
  const live = rows.filter(r => r.status !== "cancelled");
  return {
    ok: live.filter(r => r.in_report && r.photographed),
    noPhoto: live.filter(r => r.in_report && !r.photographed),           // στην κατάσταση, δεν φωτογραφήθηκε (φορτώθηκε;)
    notInReport: live.filter(r => r.photographed && !r.in_report),       // φωτογραφήθηκε, δεν είναι στην κατάσταση
  };
}
/** Ταμείο εξερχομένων μιας ημέρας. */
export function outCash(rows, pct) {
  const live = rows.filter(r => r.status !== "cancelled");
  const sum = a => Math.round(a.reduce((s, r) => s + (Number(r.fare_eur) || 0), 0) * 100) / 100;
  const group = key => { const m = new Map(); for (const r of live) { const k = key(r) || "—"; const g = m.get(k) || []; g.push(r); m.set(k, g); }
    return [...m.entries()].map(([k, g]) => ({ key: k, count: g.length, fares: sum(g) })).sort((a, b) => b.fares - a.fares); };
  const fares = sum(live), p = Number(pct) || 0;
  return { count: live.length, pieces: live.reduce((s, r) => s + (Number(r.pieces) || 1), 0), fares,
    noFare: live.filter(r => r.fare_eur == null).length, commission: Math.round(fares * p) / 100, pct: p,
    byDest: group(r => r.destination_city), byOp: group(r => r.operator) };
}
/** SMS στον παραλήπτη: «το δέμα σας έφυγε» — πάντα 1 SMS. */
export function outSmsFor(r, now = new Date()) {
  const d = r.departure_at ? new Date(r.departure_at) : null;
  const when = d ? String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") : "";
  const dest = r.destination_city ? " ΠΡΟΣ " + r.destination_city : "";
  const base = greeting(now) + " ΣΑΣ! ΣΑΣ ΣΤΑΛΘΗΚΕ ΔΕΜΑ ΜΕ ΚΤΕΛ ΑΠΟ ΑΓΡΙΝΙΟ" + dest + (when ? ", ΑΝΑΧΩΡΗΣΗ " + when : "") + ".";
  const tail = " ΠΑΡΑΛΑΒΗ ΑΠΟ ΤΟ ΣΤΑΘΜΟ ΚΤΕΛ. ΤΗΛ. 2641024446";
  for (const s of [base + (r.receipt_no ? " ΑΡ. " + r.receipt_no + "." : "") + tail, base + tail]) { const g = gsmGreek(s); if (smsLen(g) <= 160) return g; }
  return gsmGreek(base + " ΤΗΛ. 2641024446").slice(0, 160);
}

/** Απόδειξη που εκδόθηκε από την αποθήκη Αγρινίου (εκδότης 228): 228-336-142206 (ή 2-228-336-142206 στις καταστάσεις). */
/** «2-000-228-336-142315» (κλείσιμο ταμείου) / «2-228-336-…» (καταστάσεις) → «228-336-142315» */
export function ktelNo(rn) {
  return String(rn || "").trim().replace(/\s/g, "").replace(/^\d-0{3}-(?=\d{3}-)/, "").replace(/^\d-(?=\d{3}-\d{3}-)/, "");
}
export function isAgrinioReceipt(rn) {
  const s = ktelNo(rn);
  return /^228[-\s]?\d{3}[-\s]?\d+$/.test(s);
}

/** Δρομολόγιο από τους προορισμούς μιας κατάστασης: το τέρμα (π.χ. ΠΑΤΡΑ) + οι στάσεις.
 *  Τέρμα = ο πρώτος «μεγάλος» προορισμός της λίστας, αλλιώς ο πιο συχνός. */
const TERMINI = ["ΑΘΗΝΑ", "ΘΕΣΣΑΛΟΝΙΚΗ", "ΠΑΤΡΑ", "ΙΩΑΝΝΙΝΑ", "ΛΑΡΙΣΑ", "ΒΟΛΟΣ", "ΛΑΜΙΑ", "ΚΑΛΑΜΑΤΑ", "ΠΥΡΓΟΣ", "ΚΟΖΑΝΗ", "ΒΕΡΟΙΑ", "ΓΡΕΒΕΝΑ", "ΧΑΛΚΙΔΑ", "ΠΡΕΒΕΖΑ", "ΛΕΥΚΑΔΑ", "ΑΡΤΑ"];
export function routeOf(dests) {
  const list = dests.map(d => cityFromStation(d) || norm(d)).filter(Boolean);
  if (!list.length) return { end: "", stops: [] };
  const cnt = new Map(); for (const d of list) cnt.set(d, (cnt.get(d) || 0) + 1);
  const end = TERMINI.find(t => cnt.has(t)) || [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const stops = [...cnt.keys()].filter(d => d !== end);
  return { end, stops };
}

/** Κλείσιμο ταμείου ↔ εξερχόμενα. items: γραμμές του ταμείου, rows: εξερχόμενα (της ημέρας + όσα βρέθηκαν με αριθμό). */
export function cashReconcile(items, rows) {
  const seen = new Map();
  for (const it of items) { const n = ktelNo(it.receipt_no); if (isAgrinioReceipt(n) && !seen.has(n)) seen.set(n, { ...it, receipt_no: n }); }
  const list = [...seen.values()];
  const byNo = new Map(rows.map(r => [ktelNo(r.receipt_no), r]));
  const matched = [], added = [], fareDiff = [];
  for (const it of list) {
    const r = byNo.get(it.receipt_no) || rows.find(x => sameReceipt(x.receipt_no, it.receipt_no));
    if (r) { matched.push({ item: it, row: r }); if (it.amount != null && r.fare_eur != null && Math.abs(Number(r.fare_eur) - it.amount) > 0.009) fareDiff.push({ item: it, row: r }); }
    else added.push(it);
  }
  const inCash = new Set(list.map(i => i.receipt_no));
  const notInCash = rows.filter(r => r.status !== "cancelled" && isAgrinioReceipt(r.receipt_no) && !inCash.has(ktelNo(r.receipt_no)));
  // κενά στη συνεχή αρίθμηση = σειρές που δεν διαβάστηκαν (π.χ. σελίδα που λείπει)
  const tails = list.map(i => Number(i.receipt_no.split("-").pop())).filter(n => !isNaN(n)).sort((a, b) => a - b);
  const gaps = []; for (let i = 1; i < tails.length; i++) for (let n = tails[i - 1] + 1; n < tails[i] && gaps.length < 50; n++) gaps.push(n);
  const amount = Math.round(list.reduce((s, i) => s + (Number(i.amount) || 0), 0) * 100) / 100;
  return { list, matched, added, fareDiff, notInCash, gaps, count: list.length, amount, first: tails[0], last: tails.at(-1) };
}

/** Το όνομα μοιάζει με επιχείρηση; (εταιρική μορφή ή λέξη καταστήματος) — εφεδρικό, όταν δεν απαντά το AI */
export function looksBusiness(name) {
  const s = " " + norm(name).replace(/\./g, "") + " ";
  return /\s(ΟΕ|ΕΕ|ΕΠΕ|ΙΚΕ|ΑΕ|ΑΕΒΕ|ΜΙΚΕ|ΑΦΟΙ|ΥΙΟΙ|ΚΑΙ ΣΙΑ)\s/.test(s) ||
    /(ΦΑΡΜΑΚΕΙ|ΙΑΤΡΕΙ|ΣΥΝΕΡΓΕΙ|ΚΑΤΑΣΤΗΜ|ΕΜΠΟΡΙ|ΑΝΤΑΛΛΑΚΤΙΚ|ΞΕΝΟΔΟΧΕΙ|\sΚΑΦΕ\s|CAFE|ΑΡΤΟΠΟΙ|\sΦΟΥΡΝΟΣ\s|ΖΑΧΑΡΟΠΛ|ΕΤΑΙΡ|ΒΙΟΤΕΧΝ|ΒΙΟΜΗΧΑΝ|ΓΡΑΦΕΙΟ|ΛΟΓΙΣΤΙΚ|^\sΔΗΜΟΣ\s[Α-Ω]+ΟΥ\s|ΣΧΟΛΕΙΟ|ΣΥΝΕΤΑΙΡ|ΠΡΑΤΗΡΙΟ|ΚΡΕΟΠΩΛ|ΟΠΤΙΚ|ΚΤΗΝΙΑΤΡ|ΓΕΩΠΟΝ|ΕΙΔΗ |SHOP|STORE|LTD|IKE)/.test(s);
}
/** Στατιστικά αποστολέα από τα εξερχόμενα: πλήθος, τελευταία, συχνοί παραλήπτες/προορισμοί */
export function senderStats(rows) {
  const live = rows.filter(r => r.status !== "cancelled");
  const top = (key, n) => { const m = new Map(); for (const r of live) { const k = key(r); if (!k) continue; const x = m.get(k) || { k, n: 0, r }; x.n++; if (new Date(r.created_at) > new Date(x.r.created_at)) x.r = r; m.set(k, x); }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, n); };
  const now = new Date(), m0 = new Date(now.getFullYear(), now.getMonth(), 1);
  return { count: live.length, month: live.filter(r => new Date(r.created_at) >= m0).length,
    fares: Math.round(live.reduce((s, r) => s + (Number(r.fare_eur) || 0), 0) * 100) / 100,
    last: live.map(r => r.created_at).sort().at(-1) || null,
    recipients: top(r => r.recipient_name ? r.recipient_name + "|" + (r.destination_city || "") : null, 8),
    dests: top(r => r.destination_city, 5) };
}

// ================================================================ 🚌 ΔΡΟΜΟΛΟΓΙΑ (βάση αναχωρήσεων από Αγρίνιο)
export const weekdayIdx = d => (new Date(d).getDay() + 6) % 7; // Δευ=0 … Κυρ=6
/** Τα λεωφορεία μιας ημέρας: ίδια ώρα + ίδια «γραμμή» = ένα λεωφορείο. → [{hhmm, line, end, stops, members, notes}] */
export function busesFor(times, lines, date) {
  const wd = weekdayIdx(date);
  const act = times.filter(t => t.active !== false && String(t.days || "")[wd] === "1");
  const byT = new Map(); for (const t of act) { const a = byT.get(t.time) || []; a.push(t); byT.set(t.time, a); }
  const out = [];
  for (const [hhmm, ts] of [...byT.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const present = new Set(ts.map(t => t.dest)); const groups = new Map();
    for (const t of ts) {
      // γραμμή με συγκεκριμένες ώρες (π.χ. «ΜΥΤΙΚΑΣ 15:00») ισχύει μόνο τότε και υπερισχύει των γενικών
      const cand = lines.filter(l => l.stops.includes(t.dest) && (!(l.times || []).length || l.times.includes(hhmm)));
      const best = cand.map(l => ({ l, n: l.stops.filter(s => present.has(s)).length + ((l.times || []).length ? 100 : 0) })).sort((a, b) => b.n - a.n)[0];
      const name = best ? best.l.name : t.dest; const g = groups.get(name) || { line: best ? best.l : null, ts: [] }; g.ts.push(t); groups.set(name, g);
    }
    for (const [name, g] of groups) {
      const order = g.line ? g.line.stops : [];
      const members = [...new Set(g.ts.map(t => t.dest))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      out.push({ hhmm, line: name, end: members.at(-1), stops: members.slice(0, -1), members,
        notes: [...new Set(g.ts.map(t => t.notes).filter(Boolean))], express: g.ts.some(t => t.express) });
    }
  }
  return out;
}
/** Επόμενο λεωφορείο για έναν προορισμό από τη στιγμή «from» (ψάχνει έως 3 μέρες μπροστά). */
export function nextBusFor(times, lines, dest, from = new Date()) {
  const f = new Date(from);
  for (let i = 0; i < 4; i++) {
    const d = new Date(f); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0);
    const minT = i === 0 ? String(f.getHours()).padStart(2, "0") + ":" + String(f.getMinutes()).padStart(2, "0") : "00:00";
    const b = busesFor(times, lines, d).find(x => x.members.includes(dest) && x.hhmm >= minT);
    if (b) { const [h, m] = b.hhmm.split(":").map(Number); d.setHours(h, m, 0, 0); return { ...b, at: d }; }
  }
  return null;
}

// ================================================================ ΚΑΤΑΣΤΑΣΗ ΠΡΙΝ ΤΟΝ ΕΛΕΓΧΟ (εισερχόμενα)
/** Η κατάσταση γράφει «2-255-349-11663», η ετικέτα «255-349-11663» → ίδια μορφή με την ετικέτα. */
export const labelReceipt = r => { const s = String(r || "").trim(); return /^\d-\d{3}-\d{3}-\d+$/.test(s) ? s.slice(2) : s; };
const validReceipt = r => /^\d{3}-\d{3}-\d{4,7}$/.test(r || "") || /^\d{8,12}$/.test(r || "");
/**
 * Βοήθεια ανάγνωσης ετικέτας από ανοιχτές καταστάσεις (ανέβηκαν πριν τα δέματα).
 * Βρίσκει τη γραμμή της κατάστασης και συμπληρώνει ΜΟΝΟ ό,τι λείπει ή διαβάστηκε αβέβαια — ποτέ δεν αλλάζει καθαρή ανάγνωση.
 * opens: [{id, origin_city, departure_at, items}] · taken(item) → true αν η γραμμή έχει ήδη δέμα (για να μην κολλήσουν 2 δέματα στην ίδια γραμμή).
 * Επιστρέφει {d, man, item, how, filled:[πεδία], note} ή {d, miss: man} (δέμα του ίδιου δρομολογίου που δεν είναι στην κατάσταση) ή null.
 */
export function expectHelp(d0, opens, taken = () => false) {
  if (!opens || !opens.length) return null;
  const d = { ...d0, unsure: [...(d0.unsure || [])] };
  const uns = f => d.unsure.includes(f);
  const recOk = validReceipt(d.receipt_no) && !uns("receipt_no");
  const nameOk = String(d.recipient || "").trim() && !uns("recipient");
  const all = []; opens.forEach(m => (m.items || []).forEach(it => all.push({ m, it })));
  const surname = s => norm(s).split(" ")[0] || "";
  let hit = null, how = "";
  // 1) ίδιος αριθμός (σίγουρο — και για επόμενο τεμάχιο)
  const ex = all.filter(x => sameReceipt(x.it.receipt_no, d.receipt_no));
  if (ex.length === 1) { hit = ex[0]; how = "receipt"; }
  // 2) διαφέρει 1 ψηφίο: μόνο με ίδιο επώνυμο, ή αν το όνομα δεν διαβάστηκε
  if (!hit) {
    const near = all.filter(x => nearReceipt(x.it.receipt_no, d.receipt_no));
    const sn = surname(d.recipient);
    const ok = near.filter(x => (sn.length >= 3 && surname(x.it.recipient) === sn) || !nameOk);
    if (near.length === 1 && ok.length === 1 && !taken(ok[0].it)) { hit = ok[0]; how = "near"; }
  }
  // 3) όνομα: μόνο αν ο αριθμός λείπει/αβέβαιος, και μία μόνο γραμμή ταιριάζει
  if (!hit && !recOk && String(d.recipient || "").trim()) {
    const k = soundKey(d.recipient);
    // μοναδικότητα σε ΟΛΕΣ τις γραμμές (κι όσες έχουν ήδη δέμα) — αλλιώς ένα 2ο ίδιο επώνυμο θα κολλούσε σε λάθος γραμμή
    let c = all.filter(x => soundKey(x.it.recipient) === k);
    if (!c.length) { const sn = surname(d.recipient); if (sn.length >= 4) c = all.filter(x => surname(x.it.recipient) === sn); }
    if (c.length === 1 && !taken(c[0].it)) { hit = c[0]; how = "name"; }
  }
  if (!hit) {
    // ίδιο δρομολόγιο με ανοιχτή κατάσταση αλλά όχι μέσα της
    const dep = parseGrDate(d.departure);
    const man = dep && opens.find(m => m.origin_city && norm(d.origin_city) === m.origin_city && m.departure_at && Math.abs(new Date(m.departure_at) - dep) < 20 * 60e3);
    return man ? { d, miss: man } : null;
  }
  const { m, it } = hit, filled = [];
  const drop = f => { d.unsure = d.unsure.filter(u => u !== f); };
  let note = "";
  if (how !== "receipt" && it.receipt_no && !it.unsure) {
    if (!recOk) { if (d.receipt_no) note = "✎ Αρ. απόδειξης από την κατάσταση (διαβάστηκε " + d.receipt_no + ")"; d.receipt_no = labelReceipt(it.receipt_no); drop("receipt_no"); filled.push("receipt_no"); }
    else note = "⚠ Ο αριθμός διαφέρει από την κατάσταση (" + labelReceipt(it.receipt_no) + ")";
  }
  if (!nameOk && String(it.recipient || "").trim() && !it.unsure) { d.recipient = it.recipient.trim(); drop("recipient"); filled.push("recipient"); }
  if ((!norm(d.origin_city) || uns("origin_city")) && m.origin_city) { d.origin_city = m.origin_city; drop("origin_city"); filled.push("origin_city"); }
  if ((!parseGrDate(d.departure) || uns("departure")) && m.departure_at) { d.departure = fmtGr(m.departure_at); drop("departure"); filled.push("departure"); }
  if ((d.fare_eur == null || d.fare_eur === "" || uns("fare_eur")) && it.fare_eur != null) { d.fare_eur = Number(it.fare_eur); drop("fare_eur"); filled.push("fare_eur"); }
  if (!(Number(d.pieces) > 0) && Number(it.pieces) > 1) { d.pieces = Number(it.pieces); filled.push("pieces"); }
  if ((!norm(d.destination_city) || uns("destination_city")) && it.destination_city) { d.destination_city = it.destination_city === HOME ? "" : it.destination_city; drop("destination_city"); filled.push("destination_city"); }
  return { d, man: m, item: it, how, filled, note };
}
/** Τεμάχια γραμμής κατάστασης (null/0 → 1). */
export const itemPieces = it => Math.max(1, Number(it && it.pieces) || 1);
/** Τεμάχια που έχουν φτάσει για ένα δέμα (pieces_in, αλλιώς 1). */
const piecesIn = p => Math.max(1, Number(p.pieces_in) || 1);
/**
 * Πρόοδος ανοιχτής κατάστασης: αποστολές ΚΑΙ τεμάχια.
 * Με ίδιο αριθμό απόδειξης μετράει κάθε δέμα (ακόμα κι αν καταχωρήθηκε πριν). Με όνομα ή «σχεδόν ίδιο» αριθμό
 * μετράνε ΜΟΝΟ δέματα που καταχωρήθηκαν ΜΕΤΑ το ανέβασμα της κατάστασης — αλλιώς ένα παλιό δέμα με ίδιο επώνυμο έβγαινε «ήρθε».
 */
/** Μπορεί αυτό το (ήδη καταχωρημένο) δέμα να είναι από αυτό το λεωφορείο; Όχι αν καταχωρήθηκε ΠΡΙΝ φύγει το λεωφορείο,
 *  ή αν η δική του ώρα αναχώρησης απέχει > 12 ώρες (άλλη αποστολή / λάθος ανάγνωση). Δέματα μετά το ανέβασμα: πάντα ναι. */
export function expectEligible(man) {
  const t0 = new Date(man.created_at || Date.now()).getTime() - 5 * 60e3;
  const dep = man.departure_at ? new Date(man.departure_at).getTime() : null;
  return p => {
    const c = new Date(p.created_at).getTime();
    if (c >= t0) return true;
    if (!dep) return true;
    if (c < dep - 10 * 60e3) return false;
    return !p.departure_at || Math.abs(new Date(p.departure_at).getTime() - dep) < 12 * 3600e3;
  };
}
export function expectProgress(man, parcels) {
  const dep = man.departure_at ? new Date(man.departure_at) : null;
  const trip = man.origin_city && dep ? { origin: man.origin_city, key: tripsOf({ origin_city: man.origin_city, departure_at: dep.toISOString() })[0] } : null;
  const t0 = new Date(man.created_at || Date.now()).getTime();
  const real = parcels.filter(p => p.source !== "manifest");
  // ίδιος αριθμός = ίδιο δέμα: μετράει ΠΑΝΤΑ (μπορεί να ήρθε με προηγούμενο δρομολόγιο) — απλώς σημειώνεται
  const pool = real.filter(p => new Date(p.created_at).getTime() >= t0 - 30 * 864e5);
  const depT = man.departure_at ? new Date(man.departure_at).getTime() : null;
  const after = real.filter(p => new Date(p.created_at).getTime() >= t0 - 5 * 60e3);
  const items = man.items || [], used = new Set(), found = [], rest = [];
  for (const it of items) {
    const p = String(it.receipt_no || "").replace(/\D/g, "").length >= 8 && pool.find(x => !used.has(x.id) && sameReceipt(x.receipt_no, it.receipt_no));
    if (p) { used.add(p.id); const c = new Date(p.created_at).getTime(); found.push({ item: it, parcel: p, how: "receipt", before: c < t0 - 5 * 60e3, early: depT != null && c < depT - 10 * 60e3 }); } else rest.push(it);
  }
  const r = reconcile(rest, after.filter(x => !used.has(x.id)), trip, after.filter(x => !used.has(x.id) && (!trip || x.origin_city === trip.origin)));
  r.found.forEach(f => found.push(f));
  const fUsed = new Set(found.map(f => f.parcel.id));
  const extra = trip ? after.filter(x => !fUsed.has(x.id) && tripsOf(x)[0] === trip.key) : [];
  const pieces = items.reduce((s, it) => s + itemPieces(it), 0);
  const partial = found.filter(f => piecesIn(f.parcel) < itemPieces(f.item));
  const piecesFound = found.reduce((s, f) => s + Math.min(piecesIn(f.parcel), itemPieces(f.item)), 0);
  return { total: items.length, found, missing: r.missing, extra, pieces, piecesFound, partial, before: found.filter(f => f.before).length, early: found.filter(f => f.early) };
}

// ================================================================ ΚΛΕΙΣΙΜΟ ΤΑΜΕΙΟΥ: όταν το άθροισμα δεν ταιριάζει
/**
 * Δύο ανεξάρτητες αναγνώσεις του ίδιου ταμείου + το σύνολο της αναφοράς → διόρθωση ποσών.
 * Όπου οι δύο αναγνώσεις διαφωνούν, δοκιμάζει τους συνδυασμούς· αν ΑΚΡΙΒΩΣ ένας δίνει το σύνολο, τον κρατά.
 * Αλλιώς επιστρέφει «ύποπτες» γραμμές: διαφωνίες, ποσό εκτός του συνηθισμένου για τον προορισμό, διαφορά με την εφαρμογή.
 * appFare(receipt_no) → ποσό που ξέρει η εφαρμογή (από τη σάρωση), ή null.
 */
export function cashFix(items, items2, total, appFare = () => null) {
  const r2 = new Map((items2 || []).map(i => [ktelNo(i.receipt_no), i]));
  const out = items.map(i => ({ ...i }));
  const sum = a => Math.round(a.reduce((s, i) => s + (Number(i.amount) || 0), 0) * 100) / 100;
  const before = sum(out);
  const dis = [];
  out.forEach((it, idx) => { const b = r2.get(ktelNo(it.receipt_no)); if (b && b.amount != null && Number(b.amount) !== Number(it.amount)) dis.push({ idx, a: Number(it.amount) || 0, b: Number(b.amount) }); });
  const changed = [];
  let resolved = total == null ? true : Math.abs(before - total) < 0.01;
  if (!resolved && dis.length && dis.length <= 16) {
    const base = before - dis.reduce((s, d) => s + d.a, 0), sols = [];
    for (let m = 0; m < (1 << dis.length) && sols.length < 2; m++) {
      const s = base + dis.reduce((t, d, k) => t + (m >> k & 1 ? d.b : d.a), 0);
      if (Math.abs(s - total) < 0.01) sols.push(m);
    }
    if (sols.length === 1) {
      dis.forEach((d, k) => { if (sols[0] >> k & 1) { changed.push({ receipt_no: out[d.idx].receipt_no, from: d.a, to: d.b }); out[d.idx].amount = d.b; } });
      resolved = true;
    }
  }
  // ύποπτες γραμμές για έλεγχο με το μάτι
  const suspects = new Map();
  const add = (it, why) => { const k = ktelNo(it.receipt_no); const s = suspects.get(k) || { receipt_no: it.receipt_no, to: it.to, amount: it.amount, why: [] }; s.why.push(why); suspects.set(k, s); };
  if (!resolved) {
    dis.forEach(d => add(out[d.idx], "2η ανάγνωση: " + d.b));
    const byTo = new Map(); out.forEach(i => { const k = i.to || ""; const m = byTo.get(k) || new Map(); m.set(Number(i.amount) || 0, (m.get(Number(i.amount) || 0) || 0) + 1); byTo.set(k, m); });
    out.forEach(i => { const m = byTo.get(i.to || ""); const n = [...m.values()].reduce((a, b) => a + b, 0); if (n < 3) return;
      const [mode, c] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]; if (c >= n * 0.6 && (Number(i.amount) || 0) !== mode) add(i, "συνήθως " + mode + " για " + (i.to || "—")); });
    out.forEach(i => { const f = appFare(i.receipt_no); if (f != null && Math.abs(Number(f) - (Number(i.amount) || 0)) > 0.009) add(i, "η ετικέτα έγραφε " + f); });
    out.filter(i => i.unsure).forEach(i => add(i, "αβέβαιη ανάγνωση"));
  }
  return { items: out, before, after: sum(out), changed, resolved, suspects: [...suspects.values()] };
}

// ---------------------------------------------------------------- 🎁 κλήρωση (λίστα αναμονής παράδοσης στο σπίτι)
/** Διαβάζει το μήνυμα της φόρμας της ιστοσελίδας (όπως φτάνει στο WhatsApp/email, ελληνικά ή αγγλικά). */
export function parseContestMessage(text) {
  const t = String(text || "");
  const pick = re => { const m = t.match(re); return m ? m[1].trim() : ""; };
  const name = pick(/(?:Όνομα|Ονοματεπώνυμο|Name)\s*:\s*(.+)/i);
  const phoneRaw = pick(/(?:Κινητό|Τηλέφωνο|Mobile|Phone)\s*:\s*(.+)/i);
  const address = pick(/(?:Διεύθυνση|Address)\s*:\s*(.+)/i);
  const optLine = pick(/(?:Συμμετοχή στην κλήρωση[^:]*|Enters the prize draw[^:]*)\s*:\s*(.+)/i);
  const optIn = optLine ? /^(ναι|yes)/i.test(optLine) : null;
  return { name, phone: cleanPhone(phoneRaw), phoneRaw, address, optIn };
}
/** Αρχικά για δημόσια ανακοίνωση: «Γεώργιος Παπαδόπουλος» → «Γ.Π.» */
export function initials(name) {
  return String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 3).map(w => w[0].toUpperCase() + ".").join("") || "—";
}
/** Τυχαία σειρά (Fisher–Yates) με κρυπτογραφικό τυχαίο. rnd(n) → ακέραιος 0..n-1 */
export function drawOrder(ids, rnd) {
  const a = ids.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const cryptoRnd = n => { const b = new Uint32Array(1); const lim = Math.floor(0x100000000 / n) * n; let x; do { crypto.getRandomValues(b); x = b[0]; } while (x >= lim); return x % n; };

// 📊 Σύνοψη δημοσκόπησης «Παράδοση στο σπίτι».
// key = «Ναι, σίγουρα» ΚΑΙ πληρώνει ≥3 € — ο πιο αξιόπιστος αριθμός (οι δημοσκοπήσεις υπερεκτιμούν την πρόθεση).
export function pollSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const count = field => { const c = {}; for (const r of list) { const vs = Array.isArray(r[field]) ? r[field] : [r[field]]; for (const v of vs) if (v) c[v] = (c[v] || 0) + 1; } return c; };
  const paying = r => ["3", "4", "5plus"].includes(r.price);
  const key = list.filter(r => r.would_use === "yes" && paying(r));
  const frequent = key.filter(r => r.frequency === "weekly" || r.frequency === "monthly");
  return {
    total: list.length,
    would_use: count("would_use"), frequency: count("frequency"), price: count("price"),
    wants: count("wants"), who: count("who"), area: count("area"), source: count("source"),
    key: key.length, keyFrequent: frequent.length,
    pct: n => (list.length ? Math.round((n / list.length) * 100) : 0),
    comments: list.filter(r => r.comment).map(r => ({ at: r.created_at, text: r.comment })).slice(0, 20),
  };
}

// 💳 Αιτήματα πληρωμής (Viva Quick Pay / IRIS)
export const PAY_PURPOSE = { fare: "Ναύλος δέματος", home: "Παράδοση στο σπίτι", pickup: "Παραλαβή από το σπίτι", storage: "Φύλαξη", other: "Άλλο" };
const eur2 = n => (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace(".", ",") + " €";
/** Κείμενο μηνύματος προς αυτόν που πληρώνει. */
export function paymentMessage(r, business = "Αποθήκη Δεμάτων ΚΤΕΛ Αγρινίου") {
  const amount = Number(r.fare || 0) + Number(r.service || 0);
  const what = [PAY_PURPOSE[r.purpose] || PAY_PURPOSE.other, r.recipient ? "για " + r.recipient : "", r.receipt ? "(απόδειξη " + r.receipt + ")" : ""].filter(Boolean).join(" ");
  const lines = [`${business}: ${what}.`, `Ποσό: ${eur2(amount)}.`];
  if (r.link) lines.push(`Πληρωμή με κάρτα, Apple/Google Pay ή IRIS: ${r.link}`);
  lines.push("Μόλις ολοκληρωθεί η πληρωμή, θα σας στείλουμε επιβεβαίωση.");
  return lines.join("\n");
}
/** Σύνοψη για το ταμείο ημέρας: πληρωμένα που δεν έχουν αποδοθεί. */
export function paymentSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const paid = list.filter(r => r.status === "paid");
  const unsettled = paid.filter(r => !r.settled_at);
  const sum = (a, k) => Math.round(a.reduce((s, r) => s + Number(r[k] || 0), 0) * 100) / 100;
  return {
    pending: list.filter(r => r.status === "pending").length,
    paid: paid.length,
    fareToSettle: sum(unsettled, "fare"),
    serviceUnsettled: sum(unsettled, "service"),
    unsettledIds: unsettled.map(r => r.id),
  };
}
export const looksLikePayLink = s => /^https:\/\/([a-z0-9-]+\.)*vivapayments\.com\/|^https:\/\/([a-z0-9-]+\.)*viva\.com\//i.test(String(s || "").trim());
