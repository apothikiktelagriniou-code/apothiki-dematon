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
  const esc = v => { v = v == null ? "" : String(v); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
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
    sender_name: String(d.sender || "").trim() || null,
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
export function isAgrinioReceipt(rn) {
  const s = String(rn || "").trim().replace(/^\d-(?=\d{3}-)/, "");
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
