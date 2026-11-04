// ΕΞΕΡΧΟΜΕΝΑ δέματα — εντελώς ξεχωριστά από τα εισερχόμενα (δικός τους πίνακας, δική τους καρτέλα).
// Ροή: 1) «📄 Κατάσταση δρομολογίου» από το σύστημα ΚΤΕΛ → γραμμές «περιμένει»
//      2) στη φόρτωση «📷 Φωτογραφίες αποδείξεων» → συμπληρώνονται στοιχεία + «φορτώθηκε»
//      3) ο έλεγχος δείχνει: στην κατάσταση χωρίς φωτογραφία / φωτογραφία εκτός κατάστασης.
import { norm, fmtGr, fmtPhone, cleanPhone, money, parseGrDate, cityFromStation, extractedToOutgoing, sameOutgoing, fillBlanks, outCheck, outCash, outSmsFor, surnameFirst } from "./lib.js";
import { toJpegB64 } from "./capture.js";

const $ = id => document.getElementById(id);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const btn = (txt, cls, fn) => { const b = el("button", "btn small " + (cls || ""), txt); b.type = "button"; b.onclick = fn; return b; };
const show = (n, t, c) => { n.textContent = t; n.className = "msg " + c; n.hidden = !t; };
const STATUS = { waiting: "Περιμένει", loaded: "Φορτώθηκε", not_loaded: "Δεν φορτώθηκε", cancelled: "Ακυρώθηκε" };
const dayKey = d => { const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
const hhmm = iso => { const d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };

let D = null;                 // εξαρτήσεις από main.js
let rows = new Map();         // id → εξερχόμενο της επιλεγμένης ημέρας
let found = null;             // αποτελέσματα αναζήτησης (όλες οι ημέρες)
let busy = false, active = false, editing = null;

export function initOutgoing(deps) {
  D = deps;
  $("outDay").value = dayKey(new Date());
  $("outDay").onchange = () => { found = null; $("outQ").value = ""; load(); };
  let qT = null; $("outQ").oninput = () => { clearTimeout(qT); qT = setTimeout(search, 300); };
  $("outPhotos").onchange = e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) runPhotos(f); };
  $("outReport").onchange = e => { const f = [...e.target.files].slice(0, 4); e.target.value = ""; if (f.length) runReport(f); };
  $("outManual").onclick = () => openEdit(null);
  $("outCashBtn").onclick = toggleCash;
  $("outForm").onsubmit = e => { e.preventDefault(); saveEdit(); };
  $("outCancel").onclick = () => $("outDlg").close();
  $("outDel").onclick = delEdit;
  $("outVoid").onclick = () => saveEdit("cancelled");
  D.sb.channel("outgoing-live").on("postgres_changes", { event: "*", schema: "public", table: "outgoing" }, ev => {
    if (ev.eventType === "DELETE") rows.delete(ev.old.id);
    else if (inDay(ev.new)) rows.set(ev.new.id, ev.new); else rows.delete(ev.new.id);
    if (active) render();
  }).subscribe();
}
export function showOutgoing(on) { active = on; if (on) load(); }

// ---------------------------------------------------------------- δεδομένα
const dayRange = () => { const s = new Date($("outDay").value + "T00:00:00"); const e = new Date(s); e.setDate(e.getDate() + 1); return [s, e]; };
function inDay(r) { const [s, e] = dayRange(); const t = new Date(r.departure_at || r.issued_at || r.created_at); return t >= s && t < e; }
async function load() {
  const [s, e] = dayRange(); const S = s.toISOString(), E = e.toISOString();
  const { data, error } = await D.sb.from("outgoing").select("*")
    .or(`and(departure_at.gte.${S},departure_at.lt.${E}),and(departure_at.is.null,issued_at.gte.${S},issued_at.lt.${E}),and(departure_at.is.null,issued_at.is.null,created_at.gte.${S},created_at.lt.${E})`)
    .order("departure_at", { ascending: true }).limit(2000);
  if (error) { show($("outMsg"), "Δεν φορτώθηκαν τα εξερχόμενα: " + error.message + (/outgoing/.test(error.message) ? " — λείπει το 0014 στη βάση;" : ""), "bad"); return; }
  rows = new Map((data || []).map(r => [r.id, r])); render();
  if ($("outCashBox").hidden === false) renderCash();
}
async function search() {
  const s = $("outQ").value.trim(); if (s.length < 2) { found = null; render(); return; }
  const k = s.replace(/[,()%]/g, " ").trim(), d = s.replace(/\D/g, "");
  const ors = [`recipient_name.ilike.%${norm(k)}%`, `sender_name.ilike.%${norm(k)}%`, `parcel_code.ilike.%${k}%`, `destination_city.ilike.%${norm(k)}%`];
  if (d.length >= 4) ors.push(`receipt_no.ilike.%${d.slice(-6)}%`, `recipient_phone.ilike.%${d}%`, `sender_phone.ilike.%${d}%`);
  const { data } = await D.sb.from("outgoing").select("*").or(ors.join(",")).order("created_at", { ascending: false }).limit(100);
  found = data || []; render();
}
async function findExisting(o) {
  const ors = [];
  if (o.receipt_no) ors.push(`receipt_no.eq.${o.receipt_no.replace(/[,()]/g, "")}`);
  if (o.parcel_code && o.parcel_code.length >= 6) ors.push(`parcel_code.eq.${o.parcel_code}`);
  const d = String(o.receipt_no || "").replace(/\D/g, ""); if (d.length >= 10) ors.push(`receipt_no.ilike.%${d.slice(-6)}`);
  if (!ors.length) return null;
  const { data } = await D.sb.from("outgoing").select("*").or(ors.join(",")).limit(10);
  return (data || []).find(x => sameOutgoing(x, o)) || null;
}
async function save(id, patch) {
  const q = id ? D.sb.from("outgoing").update(patch).eq("id", id) : D.sb.from("outgoing").insert(patch);
  const { data, error } = await q.select().single(); if (error) throw error;
  if (inDay(data)) rows.set(data.id, data); else rows.delete(data.id);
  if (found) found = found.map(x => (x.id === data.id ? data : x));
  return data;
}
const loadedPatch = () => ({ status: "loaded", loaded_at: new Date().toISOString(), status_at: new Date().toISOString() });

// ---------------------------------------------------------------- 1) κατάσταση δρομολογίου (σύστημα ΚΤΕΛ)
async function runReport(files) {
  if (busy) return; if (D.needOperator()) return; busy = true; const msg = $("outMsg");
  try {
    show(msg, "Διαβάζω την κατάσταση… (έως 1 λεπτό)", "info");
    const images = []; for (const f of files) images.push({ data: await toJpegB64(f, 2000, 0.82), media_type: "image/jpeg" });
    const { data, error } = await D.sb.functions.invoke("extract-receipt", { body: { mode: "manifest", images } });
    if (error) throw new Error(await errText(error));
    const m = data.data || {}; const dep = parseGrDate(m.departure)?.toISOString() || null; const items = (m.items || []).filter(i => i.receipt_no);
    if (!items.length) { show(msg, "Δεν βρήκα γραμμές στην κατάσταση. Τράβα πιο καθαρά ή σε περισσότερες σελίδες.", "warn"); return; }
    const rep = await D.sb.from("outgoing_reports").insert({ departure_at: dep, total_declared: m.total_declared ?? null, items, operator: D.operator() || null }).select("id").single();
    let added = 0, matched = 0;
    for (const it of items) {
      const o = { receipt_no: it.receipt_no, recipient_name: it.recipient ? surnameFirst(it.recipient) : null, destination_city: cityFromStation(it.destination_city) || null,
        fare_eur: it.fare_eur, pieces: it.pieces || 1, departure_at: dep };
      const ex = await findExisting(o);
      if (ex) { await save(ex.id, { ...fillBlanks(ex, o), in_report: true, report_id: rep.data?.id || null }); matched++; }
      else { await save(null, { ...o, in_report: true, report_id: rep.data?.id || null, status: "waiting", operator: D.operator() || null, notes: it.unsure ? "⚠ Έλεγξε: αβέβαιη γραμμή στην κατάσταση" : null }); added++; }
    }
    if (dep && dayKey(dep) !== $("outDay").value) { $("outDay").value = dayKey(dep); await load(); } else render();
    show(msg, "✓ Κατάσταση " + (dep ? fmtGr(dep) : "") + ": " + items.length + " δέματα (" + added + " νέα, " + matched + " υπήρχαν)" + (m.total_declared && m.total_declared !== items.length ? " · ⚠ η κατάσταση γράφει σύνολο " + m.total_declared : "") + ". Τώρα φωτογράφισε τις αποδείξεις στη φόρτωση.", "ok");
  } catch (e) { show(msg, "Η κατάσταση δεν διαβάστηκε: " + String(e.message || e).slice(0, 200), "bad"); }
  finally { busy = false; }
}

// ---------------------------------------------------------------- 2) φωτογραφίες αποδείξεων (φόρτωση)
async function runPhotos(files) {
  if (busy) { show($("outMsg"), "Περίμενε να τελειώσει η προηγούμενη αποστολή.", "warn"); return; }
  if (D.needOperator()) return; busy = true;
  const msg = $("outMsg"), loading = $("outLoading").checked; const fails = [];
  let ok = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      show(msg, "Διαβάζω απόδειξη " + (i + 1) + " από " + files.length + "…", "info");
      try { await onePhoto(files[i], loading); ok++; }
      catch (e) { fails.push((files[i].name || "φωτογραφία " + (i + 1)) + ": " + String(e.message || e).slice(0, 120)); }
      render();
    }
    show(msg, "✓ " + ok + " αποδείξεις" + (loading ? " φορτώθηκαν" : " καταχωρήθηκαν") + (fails.length ? " · ✗ " + fails.length + " απέτυχαν: " + fails.join(" | ") : ""), fails.length ? "warn" : "ok");
  } finally { busy = false; }
}
async function onePhoto(file, loading) {
  const img = await toJpegB64(file, 1600, 0.8);
  const { data, error } = await D.sb.functions.invoke("extract-receipt", { body: { images: [{ data: img, media_type: "image/jpeg" }] } });
  if (error) throw new Error(await errText(error));
  const d = data.data || {}; const o = extractedToOutgoing(d);
  if (!o.receipt_no && !o.parcel_code) { openEdit(null, o); throw new Error("δεν διαβάστηκε αριθμός απόδειξης — συμπλήρωσέ τον στη φόρμα"); }
  const flags = (d.unsure || []).filter(u => ["receipt_no", "phone", "fare_eur", "recipient", "destination_city"].includes(u));
  const note = flags.length ? "⚠ Έλεγξε: " + flags.map(f => ({ receipt_no: "αριθμό", phone: "τηλέφωνο", fare_eur: "κόμιστρο", recipient: "παραλήπτη", destination_city: "προορισμό" }[f])).join(", ") : null;
  const ex = await findExisting(o);
  let r;
  if (ex) r = await save(ex.id, { ...fillBlanks(ex, o), photographed: true, ...(loading && ex.status === "waiting" ? loadedPatch() : {}), ...(note && !ex.notes ? { notes: note } : {}) });
  else r = await save(null, { ...o, photographed: true, status: loading ? "loaded" : "waiting", ...(loading ? loadedPatch() : {}), operator: D.operator() || null, notes: note, extraction_confidence: { unsure: d.unsure || [] } });
  // πελάτες: αποστολέας → καρτέλα πελάτη· τηλέφωνο παραλήπτη από γνωστό πελάτη (μόνο αν υπάρχει ΕΝΑΣ με τηλέφωνο)
  if (r.sender_name && !r.customer_id) { const cid = await D.linkCustomer(r.sender_name, r.sender_phone); if (cid) r = await save(r.id, { customer_id: cid }); }
  if (!r.recipient_phone && r.recipient_name) { const list = (await D.findCustomers(r.recipient_name)).filter(c => (c.phones || []).length); if (list.length === 1) r = await save(r.id, { extraction_confidence: { ...(r.extraction_confidence || {}), phone_hint: list[0].phones[0] } }); }
  return r;
}
async function errText(error) { try { const j = await error.context.json(); return j.detail || j.error || error.message; } catch { return error.message; } }

// ---------------------------------------------------------------- λίστα ανά δρομολόγιο
function render() {
  const list = $("outList"); list.textContent = "";
  const src = found || [...rows.values()];
  $("outCount").textContent = found ? found.length + " αποτελέσματα (όλες οι ημέρες)" : src.filter(r => r.status !== "cancelled").length + " εξερχόμενα · " + money(outCash(src, 0).fares) + " κόμιστρα";
  if (!src.length) { list.append(el("div", "hint", found ? "Δεν βρέθηκε τίποτα." : "Κανένα εξερχόμενο αυτή την ημέρα. Ανέβασε την κατάσταση δρομολογίου ή φωτογράφισε αποδείξεις.")); return; }
  const groups = new Map();
  for (const r of src) { const k = found ? dayKey(r.departure_at || r.created_at) + (r.departure_at ? " " + hhmm(r.departure_at) : "") : (r.departure_at ? hhmm(r.departure_at) : "—"); const g = groups.get(k) || []; g.push(r); groups.set(k, g); }
  const keys = [...groups.keys()].sort((a, b) => (a === "—") - (b === "—") || (found ? b.localeCompare(a) : a.localeCompare(b)));
  for (const k of keys) {
    const g = groups.get(k).sort((a, b) => (a.destination_city || "").localeCompare(b.destination_city || "") || (a.recipient_name || "").localeCompare(b.recipient_name || ""));
    const live = g.filter(r => r.status !== "cancelled"); const chk = outCheck(g);
    const dests = [...new Set(live.map(r => r.destination_city || "?"))].map(d => d + " ×" + live.filter(r => (r.destination_city || "?") === d).length).join(", ");
    const sec = el("section", "outtrip"); const head = el("div", "outhead");
    head.append(el("b", null, (k === "—" ? "Χωρίς ώρα αναχώρησης" : (found ? k : "Αναχώρηση " + k))), el("span", "hint", " · " + dests));
    const badges = el("div", "outbadges");
    badges.append(el("span", "badge", live.filter(r => r.status === "loaded").length + "/" + live.length + " φορτώθηκαν"));
    if (live.some(r => r.in_report)) badges.append(el("span", "badge ok", "📄 " + live.filter(r => r.in_report).length + " στην κατάσταση"));
    if (chk.noPhoto.length) badges.append(el("span", "badge bad", "⚠ " + chk.noPhoto.length + " στην κατάσταση χωρίς φωτογραφία"));
    if (chk.notInReport.length && live.some(r => r.in_report)) badges.append(el("span", "badge warn", "⚠ " + chk.notInReport.length + " εκτός κατάστασης"));
    head.append(badges);
    const acts = el("div", "outacts");
    const waiting = live.filter(r => r.status === "waiting");
    if (waiting.length && !found) acts.append(btn("✓ Φορτώθηκαν όλα (" + waiting.length + ")", "", async () => { for (const r of waiting) await save(r.id, loadedPatch()).catch(() => {}); render(); }));
    const smsList = live.filter(canSms);
    if (smsList.length && !found) acts.append(btn("📩 SMS στους παραλήπτες (" + smsList.length + ")", "", async e => { e.target.disabled = true; let n = 0; for (const r of smsList) if (await sendSms(r, true)) n++; show($("outMsg"), "📩 Στάλθηκαν " + n + " από " + smsList.length + " SMS.", n === smsList.length ? "ok" : "warn"); render(); }));
    if (acts.childNodes.length) head.append(acts);
    sec.append(head);
    for (const r of g) sec.append(card(r));
    list.append(sec);
  }
}
const smsOn = () => D.settings().sms_enabled === true;
const canSms = r => smsOn() && r.status === "loaded" && !r.sms_sent_at && /^69\d{8}$/.test(r.recipient_phone || "");
function card(r) {
  const c = el("article", "outcard st-" + r.status);
  const top = el("div", "outtop");
  top.append(el("b", null, r.recipient_name || "— χωρίς όνομα —"), el("span", "chip st", STATUS[r.status] || r.status));
  if (r.in_report && !r.photographed) top.append(el("span", "badge bad", "χωρίς φωτογραφία"));
  if (r.photographed && !r.in_report) top.append(el("span", "badge warn", "εκτός κατάστασης"));
  c.append(top);
  const info = el("div", "outinfo");
  const add = (l, v) => { if (v == null || v === "") return; const x = el("div", "line"); x.append(el("span", "lbl", l), el("span", null, v)); info.append(x); };
  add("Προορισμός", r.destination_city); add("Απόδειξη", r.receipt_no + (r.parcel_code && !/\(/.test(r.receipt_no || "") ? " · " + r.parcel_code : ""));
  add("Κόμιστρο", r.fare_eur != null ? money(r.fare_eur) + (r.pieces > 1 ? " · " + r.pieces + " τεμ." : "") : "⚠ λείπει");
  add("Αναχώρηση", r.departure_at ? fmtGr(r.departure_at) : null); add("Αποστολέας", [r.sender_name, r.sender_phone ? fmtPhone(r.sender_phone) : ""].filter(Boolean).join(" · "));
  add("Τηλ. παραλήπτη", r.recipient_phone ? fmtPhone(r.recipient_phone) + (r.sms_sent_at ? " · 📩 SMS " + fmtGr(r.sms_sent_at) : "") : null);
  add("Υπάλληλος", r.operator); add("Παρατηρήσεις", r.notes);
  c.append(info);
  const hint = r.extraction_confidence && r.extraction_confidence.phone_hint;
  if (!r.recipient_phone && hint) {
    const w = el("div", "msg info sugg"); w.append("📇 Μήπως το τηλέφωνο του παραλήπτη είναι ", el("b", null, fmtPhone(hint)), "; ");
    w.append(btn("Ναι", "primary", () => save(r.id, { recipient_phone: hint }).then(render)), " ", btn("Όχι", "", () => save(r.id, { extraction_confidence: { ...r.extraction_confidence, phone_hint: null } }).then(render)));
    c.append(w);
  }
  const a = el("div", "outacts");
  if (r.status === "waiting") a.append(btn("✓ Φορτώθηκε", "primary", () => save(r.id, loadedPatch()).then(render)), btn("✗ Δεν φορτώθηκε", "", () => save(r.id, { status: "not_loaded", status_at: new Date().toISOString() }).then(render)));
  else if (r.status !== "cancelled") a.append(btn("↺ Περιμένει", "", () => save(r.id, { status: "waiting", loaded_at: null, status_at: new Date().toISOString() }).then(render)));
  if (canSms(r)) a.append(btn("📩 SMS παραλήπτη", "", async () => { await sendSms(r, false); render(); }));
  a.append(btn("✎ Επεξεργασία", "", () => openEdit(r)));
  c.append(a);
  return c;
}
async function sendSms(r, quiet) {
  const text = outSmsFor(r);
  const { error } = await D.sb.functions.invoke("send-sms", { body: { phone: r.recipient_phone, text } });
  if (error) { if (!quiet) show($("outMsg"), "Το SMS δεν στάλθηκε: " + await errText(error), "bad"); return false; }
  await save(r.id, { sms_sent_at: new Date().toISOString() }).catch(() => {});
  if (!quiet) show($("outMsg"), "📩 Στάλθηκε: «" + text + "»", "ok");
  return true;
}

// ---------------------------------------------------------------- επεξεργασία / χειροκίνητη καταχώρηση
const F = ["receipt_no", "parcel_code", "recipient_name", "recipient_phone", "sender_name", "sender_phone", "destination_city", "fare_eur", "pieces", "notes"];
function openEdit(r, draft) {
  editing = r; const v = r || draft || {};
  for (const f of F) $("o_" + f).value = v[f] ?? "";
  $("o_departure").value = v.departure_at ? fmtGr(v.departure_at) : "";
  $("o_status").value = v.status || ($("outLoading").checked ? "loaded" : "waiting");
  $("outDel").hidden = $("outVoid").hidden = !r; delete $("outDel").dataset.sure; $("outDel").textContent = "Διαγραφή";
  $("outFormMsg").hidden = true; $("outDlgTitle").textContent = r ? "Εξερχόμενο · " + (r.receipt_no || "") : "Νέο εξερχόμενο";
  $("outDlg").showModal();
}
async function saveEdit(forceStatus) {
  if (D.needOperator()) return;
  const p = {}; for (const f of F) { const x = $("o_" + f).value.trim(); p[f] = x === "" ? null : x; }
  p.recipient_name = p.recipient_name ? norm(p.recipient_name) : null; p.sender_name = p.sender_name ? norm(p.sender_name) : null;
  p.destination_city = p.destination_city ? norm(p.destination_city) : null;
  p.recipient_phone = p.recipient_phone ? cleanPhone(p.recipient_phone) || p.recipient_phone : null; p.sender_phone = p.sender_phone ? cleanPhone(p.sender_phone) || p.sender_phone : null;
  p.fare_eur = p.fare_eur == null ? null : Number(String(p.fare_eur).replace(",", ".")); p.pieces = Math.max(1, Number(p.pieces) || 1);
  if (p.fare_eur != null && isNaN(p.fare_eur)) { show($("outFormMsg"), "Το κόμιστρο πρέπει να είναι αριθμός.", "bad"); return; }
  const dep = $("o_departure").value.trim(); p.departure_at = dep ? parseGrDate(dep)?.toISOString() || null : null;
  if (dep && !p.departure_at) { show($("outFormMsg"), "Γράψε την αναχώρηση σαν 04/11/2026 13:00.", "bad"); return; }
  if (!p.receipt_no && !p.parcel_code) { show($("outFormMsg"), "Χρειάζεται αριθμός απόδειξης ή κωδικός δέματος.", "bad"); return; }
  const st = forceStatus || $("o_status").value;
  if (!editing || st !== editing.status) { p.status = st; p.status_at = new Date().toISOString(); if (st === "loaded") p.loaded_at = new Date().toISOString(); }
  try {
    if (!editing) { const ex = await findExisting(p); if (ex) { show($("outFormMsg"), "Υπάρχει ήδη (" + (ex.recipient_name || ex.receipt_no) + "). Άνοιξέ το από τη λίστα.", "bad"); return; } p.operator = D.operator() || null; }
    let r = await save(editing ? editing.id : null, p);
    if (r.sender_name && (!editing || editing.sender_name !== r.sender_name || editing.sender_phone !== r.sender_phone)) { const cid = await D.linkCustomer(r.sender_name, r.sender_phone); if (cid && cid !== r.customer_id) r = await save(r.id, { customer_id: cid }); }
    $("outDlg").close(); render();
  } catch (e) { show($("outFormMsg"), "Δεν αποθηκεύτηκε: " + (e.code === "23505" ? "υπάρχει ήδη εξερχόμενο με αυτόν τον αριθμό." : e.message), "bad"); }
}
async function delEdit() {
  const b = $("outDel"); if (!editing) return;
  if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Σίγουρα; Πάτα ξανά"; return; }
  const { error } = await D.sb.from("outgoing").delete().eq("id", editing.id);
  if (error) { show($("outFormMsg"), "Δεν διαγράφηκε: " + error.message, "bad"); return; }
  rows.delete(editing.id); if (found) found = found.filter(x => x.id !== editing.id);
  $("outDlg").close(); render();
}

// ---------------------------------------------------------------- ταμείο εξερχομένων
function toggleCash() { const b = $("outCashBox"); b.hidden = !b.hidden; if (!b.hidden) renderCash(); }
function renderCash() {
  const box = $("outCashBox"); box.textContent = "";
  const pct = Number((D.settings().out_rates || {}).commission_pct ?? 18);
  const dayRows = [...rows.values()];
  const k = outCash(dayRows, pct);
  box.append(el("h3", null, "💶 Ταμείο εξερχομένων · " + new Date($("outDay").value + "T12:00").toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" })));
  const t = el("table", "cash"); const tr = (a, b, strong) => { const x = el("tr"); x.append(el("td", null, a)); const v = el("td", "num", b); if (strong) v.style.fontWeight = "700"; x.append(v); t.append(x); };
  tr("Εξερχόμενα (χωρίς ακυρωμένα)", String(k.count)); tr("Τεμάχια", String(k.pieces)); tr("Σύνολο κομίστρων", money(k.fares));
  tr("Προμήθεια " + pct + "%", money(k.commission), true);
  box.append(t);
  if (k.noFare) box.append(el("div", "msg warn", "⚠ " + k.noFare + " εξερχόμενα χωρίς κόμιστρο — δεν μετράνε στο σύνολο. Συμπλήρωσέ τα."));
  const tbl = (title, arr) => { if (!arr.length) return; box.append(el("h4", null, title)); const x = el("table", "cash"); for (const g of arr) { const r = el("tr"); r.append(el("td", null, g.key), el("td", "num", g.count + " δέμ."), el("td", "num", money(g.fares)), el("td", "num", money(Math.round(g.fares * pct) / 100))); x.append(r); } box.append(x); };
  tbl("Ανά προορισμό", k.byDest); tbl("Ανά υπάλληλο", k.byOp);
  const pr = el("div", "toolbar"); const inp = el("input"); inp.type = "number"; inp.step = "0.1"; inp.min = "0"; inp.max = "100"; inp.value = String(pct); inp.style.maxWidth = "110px"; inp.setAttribute("aria-label", "Ποσοστό προμήθειας %");
  pr.append(el("span", "hint", "Ποσοστό προμήθειας %: "), inp, btn("Αποθήκευση ποσοστού", "", async () => {
    const v = Number(inp.value); if (!(v >= 0 && v <= 100)) return;
    const rates = { ...(D.settings().out_rates || {}), commission_pct: v };
    const { error } = await D.sb.from("app_settings").update({ out_rates: rates }).eq("id", 1);
    if (!error) { D.settings().out_rates = rates; renderCash(); render(); }
  }));
  box.append(pr);
  box.append(el("div", "hint", "Μετράνε τα εξερχόμενα με αναχώρηση (ή έκδοση) την επιλεγμένη ημέρα. Όταν μου δώσεις τα ακριβή ποσοστά ανά είδος, θα μπουν εδώ αναλυτικά."));
}
