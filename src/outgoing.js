// ΕΞΕΡΧΟΜΕΝΑ δέματα — εντελώς ξεχωριστά από τα εισερχόμενα (δικός τους πίνακας, δική τους καρτέλα).
// Ροή: 1) «📄 Κατάσταση δρομολογίου» από το σύστημα ΚΤΕΛ → γραμμές «περιμένει»
//      2) στη φόρτωση «📷 Φωτογραφίες αποδείξεων» → συμπληρώνονται στοιχεία + «φορτώθηκε»
//      3) ο έλεγχος δείχνει: στην κατάσταση χωρίς φωτογραφία / φωτογραφία εκτός κατάστασης.
import { cashReconcile, routeOf, isAgrinioReceipt, norm, fmtGr, fmtPhone, cleanPhone, money, parseGrDate, cityFromStation, extractedToOutgoing, sameOutgoing, fillBlanks, outCheck, outCash, outSmsFor, surnameFirst } from "./lib.js";
import { toJpegB64 } from "./capture.js";
import { getWorker, find228, grabBand, sound } from "./scan.js";

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
let reports = new Map(); // id → κατάσταση δρομολογίου (για να ξέρουμε ποιο λεωφορείο)
let busy = false, active = false, editing = null, destFilter = "", tripSel = "";

export function initOutgoing(deps) {
  D = deps; initScanner();
  $("outDay").value = dayKey(new Date());
  $("outTrip").onchange = () => { tripSel = $("outTrip").value; render(); };
  $("outDay").onchange = () => { found = null; destFilter = ""; tripSel = ""; $("outQ").value = ""; load(); };
  let qT = null; $("outQ").oninput = () => { clearTimeout(qT); qT = setTimeout(search, 300); };
  $("outPhotos").onchange = e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) runPhotos(f); };
  $("outReport").onchange = e => { const f = [...e.target.files].slice(0, 4); e.target.value = ""; if (f.length) runReport(f); };
  $("outManual").onclick = () => openEdit(null);
  $("outCashBtn").onclick = toggleCash;
  $("outCashClose").onchange = e => { const f = [...e.target.files].slice(0, 12); e.target.value = ""; if (f.length) runCashClose(f); };
  $("outScanAll").onclick = () => openScanner(tripSel || "");
  $("outForm").onsubmit = e => { e.preventDefault(); saveEdit(); };
  $("outCancel").onclick = () => $("outDlg").close();
  $("outDel").onclick = delEdit;
  $("outVoid").onclick = () => saveEdit("cancelled");
  D.sb.channel("outgoing-live").on("postgres_changes", { event: "*", schema: "public", table: "outgoing" }, ev => {
    if (ev.eventType === "DELETE") rows.delete(ev.old.id);
    else if (inDay(ev.new)) rows.set(ev.new.id, ev.new); else rows.delete(ev.new.id);
    if (active) { if (ev.new && ev.new.report_id && !reports.has(ev.new.report_id)) loadReports([ev.new]).then(render); else render(); }
  }).subscribe();
}
// ---------------------------------------------------------------- ⏰ 10′ πριν φύγει κάθε δρομολόγιο: έλεγχος κατάστασης
const REMIND = 10;
let soon = []; // [{key, label, dep, rows}]
async function depTick() {
  if (!D || document.getElementById("app").hidden) return;
  const now = Date.now(), from = new Date(now - 60e3).toISOString(), to = new Date(now + (REMIND + 1) * 60e3).toISOString();
  const { data, error } = await D.sb.from("outgoing").select("*").gte("departure_at", from).lte("departure_at", to).neq("status", "cancelled").limit(500);
  if (error) return;
  await loadReports(data || []);
  const g = new Map();
  for (const r of data || []) {
    const rep = r.report_id && reports.get(r.report_id); const end = rep ? rep.route.end : (r.destination_city || "—");
    const key = hhmm(r.departure_at) + "|" + end; const x = g.get(key) || { key, label: end + " " + hhmm(r.departure_at), dep: r.departure_at, rows: [], report: false };
    x.rows.push(r); if (r.in_report) x.report = true; g.set(key, x);
  }
  soon = [...g.values()].filter(x => (new Date(x.dep) - now) / 60e3 <= REMIND && new Date(x.dep) - now > -30e3).sort((a, b) => new Date(a.dep) - new Date(b.dep));
  let fired = false;
  for (const x of soon) {
    const k = "outN:" + dayKey(x.dep) + ":" + x.key; let seen = ""; try { seen = localStorage.getItem(k) || ""; } catch { /* */ }
    if (seen) continue; try { localStorage.setItem(k, "1"); } catch { /* */ } fired = true;
    D.sysNotify("⏰ Σε " + Math.max(0, Math.round((new Date(x.dep) - now) / 60e3)) + "′ φεύγει " + x.label, summary(x) + " — έλεγξε την κατάσταση.", k);
  }
  if (fired) { D.beep(); try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 300]); } catch { /* */ } }
  renderSoon();
}
// αν οι φωτογραφίες είχαν γίνει ΠΡΙΝ ανέβει η κατάσταση: δείξε αμέσως τι λείπει
function missAfterReport(dep) {
  const tr = [...rows.values()].filter(r => r.departure_at === dep); if (!tr.some(r => r.photographed)) return "";
  const ms = missingOf(tr); return ms.length ? "\n❌ ΛΕΙΠΟΥΝ από τη φόρτωση (" + ms.length + "): " + missText(ms, 20) : "\n✓ Όλα τα δέματα της κατάστασης έχουν φορτωθεί.";
}
// ΛΕΙΠΟΥΝ από τη φόρτωση: είναι στην κατάσταση αλλά δεν σημειώθηκαν «Φορτώθηκε»
const missingOf = rows => rows.filter(r => r.in_report && r.status === "waiting");
const missText = (m, max = 6) => m.slice(0, max).map(r => (r.recipient_name || r.receipt_no || "?") + " → " + (r.destination_city || "?") + (r.pieces > 1 ? " (" + r.pieces + " τεμ.)" : "")).join(" · ") + (m.length > max ? " · +" + (m.length - max) : "");
function summary(x) {
  const c = outCheck(x.rows), w = x.rows.filter(r => r.status === "waiting");
  const ms = missingOf(x.rows);
  return pcs(x.rows) + " τεμ." + (ms.length ? " · ❌ ΛΕΙΠΟΥΝ: " + missText(ms, 4) : w.length ? " · " + pcs(w) + " περιμένουν" : " · όλα φορτώθηκαν") + (!x.report ? " · ⚠ δεν έχει ανέβει κατάσταση" : c.noPhoto.length ? " · ⚠ " + c.noPhoto.length + " χωρίς φωτογραφία" : "") + (x.report && c.notInReport.length ? " · ⚠ " + c.notInReport.length + " εκτός κατάστασης" : "");
}
function renderSoon() {
  const tab = $("modeOut"); if (tab) tab.textContent = "📤 Εξερχόμενα" + (soon.length ? " ⏰" + soon.length : "");
  const box = $("outAlerts"); if (!box) return; box.textContent = "";
  for (const x of soon) {
    const m = Math.round((new Date(x.dep) - Date.now()) / 60e3);
    const d = el("div", "msg warn fwdalert"); d.append(el("b", null, "⏰ " + (m > 0 ? "Σε " + m + "′ φεύγει " : "Φεύγει τώρα ") + x.label), " · " + summary(x) + " ");
    d.append(btn("Άνοιξε το δρομολόγιο", "primary", () => { D.setMode("out"); $("outDay").value = dayKey(new Date()); found = null; $("outQ").value = ""; destFilter = ""; tripSel = x.key; load(); }));
    box.append(d);
  }
}
setInterval(depTick, 30000); setTimeout(depTick, 5000);

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
  rows = new Map((data || []).map(r => [r.id, r]));
  await loadReports([...rows.values()]); render();
  if ($("outCashBox").hidden === false) renderCash();
}
async function loadReports(list) {
  const ids = [...new Set(list.map(r => r.report_id).filter(id => id && !reports.has(id)))];
  if (!ids.length) return;
  const { data } = await D.sb.from("outgoing_reports").select("id,departure_at,items").in("id", ids);
  for (const rep of data || []) { const items = (rep.items || []).filter(i => isAgrinioReceipt(i.receipt_no)); reports.set(rep.id, { ...rep, route: routeOf(items.map(i => i.destination_city)) }); }
}
async function search() {
  const s = $("outQ").value.trim(); if (s.length < 2) { found = null; render(); return; }
  const k = s.replace(/[,()%]/g, " ").trim(), d = s.replace(/\D/g, "");
  const ors = [`recipient_name.ilike.%${norm(k)}%`, `sender_name.ilike.%${norm(k)}%`, `parcel_code.ilike.%${k}%`, `destination_city.ilike.%${norm(k)}%`];
  if (d.length >= 4) ors.push(`receipt_no.ilike.%${d.slice(-6)}%`, `recipient_phone.ilike.%${d}%`, `sender_phone.ilike.%${d}%`);
  const { data } = await D.sb.from("outgoing").select("*").or(ors.join(",")).order("created_at", { ascending: false }).limit(100);
  found = data || []; await loadReports(found); render();
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
    const m = data.data || {}; const dep = parseGrDate(m.departure)?.toISOString() || null;
    const all = (m.items || []).filter(i => i.receipt_no); const items = all.filter(i => isAgrinioReceipt(i.receipt_no)); const skipped = all.length - items.length;
    if (!items.length) { show(msg, skipped ? "Καμία γραμμή της κατάστασης δεν ξεκινά με 228 (αποθήκη Αγρινίου) — δεν καταχωρήθηκε τίποτα." : "Δεν βρήκα γραμμές στην κατάσταση. Τράβα πιο καθαρά ή σε περισσότερες σελίδες.", "warn"); return; }
    const rep = await D.sb.from("outgoing_reports").insert({ departure_at: dep, total_declared: m.total_declared ?? null, items, operator: D.operator() || null }).select("id").single();
    if (rep.data) reports.set(rep.data.id, { id: rep.data.id, departure_at: dep, items, route: routeOf(items.map(i => i.destination_city)) });
    let added = 0, matched = 0, ticked = 0;
    for (const it of items) {
      const tk = it.checked === true; if (tk) ticked++; // ✓ με στυλό = καταχωρήθηκε & φορτώθηκε
      const o = { receipt_no: it.receipt_no, recipient_name: it.recipient ? surnameFirst(it.recipient) : null, destination_city: cityFromStation(it.destination_city) || null,
        fare_eur: it.fare_eur, pieces: it.pieces || 1, departure_at: dep };
      const ex = await findExisting(o);
      if (ex) { await save(ex.id, { ...fillBlanks(ex, o), in_report: true, report_id: rep.data?.id || null, ...(tk && ex.status === "waiting" ? loadedPatch() : {}) }); matched++; }
      else { await save(null, { ...o, in_report: true, report_id: rep.data?.id || null, status: "waiting", ...(tk ? loadedPatch() : {}), operator: D.operator() || null, notes: it.unsure ? "⚠ Έλεγξε: αβέβαιη γραμμή στην κατάσταση" : null }); added++; }
    }
    if (dep && dayKey(dep) !== $("outDay").value) { $("outDay").value = dayKey(dep); await load(); } else render();
    show(msg, "✓ Κατάσταση " + (dep ? fmtGr(dep) : "") + ": " + items.length + " δέματα (" + added + " νέα, " + matched + " υπήρχαν)" + (skipped ? " · παραλείφθηκαν " + skipped + " που δεν ξεκινούν με 228" : "") + (ticked ? " · ✓ " + ticked + " τσεκαρισμένα → «Φορτώθηκε»" + (ticked < items.length ? ", " + (items.length - ticked) + " χωρίς τσεκ → «Περιμένει»" : "") : "") + (m.total_declared && m.total_declared !== all.length ? " · ⚠ η κατάσταση γράφει σύνολο " + m.total_declared : "") + ". Τώρα φωτογράφισε τις αποδείξεις στη φόρτωση." + missAfterReport(dep), "ok");
  } catch (e) { show(msg, "Η κατάσταση δεν διαβάστηκε: " + String(e.message || e).slice(0, 200), "bad"); }
  finally { busy = false; }
}

// ---------------------------------------------------------------- 2) φωτογραφίες αποδείξεων (φόρτωση)
async function runPhotos(files) {
  if (busy) { show($("outMsg"), "Περίμενε να τελειώσει η προηγούμενη αποστολή.", "warn"); return; }
  if (D.needOperator()) return; busy = true;
  const msg = $("outMsg"), loading = $("outLoading").checked; const fails = [];
  let ok = 0; const deps = new Set();
  try {
    for (let i = 0; i < files.length; i++) {
      show(msg, "Διαβάζω απόδειξη " + (i + 1) + " από " + files.length + "…", "info");
      try { const r = await onePhoto(files[i], loading); ok++; if (r && r.departure_at) deps.add(r.departure_at); }
      catch (e) { fails.push((files[i].name || "φωτογραφία " + (i + 1)) + ": " + String(e.message || e).slice(0, 120)); }
      render();
    }
    // έλεγχος με την κατάσταση: ποια δέματα του ίδιου δρομολογίου ΔΕΝ φωτογραφήθηκαν/φορτώθηκαν ακόμα
    const ms = missingOf([...rows.values()].filter(r => r.departure_at && deps.has(r.departure_at)));
    show(msg, "✓ " + ok + " αποδείξεις" + (loading ? " φορτώθηκαν" : " καταχωρήθηκαν") + (fails.length ? " · ✗ " + fails.length + " απέτυχαν: " + fails.join(" | ") : "")
      + (ms.length ? "\n❌ ΛΕΙΠΟΥΝ από τη φόρτωση (" + ms.length + "): " + missText(ms, 20) : deps.size && [...rows.values()].some(r => r.in_report && deps.has(r.departure_at)) ? "\n✓ Φορτώθηκαν όλα τα δέματα της κατάστασης." : ""),
      ms.length ? "bad" : fails.length ? "warn" : "ok");
    if (ms.length) { D.beep && D.beep(); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch { /* */ } }
  } finally { busy = false; }
}
async function onePhoto(file, loading) {
  const img = await toJpegB64(file, 1600, 0.8);
  const { data, error } = await D.sb.functions.invoke("extract-receipt", { body: { images: [{ data: img, media_type: "image/jpeg" }] } });
  if (error) throw new Error(await errText(error));
  const d = data.data || {}; const o = extractedToOutgoing(d);
  if (!o.receipt_no && !o.parcel_code) { openEdit(null, o); throw new Error("δεν διαβάστηκε αριθμός απόδειξης — συμπλήρωσέ τον στη φόρμα"); }
  if (!isAgrinioReceipt(o.receipt_no)) throw new Error("η απόδειξη " + (o.receipt_no || "") + " δεν είναι της αποθήκης Αγρινίου (δεν ξεκινά με 228) — δεν καταχωρήθηκε");
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
// χρώμα ανά προορισμό: ίδιο σε όλη την ημέρα (από τα χρώματα πόλεων της εφαρμογής, αλλιώς παλέτα)
const PALETTE = ["#1d4ed8", "#c2410c", "#15803d", "#7c3aed", "#be123c", "#0e7490", "#a16207", "#be185d", "#4d7c0f", "#475569"];
let colorMap = new Map();
const destColor = d => colorMap.get(d || "—") || "#475569";
function buildColors(list) {
  const cc = (D.settings().city_colors) || {}; colorMap = new Map();
  const ds = [...new Set(list.map(r => r.destination_city || "—"))].sort((a, b) => a.localeCompare(b, "el"));
  const used = new Set(ds.map(d => (cc[d] || "").toLowerCase()).filter(Boolean)); // χρώματα πόλεων της εφαρμογής πρώτα
  const free = PALETTE.filter(c => !used.has(c)); let i = 0;
  for (const d of ds) colorMap.set(d, cc[d] || free[i++ % (free.length || 1)] || PALETTE[0]);
}
// δρομολόγιο ενός δέματος (ίδιος κανόνας με τη λίστα, για την ημέρα)
function tripKeyOf(r) {
  const tk = x => x.departure_at ? hhmm(x.departure_at) : "—";
  let rep = r.report_id && reports.get(r.report_id);
  if (!rep && r.departure_at) rep = [...reports.values()].find(x => tk(x) === tk(r) && (x.route.end === r.destination_city || x.route.stops.includes(r.destination_city)));
  return rep ? tk(rep) + "|" + (rep.route.end || "—") : tk(r) + "|" + (r.destination_city || "—");
}
const keyLabel = key => { const [k, d] = key.split("|"); return (d === "—" ? "Χωρίς προορισμό" : d) + " " + (k === "—" ? "(χωρίς ώρα)" : k); };
// πλήθος = τεμάχια (ένα δέμα με 3 κομμάτια μετράει 3)
const pcs = a => a.reduce((s, r) => s + Math.max(1, Number(r.pieces) || 1), 0);
function render() {
  const list = $("outList"); list.textContent = "";
  const all = found || [...rows.values()];
  buildColors(all);
  // πάνω πάνω: οι προορισμοί της ημέρας (πάτα για φίλτρο)
  const bar = $("outDests"); bar.textContent = "";
  if (!found && all.length) {
    const liveAll = all.filter(r => r.status !== "cancelled"); const cnt = new Map();
    for (const r of liveAll) { const d = r.destination_city || "—"; cnt.set(d, (cnt.get(d) || 0) + Math.max(1, Number(r.pieces) || 1)); }
    if (destFilter && !cnt.has(destFilter)) destFilter = "";
    const chip = (label, val) => { const b = el("button", "chip", label); b.type = "button"; if (val) { b.style.borderColor = destColor(val); b.prepend(Object.assign(el("span", "cdot"), { style: "background:" + destColor(val) })); } b.setAttribute("aria-pressed", String(destFilter === val)); b.onclick = () => { destFilter = destFilter === val ? "" : val; render(); }; return b; };
    bar.append(chip("Όλοι οι προορισμοί · " + pcs(liveAll), ""));
    [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "el")).forEach(([d, n]) => bar.append(chip(d + " · " + n, d)));
  }
  const src = !found && destFilter ? all.filter(r => (r.destination_city || "—") === destFilter) : all;
  $("outCount").textContent = found ? found.length + " αποτελέσματα (όλες οι ημέρες)" : pcs(src.filter(r => r.status !== "cancelled")) + " τεμάχια · " + money(outCash(src, 0).fares) + " κόμιστρα";
  if (!src.length) { list.append(el("div", "hint", found ? "Δεν βρέθηκε τίποτα." : "Κανένα εξερχόμενο αυτή την ημέρα. Ανέβασε την κατάσταση δρομολογίου ή φωτογράφισε αποδείξεις.")); return; }
  const groups = new Map();
  // ομάδα = δρομολόγιο (λεωφορείο) όπως στην κατάσταση: π.χ. ΠΑΤΡΑ 13:00 με στάσεις Αιτωλικό, Μεσολόγγι, Αντίρριο, Ναύπακτο.
  // Δέμα χωρίς κατάσταση μπαίνει στο λεωφορείο της ίδιας ώρας που περνά από τον προορισμό του· αλλιώς ομάδα «προορισμός + ώρα».
  const tKey = r => (found ? dayKey(r.departure_at || r.created_at) + " " : "") + (r.departure_at ? hhmm(r.departure_at) : "—");
  const routeKey = rep => tKey(rep) + "|" + (rep.route.end || "—");
  const byTime = new Map(); for (const rep of reports.values()) { const k = tKey(rep); (byTime.get(k) || byTime.set(k, []).get(k)).push(rep); }
  const stopsOf = new Map();
  for (const r of src) {
    let rep = r.report_id && reports.get(r.report_id);
    if (!rep && r.departure_at) rep = (byTime.get(tKey(r)) || []).find(x => x.route.end === r.destination_city || x.route.stops.includes(r.destination_city));
    const k = rep ? routeKey(rep) : tKey(r) + "|" + (r.destination_city || "—");
    if (rep) { const s = stopsOf.get(k) || new Set(); [...rep.route.stops, rep.route.end].forEach(x => s.add(x)); stopsOf.set(k, s); }
    const g = groups.get(k) || []; g.push(r); groups.set(k, g);
  }
  const keys = [...groups.keys()].sort((a, b) => { const [ta, da] = a.split("|"), [tb, db] = b.split("|");
    return (ta.endsWith("—")) - (tb.endsWith("—")) || (found ? tb.localeCompare(ta) : ta.localeCompare(tb)) || (da === "—") - (db === "—") || da.localeCompare(db); });
  // drop-down: κάθε δρομολόγιο ξεχωριστά
  const sel = $("outTrip"); sel.textContent = ""; sel.hidden = !!found || !keys.length;
  const tLabel = key => { const [k, d] = key.split("|"); return (d === "—" ? "Χωρίς προορισμό" : d) + " " + (k.endsWith("—") ? "(χωρίς ώρα)" : k); };
  if (tripSel && !keys.includes(tripSel)) tripSel = "";
  sel.append(new Option("Όλα τα δρομολόγια (" + keys.length + ")", ""));
  for (const key of keys) { const n = pcs(groups.get(key).filter(r => r.status !== "cancelled")); sel.append(new Option(tLabel(key) + " · " + n + " τεμ.", key)); }
  sel.value = tripSel;
  for (const key of keys) {
    if (tripSel && !found && key !== tripSel) continue;
    const [k, dest] = key.split("|");
    const stopList = stopsOf.get(key) ? [...stopsOf.get(key)] : [];
    const order = d => { const i = stopList.indexOf(d); return i < 0 ? 99 : i; };
    const g = groups.get(key).sort((a, b) => order(a.destination_city) - order(b.destination_city) || (a.destination_city || "").localeCompare(b.destination_city || "", "el") || (a.recipient_name || "").localeCompare(b.recipient_name || "", "el"));
    const live = g.filter(r => r.status !== "cancelled"); const chk = outCheck(g);
    const sec = el("section", "outtrip"); const head = el("div", "outhead");
    const title = (dest === "—" ? "Χωρίς προορισμό" : dest) + " " + (k.endsWith("—") ? "· χωρίς ώρα" : k);
    head.append(el("b", "outroute", title), el("span", "hint", " · " + pcs(live) + " τεμ." + (pcs(live) > live.length ? " (" + live.length + " αποδείξεις)" : "")));
    const badges = el("div", "outbadges");
    badges.append(el("span", "badge", pcs(live.filter(r => r.status === "loaded")) + "/" + pcs(live) + " φορτώθηκαν"));
    if (live.some(r => r.in_report)) badges.append(el("span", "badge ok", "📄 " + live.filter(r => r.in_report).length + " στην κατάσταση"));
    if (chk.noPhoto.length) badges.append(el("span", "badge bad", "⚠ " + chk.noPhoto.length + " στην κατάσταση χωρίς φωτογραφία"));
    if (chk.notInReport.length && live.some(r => r.in_report)) badges.append(el("span", "badge warn", "⚠ " + chk.notInReport.length + " εκτός κατάστασης"));
    head.append(badges);
    const ms = missingOf(live);
    if (ms.length && live.some(r => r.photographed)) { // ξεκίνησε η φόρτωση → δείξε ονομαστικά τι λείπει
      const w = el("div", "msg bad missing"); w.append(el("b", null, "❌ Λείπουν από τη φόρτωση (" + pcs(ms) + " τεμ.): "));
      ms.forEach((r, i) => { if (i) w.append(" · "); const a = el("a", null, (r.recipient_name || r.receipt_no || "?") + " → " + (r.destination_city || "?")); a.href = "#out-" + r.id; w.append(a); });
      head.append(w);
    }
    const acts = el("div", "outacts");
    const waiting = live.filter(r => r.status === "waiting");
    if (!found && live.length) acts.append(btn("🔎 Σάρωση φόρτωσης", "primary", () => openScanner(key)));
    if (waiting.length && !found) {
      // επιβεβαίωση όταν υπάρχουν δέματα της κατάστασης που δεν φωτογραφήθηκαν — αλλιώς ο έλεγχος «σωπαίνει» χωρίς λόγο
      const doAll = async () => { for (const r of waiting) await save(r.id, loadedPatch()).catch(() => {}); render(); };
      const b = btn("✓ Φορτώθηκαν όλα (" + pcs(waiting) + " τεμ.)", "", null);
      b.onclick = () => {
        const mm = missingOf(waiting); if (!mm.length || b.dataset.sure) { doAll(); return; }
        b.dataset.sure = "1"; b.className = "btn small danger sure";
        b.textContent = "⚠ Δεν φωτογραφήθηκαν " + mm.length + ": " + missText(mm, 3) + " — Τα είδες να μπαίνουν στο λεωφορείο; Πάτα ξανά για επιβεβαίωση";
        setTimeout(() => { if (b.isConnected && b.dataset.sure) { delete b.dataset.sure; b.className = "btn small"; b.textContent = "✓ Φορτώθηκαν όλα (" + pcs(waiting) + " τεμ.)"; } }, 10000);
      };
      acts.append(b);
    }
    const smsList = live.filter(canSms);
    if (smsList.length && !found) acts.append(btn("📩 SMS στους παραλήπτες (" + smsList.length + ")", "", async e => { e.target.disabled = true; let n = 0; for (const r of smsList) if (await sendSms(r, true)) n++; show($("outMsg"), "📩 Στάλθηκαν " + n + " από " + smsList.length + " SMS.", n === smsList.length ? "ok" : "warn"); render(); }));
    if (acts.childNodes.length) head.append(acts);
    sec.append(head);
    // δεξιά: σύνολο ανά προορισμό (με τη σειρά των στάσεων)· αριστερά: τα δέματα, με χρωματιστή κεφαλίδα ανά προορισμό
    const body = el("div", "outbody"), cards = el("div", "outcards"), sum = el("aside", "outsum");
    const dlist = [...new Set(g.map(r => r.destination_city || "—"))];
    for (const d of dlist) {
      const n = pcs(live.filter(r => (r.destination_city || "—") === d)); const c = destColor(d);
      const line = el("div", "sumrow"); line.style.borderLeftColor = c;
      line.append(el("span", "sumname", d), el("b", "sumn", String(n))); line.querySelector(".sumname").style.color = c; sum.append(line);
      const sh = el("div", "desthead", d + " · " + n); sh.style.background = c; cards.append(sh);
      for (const r of g.filter(x => (x.destination_city || "—") === d)) { const cd = card(r); cd.style.borderLeftColor = c; cards.append(cd); }
    }
    const tot = el("div", "sumrow total"); tot.append(el("span", "sumname", "Σύνολο"), el("b", "sumn", String(pcs(live)))); sum.append(tot);
    body.append(cards, sum); sec.append(body);
    list.append(sec);
  }
}
const smsOn = () => D.settings().sms_enabled === true;
const canSms = r => smsOn() && r.status === "loaded" && !r.sms_sent_at && /^69\d{8}$/.test(r.recipient_phone || "");
function card(r) {
  const c = el("article", "outcard st-" + r.status); c.id = "out-" + r.id;
  const top = el("div", "outtop");
  top.append(el("b", null, r.recipient_name || "— χωρίς όνομα —"), el("span", "chip st", STATUS[r.status] || r.status));
  if (r.in_report && !r.photographed) top.append(el("span", "badge bad", "χωρίς φωτογραφία"));
  if (r.photographed && !r.in_report) top.append(el("span", "badge warn", "εκτός κατάστασης"));
  if (r.in_cash) top.append(el("span", "badge ok", "🧾 ταμείο"));
  c.append(top);
  const info = el("div", "outinfo");
  const add = (l, v) => { if (v == null || v === "") return; const x = el("div", "line"); x.append(el("span", "lbl", l), el("span", null, v)); info.append(x); };
  add("Προορισμός", r.destination_city); add("Απόδειξη", r.receipt_no + (r.parcel_code && !/\(/.test(r.receipt_no || "") ? " · " + r.parcel_code : ""));
  add("Κόμιστρο", r.fare_eur != null ? money(r.fare_eur) + (r.pieces > 1 ? " · " + r.pieces + " τεμ." : "") : "⚠ λείπει");
  add("Αναχώρηση", r.departure_at ? fmtGr(r.departure_at) : null); add("Έκδοση", r.issued_at ? fmtGr(r.issued_at) : null); add("Αποστολέας", [r.sender_name, r.sender_phone ? fmtPhone(r.sender_phone) : ""].filter(Boolean).join(" · "));
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

// ---------------------------------------------------------------- 🧾 ΚΛΕΙΣΙΜΟ ΤΑΜΕΙΟΥ ΚΤΕΛ → αντιπαραβολή
// Φωτογραφίες της αναφοράς «Κλείσιμο Ταμείου» του POS: για κάθε αριθμό απόδειξης συμπληρώνει ώρα έκδοσης,
// αναχώρηση, προορισμό, ποσό· όσα λείπουν από την εφαρμογή μπαίνουν ως νέα· δείχνει όσα δεν είναι στο ταμείο.
async function runCashClose(files) {
  if (busy) { show($("outMsg"), "Περίμενε να τελειώσει η προηγούμενη αποστολή.", "warn"); return; }
  if (D.needOperator()) return; busy = true; const msg = $("outMsg");
  try {
    const probe = await D.sb.from("outgoing").select("in_cash").limit(1);
    if (probe.error) throw new Error("λείπει το 0015 στη βάση — τρέξε πρώτα το 0015_outgoing_cash.sql");
    let head = { date: "", user: "", total_count: null, total_amount: null }; const items = []; const fails = [];
    for (let i = 0; i < files.length; i += 3) {
      show(msg, "Διαβάζω το κλείσιμο ταμείου… σελίδες " + (i + 1) + "–" + Math.min(files.length, i + 3) + " από " + files.length, "info");
      const images = []; for (const f of files.slice(i, i + 3)) images.push({ data: await toJpegB64(f, 2200, 0.85), media_type: "image/jpeg" });
      const { data, error } = await D.sb.functions.invoke("extract-receipt", { body: { mode: "cashclose", images } });
      if (error) { fails.push((i + 1) + "–" + Math.min(files.length, i + 3) + ": " + await errText(error)); continue; }
      const c = data.data || {};
      if (c.date && !head.date) head.date = c.date; if (c.user && !head.user) head.user = c.user;
      if (c.total_count != null && head.total_count == null) head.total_count = c.total_count;
      if (c.total_amount != null && head.total_amount == null) head.total_amount = c.total_amount;
      items.push(...(c.items || []));
    }
    if (!items.length) throw new Error(fails.length ? fails.join(" · ") : "δεν βρήκα γραμμές — μήπως η εφαρμογή στον server είναι παλιά; (ξανά-deploy το extract-receipt)");
    const cd = parseGrDate(head.date || items[0].issued); if (!cd) throw new Error("δεν διάβασα την ημερομηνία του ταμείου");
    const cashDay = dayKey(cd);
    // εξερχόμενα γύρω από την ημέρα του ταμείου (έκδοση/αναχώρηση/καταχώριση −2…+4 μέρες)
    const s = new Date(cd); s.setDate(s.getDate() - 2); const e = new Date(cd); e.setDate(e.getDate() + 5); const S = s.toISOString(), E = e.toISOString();
    const { data: near, error: nerr } = await D.sb.from("outgoing").select("*")
      .or(`and(issued_at.gte.${S},issued_at.lt.${E}),and(departure_at.gte.${S},departure_at.lt.${E}),and(created_at.gte.${S},created_at.lt.${E})`).limit(3000);
    if (nerr) throw nerr;
    const rec = cashReconcile(items, near || []);
    let upd = 0, ins = 0; const errs = [];
    show(msg, "Αντιπαραβολή " + rec.count + " αποδείξεων…", "info");
    for (const { item: it, row: r } of rec.matched) {
      const p = { in_cash: true, cash_date: cashDay };
      const iss = parseGrDate(it.issued); if (iss) p.issued_at = iss.toISOString(); // η ώρα έκδοσης του POS είναι η σωστή
      const dep = parseGrDate(it.departure); if (dep && !r.departure_at) p.departure_at = dep.toISOString();
      const to = cityFromStation(it.to) || norm(it.to); if (to && !r.destination_city) p.destination_city = to;
      if (it.amount != null && r.fare_eur == null) p.fare_eur = it.amount;
      if (it.amount != null && r.fare_eur != null && Math.abs(Number(r.fare_eur) - it.amount) > 0.009 && !String(r.notes || "").includes("ταμείο"))
        p.notes = ((r.notes ? r.notes + " · " : "") + "⚠ Ταμείο: ποσό " + money(it.amount) + " (εδώ " + money(r.fare_eur) + ")");
      try { await save(r.id, p); upd++; } catch (x) { errs.push(it.receipt_no + ": " + x.message); }
    }
    for (const it of rec.added) {
      const iss = parseGrDate(it.issued), dep = parseGrDate(it.departure);
      try { await save(null, { receipt_no: it.receipt_no, issued_at: iss?.toISOString() || null, departure_at: dep?.toISOString() || null,
        destination_city: cityFromStation(it.to) || norm(it.to) || null, fare_eur: it.amount, status: "waiting", in_cash: true, cash_date: cashDay,
        operator: D.operator() || null, notes: "Μόνο στο κλείσιμο ταμείου — δεν σημειώθηκε σε κατάσταση/φόρτωση" + (it.unsure ? " · ⚠ αβέβαιη ανάγνωση" : "") }); ins++; }
      catch (x) { errs.push(it.receipt_no + ": " + x.message); }
    }
    // στην εφαρμογή με έκδοση εκείνη την ημέρα, αλλά όχι στο ταμείο
    const notIn = rec.notInCash.filter(r => dayKey(r.issued_at || r.departure_at || r.created_at) === cashDay && !r.in_cash);
    const sumOk = head.total_amount == null || Math.abs(head.total_amount - rec.amount) < 0.01, cntOk = head.total_count == null || head.total_count === rec.count;
    await D.sb.from("outgoing_cash").insert({ cash_date: cashDay, user_no: head.user || null, total_count: head.total_count, total_amount: head.total_amount,
      read_count: rec.count, read_amount: rec.amount, operator: D.operator() || null,
      summary: { first: rec.first, last: rec.last, gaps: rec.gaps, updated: upd, added: ins, fare_diff: rec.fareDiff.map(x => x.item.receipt_no), not_in_cash: notIn.map(r => r.receipt_no) } });
    if ($("outDay").value !== cashDay) { $("outDay").value = cashDay; found = null; } await load();
    const L = ["🧾 Κλείσιμο ταμείου " + fmtGr(cd).slice(0, 10) + (head.user ? " · χρήστης " + head.user : "") + ": διάβασα " + rec.count + " αποδείξεις, " + money(rec.amount) + "."];
    L.push(cntOk && sumOk ? "✓ Ταιριάζει με το σύνολο της αναφοράς (" + (head.total_count ?? rec.count) + " δέματα, " + money(head.total_amount ?? rec.amount) + ")."
      : "⚠ Η αναφορά γράφει " + (head.total_count ?? "?") + " δέματα / " + (head.total_amount != null ? money(head.total_amount) : "?") + " — λείπουν " + Math.max(0, (head.total_count || 0) - rec.count) + " γραμμές από τις φωτογραφίες.");
    if (rec.gaps.length) L.push("⚠ Δεν διαβάστηκαν οι αριθμοί …" + rec.gaps.slice(0, 15).join(", …") + (rec.gaps.length > 15 ? " (+" + (rec.gaps.length - 15) + ")" : "") + " — ξανατράβηξε εκείνη τη σελίδα και ανέβασέ την (ό,τι υπάρχει ήδη δεν διπλασιάζεται).");
    L.push("✓ Ενημερώθηκαν " + upd + " (ώρα έκδοσης κ.λπ.)" + (ins ? " · ＋ " + ins + " νέα που υπήρχαν μόνο στο ταμείο (χωρίς όνομα — συμπλήρωσε)" : "") + ".");
    if (rec.fareDiff.length) L.push("⚠ Διαφορά ποσού σε " + rec.fareDiff.length + ": " + rec.fareDiff.slice(0, 8).map(x => (x.row.recipient_name || x.item.receipt_no) + " ταμείο " + money(x.item.amount) + " / εδώ " + money(x.row.fare_eur)).join(" · "));
    if (notIn.length) L.push("❌ Στην εφαρμογή αλλά ΟΧΙ στο ταμείο (" + notIn.length + "): " + notIn.slice(0, 10).map(r => (r.recipient_name || "?") + " " + (r.receipt_no || "")).join(" · "));
    if (fails.length || errs.length) L.push("⚠ Σφάλματα: " + [...fails, ...errs].slice(0, 5).join(" · "));
    show(msg, L.join("\n"), cntOk && sumOk && !rec.gaps.length && !notIn.length && !errs.length ? "ok" : "warn");
  } catch (e) { show(msg, "Το κλείσιμο ταμείου δεν διαβάστηκε: " + String(e.message || e).slice(0, 220), "bad"); }
  finally { busy = false; }
}

// ================================================================ 🔎 ΣΑΡΩΣΗ ΦΟΡΤΩΣΗΣ (κείμενο από την κάμερα)
// Περνάς τις αποδείξεις μπροστά στην κάμερα· διαβάζεται ο αριθμός 228-…, σημειώνεται «Φορτώθηκε», μπιπ.
let scan = null; // { key, stream, timer, last, hits:Map, seen:Map }
async function openScanner(key) {
  if (D.needOperator()) return;
  sound.unlock();
  const d = $("scanDlg"); $("scanTitle").textContent = "🔎 Φόρτωση · " + (key ? keyLabel(key) : "όλα τα δρομολόγια");
  $("scanLog").textContent = ""; scanStatus("Ανοίγω την κάμερα…", "info"); d.showModal();
  scan = { key, stream: null, timer: null, hits: new Map(), seen: new Map(), busy: false };
  scanCounters();
  try {
    scan.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    const v = $("scanVideo"); v.srcObject = scan.stream; await v.play();
  } catch (e) { scanStatus("Δεν άνοιξε η κάμερα: " + (e.name === "NotAllowedError" ? "δώσε άδεια κάμερας στον browser." : e.message), "bad"); return; }
  scanStatus("Φορτώνω την ανάγνωση κειμένου… (την πρώτη φορά ~3 MB)", "info");
  try { await getWorker(m => { if (m.status && /load|init/i.test(m.status)) scanStatus("Φορτώνω την ανάγνωση κειμένου… " + Math.round((m.progress || 0) * 100) + "%", "info"); }); }
  catch (e) { scanStatus("Η ανάγνωση κειμένου δεν φόρτωσε: " + e.message, "bad"); return; }
  scanStatus("Βάλε τον «Αρ. Απόδειξης» μέσα στο πλαίσιο.", "info");
  scanLoop();
}
function closeScanner() {
  if (!scan) return;
  clearTimeout(scan.timer); if (scan.stream) scan.stream.getTracks().forEach(t => t.stop());
  $("scanVideo").srcObject = null; scan = null; $("scanDlg").close(); render();
}
function scanStatus(t, c) { const n = $("scanStatus"); n.textContent = t; n.className = "msg " + c; }
function scanLog(t, c) { const li = el("div", "scanline " + c, new Date().toTimeString().slice(0, 8) + " · " + t); $("scanLog").prepend(li); while ($("scanLog").childNodes.length > 30) $("scanLog").lastChild.remove(); }
function scanCounters() {
  const box = $("scanCount"); box.textContent = ""; if (!scan) return;
  const live = [...rows.values()].filter(r => r.status !== "cancelled" && (!scan.key || tripKeyOf(r) === scan.key));
  const ds = [...new Set(live.map(r => r.destination_city || "—"))];
  for (const d of ds) { const a = live.filter(r => (r.destination_city || "—") === d), ok = pcs(a.filter(r => r.status === "loaded")), all = pcs(a);
    const x = el("span", "scanchip" + (ok === all ? " done" : ""), d + " " + ok + "/" + all + (ok === all ? " ✓" : "")); x.style.borderColor = destColor(d); box.append(x); }
  const ok = pcs(live.filter(r => r.status === "loaded")), all = pcs(live);
  box.append(el("b", "scantot" + (ok === all && all ? " done" : ""), "Σύνολο " + ok + "/" + all + (ok === all && all ? " · ✓ ΠΛΗΡΕΣ" : "")));
}
async function scanLoop() {
  if (!scan) return;
  const v = $("scanVideo");
  try {
    const c = grabBand(v, $("scanCanvas"));
    if (c) { const w = await getWorker(); const { data } = await w.recognize(c); if (scan) for (const n of find228(data.text)) await onNumber(n); }
  } catch { /* επόμενο καρέ */ }
  if (scan) scan.timer = setTimeout(scanLoop, 120);
}
// ίδιος αριθμός σε 2 διαδοχικά καρέ = σίγουρη ανάγνωση (3 για αριθμό που ΔΕΝ είναι στη λίστα)
async function onNumber(n) {
  const now = Date.now();
  const last = scan.seen.get(n); if (last && now - last < 4000) return; // ήδη χειρίστηκε πρόσφατα
  const h = (scan.hits.get(n) || 0) + 1; scan.hits.set(n, h); setTimeout(() => scan && scan.hits.delete(n), 2500);
  const r = [...rows.values()].find(x => sameOutgoing(x, { receipt_no: n }));
  if (!r && h < 3) return; if (r && h < 2) return;
  scan.seen.set(n, now); scan.hits.delete(n);
  if (r) {
    const k = tripKeyOf(r);
    if (scan.key && k !== scan.key) { sound.bad(); scanStatus("⚠ ΛΑΘΟΣ ΛΕΩΦΟΡΕΙΟ: " + (r.recipient_name || n) + " είναι για " + keyLabel(k) + " — ΟΧΙ για αυτό!", "bad"); scanLog("⚠ " + n + " · " + (r.recipient_name || "") + " → " + keyLabel(k) + " (άλλο δρομολόγιο)", "bad"); return; }
    if (r.status === "cancelled") { sound.bad(); scanStatus("⚠ " + n + " είναι ΑΚΥΡΩΜΕΝΟ.", "bad"); scanLog("⚠ " + n + " ακυρωμένο", "bad"); return; }
    if (r.status === "loaded") { sound.dup(); scanStatus("Ήδη σαρωμένο: " + (r.recipient_name || n), "info"); return; }
    try { await save(r.id, { ...loadedPatch(), photographed: true }); sound.ok(); scanStatus("✓ " + (r.recipient_name || n) + " → " + (r.destination_city || "?") + (r.pieces > 1 ? " · " + r.pieces + " τεμ." : ""), "ok"); scanLog("✓ " + n + " · " + (r.recipient_name || "") + " → " + (r.destination_city || ""), "ok"); }
    catch (e) { sound.bad(); scanStatus("Δεν αποθηκεύτηκε: " + e.message, "bad"); }
  } else {
    // δεν είναι στη λίστα της ημέρας → μήπως άλλη μέρα; αλλιώς καταχώρηση μόνο με τον αριθμό («εκτός κατάστασης»)
    const ex = await findExisting({ receipt_no: n });
    if (ex) { sound.bad(); scanStatus("⚠ " + n + " είναι καταχωρημένο για " + (ex.departure_at ? fmtGr(ex.departure_at) : "άλλη ημέρα") + " — έλεγξέ το.", "bad"); scanLog("⚠ " + n + " άλλη ημέρα", "bad"); return; }
    const dep = scan.key ? [...rows.values()].find(x => tripKeyOf(x) === scan.key && x.departure_at)?.departure_at || null : null;
    try { await save(null, { receipt_no: n, status: "loaded", ...loadedPatch(), photographed: true, in_report: false, departure_at: dep, operator: D.operator() || null, notes: "Σάρωση: μόνο αριθμός — εκτός κατάστασης, συμπλήρωσε στοιχεία" });
      sound.bad(); scanStatus("⚠ " + n + " ΔΕΝ είναι στην κατάσταση — καταχωρήθηκε μόνο ο αριθμός.", "warn"); scanLog("⚠ " + n + " εκτός κατάστασης", "warn"); }
    catch (e) { scanStatus("Δεν αποθηκεύτηκε: " + e.message, "bad"); }
  }
  scanCounters();
}
export function initScanner() {
  $("scanClose").onclick = closeScanner;
  $("scanDlg").addEventListener("cancel", e => { e.preventDefault(); closeScanner(); });
  $("scanManual").onsubmit = async e => { e.preventDefault(); const v = $("scanNum").value.trim(); const m = find228(v)[0] || (/^\d{6}$/.test(v) ? [...rows.values()].find(x => String(x.receipt_no || "").endsWith(v))?.receipt_no : null);
    $("scanNum").value = ""; if (!m) { scanStatus("Γράψε τον αριθμό σαν 228-336-142206 ή τα 6 τελευταία ψηφία.", "warn"); return; }
    scan.hits.set(m, 5); await onNumber(m); };
}
