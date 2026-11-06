// ΕΞΕΡΧΟΜΕΝΑ δέματα — εντελώς ξεχωριστά από τα εισερχόμενα (δικός τους πίνακας, δική τους καρτέλα).
// Ροή: 1) «📄 Κατάσταση δρομολογίου» από το σύστημα ΚΤΕΛ → γραμμές «περιμένει»
//      2) στη φόρτωση «📷 Φωτογραφίες αποδείξεων» → συμπληρώνονται στοιχεία + «φορτώθηκε»
//      3) ο έλεγχος δείχνει: στην κατάσταση χωρίς φωτογραφία / φωτογραφία εκτός κατάστασης.
import { busesFor, nextBusFor, senderStats, ktelNo, cashReconcile, routeOf, isAgrinioReceipt, norm, fmtGr, fmtPhone, cleanPhone, money, parseGrDate, cityFromStation, extractedToOutgoing, sameOutgoing, fillBlanks, outCheck, outCash, outSmsFor, surnameFirst } from "./lib.js";
import { toJpegB64 } from "./capture.js";
import { SCHEDULE_TIMES, SCHEDULE_LINES } from "./schedule-seed.js";
import { getWorker, getWorkers, find228, grabBand, sound } from "./scan.js";

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
  D = deps; initScanner(); setTimeout(flushQueue, 3000); loadSchedule();
  $("outSchedBtn").onclick = openSchedule; $("schedClose").onclick = () => $("schedDlg").close();
  $("o_destination_city").addEventListener("input", () => { const d = cityFromStation($("o_destination_city").value) || norm($("o_destination_city").value);
    const nb = d ? nextBusFor(sched.times, sched.lines, d, new Date()) : null; $("o_departure").placeholder = nb ? fmtGr(nb.at) + " (επόμενο λεωφορείο)" : "04/11/2026 13:00"; });
  $("outDay").value = dayKey(new Date());
  $("outTrip").onchange = () => { tripSel = $("outTrip").value; render(); };
  $("outDay").onchange = () => { found = null; destFilter = ""; tripSel = ""; $("outQ").value = ""; load(); };
  let qT = null; $("outQ").oninput = () => { clearTimeout(qT); qT = setTimeout(search, 300); };
  $("outPhotos").onchange = e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) runPhotos(f); };
  $("outReport").onchange = e => { const f = [...e.target.files].slice(0, 4); e.target.value = ""; if (f.length) runReport(f); };
  $("outManual").onclick = () => openEdit(null);
  $("outCashBtn").onclick = toggleCash;
  $("outRegBtn").onclick = openRegulars; $("regClose").onclick = () => $("regDlg").close();
  { let t = null; $("regQ").oninput = () => { clearTimeout(t); t = setTimeout(renderRegulars, 200); }; }
  $("outPeople").onchange = e => { const f = [...e.target.files].slice(0, 12); e.target.value = ""; if (f.length) runPeople(f); };
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
  let tt = null;
  D.sb.channel("outgoing-transit").on("postgres_changes", { event: "*", schema: "public", table: "parcels" }, ev => {
    const n = ev.new || {}, o = ev.old || {};
    if (!active || !(n.status === "transit" || n.status === "forwarded" || rows.has("p:" + (n.id || o.id)))) return;
    clearTimeout(tt); tt = setTimeout(load, 1500);
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
    const rep = (r.report_id && reports.get(r.report_id)) || schedReps(dayKey(r.departure_at)).find(x => hhmm(x.departure_at) === hhmm(r.departure_at) && x.members.includes(r.destination_city));
    const end = rep ? rep.route.end : (r.destination_city || "—");
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
const missingOf = rows => rows.filter(r => (r.in_report || r._parcel) && r.status === "waiting");
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

export function showOutgoing(on) { active = on; if (on) { load(); loadStarred(); } }

// ---------------------------------------------------------------- 🚌 ΒΑΣΗ ΔΡΟΜΟΛΟΓΙΩΝ
// Αναχωρήσεις από Αγρίνιο (ktel-aitolnias.gr) + «γραμμές» (ποιοι προορισμοί πάνε με το ίδιο λεωφορείο).
// Χρησιμεύει όταν ΔΕΝ υπάρχει κατάσταση: ομαδοποίηση σε λεωφορεία, στάσεις με σειρά, διερχόμενα στο επόμενο λεωφορείο.
let sched = { times: SCHEDULE_TIMES, lines: SCHEDULE_LINES, fromDb: false };
const schedCache = new Map();
async function loadSchedule() {
  try {
    const [t, l] = await Promise.all([D.sb.from("route_times").select("*"), D.sb.from("route_lines").select("*").order("ord")]);
    if (!t.error && !l.error && (t.data || []).length) sched = { times: t.data, lines: l.data, fromDb: true };
  } catch { /* μένουν τα ενσωματωμένα */ }
  schedCache.clear(); if (active) render();
}
/** Τα λεωφορεία του προγράμματος για μια ημέρα, στη μορφή των «καταστάσεων» (ώστε να ομαδοποιούνται το ίδιο). */
function schedReps(day) {
  if (!day) return [];
  if (schedCache.has(day)) return schedCache.get(day);
  const list = busesFor(sched.times, sched.lines, new Date(day + "T12:00")).map(b => {
    const at = new Date(day + "T00:00"); const [h, m] = b.hhmm.split(":").map(Number); at.setHours(h, m, 0, 0);
    return { id: "s:" + b.hhmm + "|" + b.end, sched: true, departure_at: at.toISOString(), route: { end: b.end, stops: b.stops }, notes: b.notes, line: b.line, members: b.members };
  });
  schedCache.set(day, list); return list;
}
const repsFor = day => [...reports.values(), ...schedReps(day)]; // πρώτα οι πραγματικές καταστάσεις
/** Εξερχόμενα χωρίς ώρα αναχώρησης → το επόμενο λεωφορείο του προγράμματος για τον προορισμό τους (μόνο για εμφάνιση). */
function assignSched() {
  if (found) return;
  const day = $("outDay").value;
  for (const r of rows.values()) {
    if (r._parcel || r.status === "cancelled" || !r.destination_city) continue;
    if (r.departure_at && !r._schedDep) continue;
    const from = new Date(Math.max(new Date(day + "T00:00").getTime(), new Date(r.created_at || Date.now()).getTime()));
    const nb = nextBusFor(sched.times, sched.lines, r.destination_city, from);
    if (nb && dayKey(nb.at) === day) { r.departure_at = nb.at.toISOString(); r._schedDep = true; }
  }
}
let schedView = "day";
function schedSay(t, k) { const m = $("schedMsg"); m.textContent = t; m.className = "msg " + (k || "info"); m.hidden = !t; }
async function schedChanged(t) { await loadSchedule(); schedSay(t || "✓ Αποθηκεύτηκε.", "ok"); }
const DAYN = ["Δ", "Τ", "Τ", "Π", "Π", "Σ", "Κ"], DAYF = ["Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"];
const okTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const normTime = s => { const m = String(s || "").trim().match(/^(\d{1,2})[:.]?(\d{2})$/); return m ? m[1].padStart(2, "0") + ":" + m[2] : ""; };
/** ✎ Αναχωρήσεις: ώρα, ημέρες, σημείωση, express, ενεργό, διαγραφή, νέα. */
function renderTimesEditor() {
  const box = $("schedList"); box.textContent = "";
  const add = el("form", "schedadd"); add.innerHTML = '<b>＋ Νέα αναχώρηση</b>';
  const dI = el("input"); dI.placeholder = "Προορισμός"; dI.setAttribute("list", "cities"); dI.setAttribute("aria-label", "Προορισμός"); dI.autocapitalize = "characters";
  const tI = el("input"); tI.placeholder = "ΩΩ:ΛΛ"; tI.inputMode = "numeric"; tI.setAttribute("aria-label", "Ώρα"); tI.size = 6;
  const dayBox = dayPicker("1111111");
  const sb = el("button", "btn small primary", "Προσθήκη"); sb.type = "submit";
  add.append(dI, tI, dayBox.el, sb);
  add.onsubmit = async e => { e.preventDefault(); const dest = cityFromStation(dI.value) || norm(dI.value), time = normTime(tI.value);
    if (!dest) return schedSay("Γράψε προορισμό.", "warn"); if (!okTime(time)) return schedSay("Η ώρα σαν 09:30.", "warn");
    const { error } = await D.sb.from("route_times").insert({ dest, time, days: dayBox.value(), source: "χειροκίνητα" });
    if (error) return schedSay(/duplicate|23505/.test(error.message + error.code) ? "Υπάρχει ήδη αυτή η αναχώρηση." : "Δεν αποθηκεύτηκε: " + error.message, "bad");
    await schedChanged("✓ Προστέθηκε " + dest + " " + time + "."); renderTimesEditor(); };
  box.append(add);
  const q = el("input", "search"); q.type = "search"; q.placeholder = "Φίλτρο προορισμού"; q.setAttribute("aria-label", "Φίλτρο προορισμού"); q.value = renderTimesEditor.q || "";
  q.oninput = () => { renderTimesEditor.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { renderTimesEditor(); const n = $("schedList").querySelector("input.search"); n && (n.focus(), n.setSelectionRange(n.value.length, n.value.length)); }, 250); };
  box.append(q);
  const f = norm(q.value);
  const byDest = new Map(); for (const t of sched.times) { if (f && !norm(t.dest).includes(f)) continue; const a = byDest.get(t.dest) || []; a.push(t); byDest.set(t.dest, a); }
  for (const [dest, ts] of [...byDest.entries()].sort((a, b) => a[0].localeCompare(b[0], "el"))) {
    const sec = el("details", "schedgroup"); sec.open = !!f; sec.append(el("summary", null, dest + " · " + ts.filter(t => t.active !== false).length + " αναχωρήσεις"));
    for (const t of ts.sort((a, b) => a.time.localeCompare(b.time))) sec.append(timeRow(t));
    box.append(sec);
  }
}
function dayPicker(days) {
  const w = el("span", "daypick"); const cbs = [];
  DAYN.forEach((n, i) => { const l = el("label", "dp"); const c = el("input"); c.type = "checkbox"; c.checked = String(days)[i] === "1"; c.setAttribute("aria-label", DAYF[i]); l.title = DAYF[i]; l.append(c, n); w.append(l); cbs.push(c); });
  return { el: w, cbs, value: () => cbs.map(c => c.checked ? "1" : "0").join("") };
}
function timeRow(t) {
  const row = el("div", "schedrow edit" + (t.active === false ? " past" : ""));
  const tI = el("input", "schedt"); tI.value = t.time; tI.size = 5; tI.inputMode = "numeric"; tI.setAttribute("aria-label", "Ώρα");
  const dp = dayPicker(t.days);
  const nI = el("input", "schednote"); nI.value = t.notes || ""; nI.placeholder = "Σημείωση (π.χ. αλλαγή στη Βόνιτσα)"; nI.setAttribute("aria-label", "Σημείωση");
  const ex = el("label", "dp"); const exC = el("input"); exC.type = "checkbox"; exC.checked = !!t.express; ex.append(exC, " Express");
  const on = btn(t.active === false ? "▶ Ενεργοποίηση" : "⏸ Δεν εκτελείται", "", async () => upd({ active: t.active === false }));
  const del = btn("🗑", "danger", async () => { if (!del.dataset.sure) { del.dataset.sure = "1"; del.textContent = "Σίγουρα;"; return; }
    const { error } = await D.sb.from("route_times").delete().eq("id", t.id); if (error) return schedSay("Δεν διαγράφηκε: " + error.message, "bad"); await schedChanged("✓ Διαγράφηκε " + t.dest + " " + t.time + "."); renderTimesEditor(); });
  del.setAttribute("aria-label", "Διαγραφή");
  async function upd(p) {
    const { error } = await D.sb.from("route_times").update({ ...p, updated_at: new Date().toISOString() }).eq("id", t.id);
    if (error) return schedSay("Δεν αποθηκεύτηκε: " + error.message, "bad");
    await schedChanged("✓ " + t.dest + " " + (p.time || t.time) + " αποθηκεύτηκε."); if ("active" in p) renderTimesEditor();
  }
  tI.onchange = () => { const v = normTime(tI.value); if (!okTime(v)) { tI.value = t.time; return schedSay("Η ώρα σαν 09:30.", "warn"); } tI.value = v; upd({ time: v }); };
  dp.cbs.forEach(c => c.onchange = () => upd({ days: dp.value() }));
  nI.onchange = () => upd({ notes: nI.value.trim() || null });
  exC.onchange = () => upd({ express: exC.checked });
  row.append(tI, dp.el, ex, nI, on, del); return row;
}
/** ✎ Λεωφορεία: ποιοι προορισμοί πάνε μαζί και με ποια σειρά στάσεων. */
function renderLinesEditor() {
  const box = $("schedList"); box.textContent = "";
  box.append(el("p", "hint", "Κάθε γραμμή = ένα λεωφορείο που περνά από αυτές τις στάσεις, με τη σειρά (το τελευταίο είναι το τέρμα). Δέματα για προορισμούς της ίδιας γραμμής που φεύγουν την ίδια ώρα μπαίνουν στο ίδιο λεωφορείο. Αν ένας προορισμός είναι σε δύο γραμμές, μπαίνει σε όποια έχει περισσότερες στάσεις εκείνη την ώρα (σε ισοπαλία: η πιο πάνω). Στο πεδίο «ώρες» γράψε π.χ. 15:00 αν το λεωφορείο ισχύει μόνο τότε — τότε υπερισχύει."));
  sched.lines.forEach((l, i) => {
    const row = el("div", "schedrow edit");
    const nI = el("input", "linename"); nI.value = l.name; nI.setAttribute("aria-label", "Όνομα γραμμής"); nI.size = 12;
    const sI = el("input", "linestops"); sI.value = l.stops.join(", "); sI.setAttribute("aria-label", "Στάσεις με τη σειρά, χωρισμένες με κόμμα");
    const tI = el("input", "linetimes"); tI.value = (l.times || []).join(", "); tI.placeholder = "όλες οι ώρες"; tI.setAttribute("aria-label", "Μόνο αυτές τις ώρες (π.χ. 15:00), κενό = όλες"); tI.size = 10; tI.title = "Αν γράψεις ώρες (π.χ. 15:00), το λεωφορείο ισχύει μόνο τότε και υπερισχύει των άλλων";
    const up = btn("▲", "", () => move(i, -1)); up.setAttribute("aria-label", "Πιο πάνω"); up.disabled = i === 0;
    const del = btn("🗑", "danger", async () => { if (!del.dataset.sure) { del.dataset.sure = "1"; del.textContent = "Σίγουρα;"; return; }
      const { error } = await D.sb.from("route_lines").delete().eq("name", l.name); if (error) return schedSay("Δεν διαγράφηκε: " + error.message, "bad"); await schedChanged("✓ Διαγράφηκε η γραμμή " + l.name + "."); renderLinesEditor(); });
    const save = async () => {
      const stops = sI.value.split(/[,>→]+/).map(s => cityFromStation(s) || norm(s)).filter(Boolean); const name = norm(nI.value) || stops.at(-1);
      if (!stops.length) return schedSay("Βάλε τουλάχιστον μία στάση.", "warn");
      const tms = tI.value.split(/[,\s]+/).filter(Boolean).map(normTime); if (tms.some(x => !okTime(x))) return schedSay("Οι ώρες σαν 15:00, χωρισμένες με κόμμα.", "warn");
      const { error } = await D.sb.from("route_lines").update({ ...(name !== l.name ? { name } : {}), stops, times: tms }).eq("name", l.name);
      if (error) return schedSay("Δεν αποθηκεύτηκε: " + error.message, "bad"); await schedChanged("✓ Γραμμή " + name + ": " + stops.join(" → ")); renderLinesEditor();
    };
    nI.onchange = save; sI.onchange = save; tI.onchange = save;
    row.append(nI, sI, tI, up, del); box.append(row);
  });
  const add = btn("＋ Νέα γραμμή", "primary", async () => {
    const name = "ΝΕΑ " + (sched.lines.length + 1);
    const { error } = await D.sb.from("route_lines").insert({ name, stops: ["ΑΓΡΙΝΙΟ"], ord: sched.lines.length });
    if (error) return schedSay("Δεν προστέθηκε: " + error.message, "bad"); await schedChanged("Γράψε όνομα και στάσεις στη νέα γραμμή (τελευταία)."); renderLinesEditor();
  });
  box.append(add);
  async function move(i, d) {
    const a = sched.lines[i], b = sched.lines[i + d]; if (!a || !b) return;
    await D.sb.from("route_lines").update({ ord: i + d }).eq("name", a.name); await D.sb.from("route_lines").update({ ord: i }).eq("name", b.name);
    await schedChanged("✓ Άλλαξε η σειρά."); renderLinesEditor();
  }
}
function openSchedule() {
  for (const c of document.querySelectorAll("#schedDlg [data-sv]")) { c.setAttribute("aria-pressed", String(c.dataset.sv === schedView)); c.onclick = () => { schedView = c.dataset.sv; schedSay(""); openSchedule(); }; }
  if (schedView !== "day" && !sched.fromDb) { $("schedList").textContent = ""; $("schedSrc").textContent = "";
    schedSay("Για να αλλάζεις τα δρομολόγια, τρέξε πρώτα το 0017_routes.sql στη Supabase (SQL Editor → Run) και πάτα ⟳.", "warn"); if (!$("schedDlg").open) $("schedDlg").showModal(); return; }
  if (schedView === "times") { $("schedSrc").textContent = "Οι αλλαγές αποθηκεύονται μόλις φύγεις από το πεδίο. Ημέρες: Δ Τ Τ Π Π Σ Κ."; renderTimesEditor(); if (!$("schedDlg").open) $("schedDlg").showModal(); return; }
  if (schedView === "lines") { $("schedSrc").textContent = ""; renderLinesEditor(); if (!$("schedDlg").open) $("schedDlg").showModal(); return; }
  const day = $("outDay").value; const box = $("schedList"); box.textContent = "";
  $("schedTitle").textContent = "🚌 Δρομολόγια · " + new Date(day + "T12:00").toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" });
  const counts = new Map(); for (const r of rows.values()) if (r.status !== "cancelled" && r.departure_at) { const k = tripKeyOf(r); counts.set(k, (counts.get(k) || 0) + Math.max(1, Number(r.pieces) || 1)); }
  const now = Date.now();
  for (const rep of schedReps(day)) {
    const k = hhmm(rep.departure_at) + "|" + rep.route.end, n = counts.get(k) || 0, past = new Date(rep.departure_at).getTime() < now - 5 * 60e3;
    const row = el("div", "schedrow" + (past ? " past" : "") + (n ? " has" : ""));
    row.append(el("b", "schedt", hhmm(rep.departure_at)), el("span", "scheddest", rep.members.join(" → ")));
    if (n) row.append(el("span", "badge ok", n + " τεμ."));
    if (rep.notes.length) row.append(el("div", "hint", rep.notes.join(" · ")));
    if (sched.fromDb) {
      const off = btn("Δεν εκτελείται", "", async () => {
        if (!off.dataset.sure) { off.dataset.sure = "1"; off.textContent = "Σίγουρα; Πάτα ξανά"; return; }
        for (const dst of rep.members) await D.sb.from("route_times").update({ active: false, updated_at: new Date().toISOString() }).eq("dest", dst).eq("time", hhmm(rep.departure_at));
        await loadSchedule(); openSchedule();
      }); row.append(off);
    }
    box.append(row);
  }
  if (!box.childNodes.length) box.append(el("p", "hint", "Κανένα δρομολόγιο αυτή την ημέρα."));
  $("schedSrc").textContent = (sched.fromDb ? "Από τη βάση" : "Ενσωματωμένα (τρέξε το 0017 για να αλλάζουν)") + " · αρχική πηγή ktel-aitolnias.gr (6/11/2026). Διόρθωσέ τα από «✎ Αναχωρήσεις» και «✎ Λεωφορεία».";
  if (!$("schedDlg").open) $("schedDlg").showModal();
}

// ---------------------------------------------------------------- ⭐ ΤΑΚΤΙΚΟΙ (αποστολείς)
let starred = new Map(); // customer_id → customer
async function loadStarred() {
  const { data, error } = await D.sb.from("customers").select("id,full_name,phones,is_business,starred,starred_at,notes").eq("starred", true).limit(500);
  if (error) { starred = new Map(); return; }
  starred = new Map((data || []).map(c => [c.id, c])); if (active) render();
}
async function setStar(cid, on) {
  const { data, error } = await D.sb.from("customers").update({ starred: on, starred_at: on ? new Date().toISOString() : null }).eq("id", cid).select("id,full_name,phones,is_business,starred,starred_at,notes").single();
  if (error) { show($("outMsg"), "Δεν σημειώθηκε: " + (/starred/.test(error.message) ? "λείπει το 0016 στη βάση — τρέξε το 0016_regulars.sql" : error.message), "bad"); return; }
  if (on) starred.set(cid, data); else starred.delete(cid);
  render(); if ($("regDlg").open) renderRegulars();
}
async function openRegulars() { $("regQ").value = ""; $("regDlg").showModal(); await loadStarred(); renderRegulars(); }
let regCache = { at: 0, rows: [] };
async function regRows() {
  if (Date.now() - regCache.at < 60e3) return regCache.rows;
  const since = new Date(Date.now() - 365 * 864e5).toISOString();
  const { data } = await D.sb.from("outgoing").select("customer_id,recipient_name,recipient_phone,destination_city,fare_eur,status,created_at,sender_name,sender_phone")
    .not("customer_id", "is", null).gte("created_at", since).order("created_at", { ascending: false }).limit(5000);
  regCache = { at: Date.now(), rows: data || [] }; return regCache.rows;
}
async function renderRegulars() {
  const box = $("regList"); box.textContent = ""; box.append(el("p", "hint", "Φορτώνω…"));
  const all = await regRows(); const q = norm($("regQ").value);
  const by = new Map(); for (const r of all) { const a = by.get(r.customer_id) || []; a.push(r); by.set(r.customer_id, a); }
  box.textContent = "";
  const stars = [...starred.values()].filter(c => !q || norm(c.full_name).includes(q) || (c.phones || []).some(p => p.includes(q.replace(/\D/g, "") || "#")))
    .sort((a, b) => (by.get(b.id)?.length || 0) - (by.get(a.id)?.length || 0) || a.full_name.localeCompare(b.full_name, "el"));
  if (!stars.length) box.append(el("p", "hint", starred.size ? "Κανένας τακτικός με αυτό το όνομα." : "Δεν έχεις ακόμα τακτικούς. Πάτα ☆ δίπλα στον αποστολέα σε μια κάρτα, ή διάλεξε από τις προτάσεις παρακάτω."));
  for (const c of stars) box.append(regCard(c, by.get(c.id) || []));
  // προτάσεις: συχνοί αποστολείς (≥3 τους τελευταίους 2 μήνες) που δεν είναι ακόμα ⭐
  const since = Date.now() - 60 * 864e5;
  const sugg = [...by.entries()].filter(([id]) => !starred.has(id)).map(([id, a]) => ({ id, a, n: a.filter(r => new Date(r.created_at).getTime() > since && r.status !== "cancelled").length }))
    .filter(x => x.n >= 3 && (!q || norm(x.a[0].sender_name).includes(q))).sort((a, b) => b.n - a.n).slice(0, 15);
  if (sugg.length) {
    box.append(el("h3", "regh", "Προτάσεις — στέλνουν συχνά (τελευταίοι 2 μήνες)"));
    for (const s of sugg) { const row = el("div", "regsugg"); row.append(el("span", null, (s.a[0].sender_name || "?") + (s.a[0].sender_phone ? " · " + fmtPhone(s.a[0].sender_phone) : "") + " — " + s.n + " αποστολές"), btn("☆ Τακτικός", "", () => setStar(s.id, true))); box.append(row); }
  }
}
function regCard(c, rows) {
  const s = senderStats(rows), w = el("article", "regcard");
  const h = el("div", "reghead"); h.append(el("b", null, "⭐ " + c.full_name), c.is_business ? el("span", "badge", "🏢 επιχείρηση") : "");
  w.append(h);
  w.append(el("div", "hint", [(c.phones || []).map(fmtPhone).join(" · "), "Αυτόν τον μήνα: " + s.month, "Σύνολο έτους: " + s.count + (s.fares ? " (" + money(s.fares) + ")" : ""), s.last ? "Τελευταία: " + fmtGr(s.last).slice(0, 10) : ""].filter(Boolean).join(" · ")));
  if (s.dests.length) { const d = el("div", "chips"); for (const x of s.dests) { const ch = el("span", "chip", x.k + " " + x.n); ch.style.borderColor = destColor(x.k); d.append(ch); } w.append(d); }
  const base = { sender_name: c.full_name, sender_phone: (c.phones || [])[0] || null };
  const acts = el("div", "outacts");
  acts.append(btn("＋ Νέα αποστολή", "primary", () => { $("regDlg").close(); openEdit(null, base); }));
  acts.append(btn("☆ Αφαίρεση", "", () => setStar(c.id, false)));
  w.append(acts);
  if (s.recipients.length) {
    w.append(el("div", "lbl", "Συχνοί παραλήπτες — πάτα για νέα αποστολή με έτοιμα στοιχεία:"));
    const l = el("div", "regrcp");
    for (const x of s.recipients) { const r = x.r; const b = btn((r.recipient_name || "?") + " → " + (r.destination_city || "?") + (r.recipient_phone ? " · " + fmtPhone(r.recipient_phone) : "") + (x.n > 1 ? " (" + x.n + "×)" : ""), "", () => { $("regDlg").close(); openEdit(null, { ...base, recipient_name: r.recipient_name, recipient_phone: r.recipient_phone, destination_city: r.destination_city }); }); l.append(b); }
    w.append(l);
  }
  return w;
}

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
  for (const t of await loadTransit(S, E)) rows.set(t.id, t);
  await loadDayReports(S, E).catch(() => {});
  for (const x of qGet()) { const r = rows.get(x.id); if (r) rows.set(x.id, { ...r, ...x.patch }); } // φορτώσεις που περιμένουν σήμα
  await loadReports([...rows.values()]); render();
  if ($("outCashBox").hidden === false) renderCash();
}
// ⇄ ΔΙΕΡΧΟΜΕΝΑ: δέματα των εισερχομένων με «Μεταφόρτωση» → μπαίνουν στο λεωφορείο που περνά από τον προορισμό τους.
// Όταν φορτωθούν εδώ, στα εισερχόμενα γίνονται «Προωθήθηκε» (με ώρα και λεωφορείο). Δεν μετράνε στο ταμείο (πληρώθηκαν αλλού).
async function loadTransit(S, E) {
  const today = dayKey(new Date()) === $("outDay").value;
  const flt = (today ? "status.eq.transit," : "") + `and(status.eq.forwarded,fwd_departure_at.gte.${S},fwd_departure_at.lt.${E})`;
  const { data, error } = await D.sb.from("parcels").select("id,receipt_no,recipient_name,recipient_phone,destination_city,origin_city,pieces,status,bypassed,fwd_destination,fwd_departure_at,fwd_bus,created_at")
    .or(flt).limit(500);
  if (error) return [];
  const old = Date.now() - 10 * 864e5;
  return (data || []).filter(p => !p.bypassed && (p.status === "transit" || p.status === "forwarded") && (p.status !== "transit" || new Date(p.created_at).getTime() > old)).map(p => ({
    id: "p:" + p.id, _parcel: p, receipt_no: p.receipt_no, recipient_name: p.recipient_name, recipient_phone: p.recipient_phone,
    destination_city: p.fwd_destination || p.destination_city, pieces: p.pieces || 1, fare_eur: null,
    departure_at: p.status === "forwarded" ? p.fwd_departure_at : null, created_at: p.created_at,
    status: p.status === "forwarded" ? "loaded" : "waiting", notes: "⇄ Μεταφόρτωση" + (p.origin_city ? " από " + p.origin_city : "") }));
}
/** Διερχόμενο χωρίς ώρα → στο επόμενο λεωφορείο της ημέρας που περνά από τον προορισμό του. */
function assignTransit() {
  const reps = repsFor($("outDay").value).filter(x => x.departure_at && inDay(x)).sort((a, b) => new Date(a.departure_at) - new Date(b.departure_at));
  const now = Date.now() - 15 * 60e3;
  for (const r of rows.values()) {
    if (!r._parcel) continue;
    if (r._parcel.status !== "transit") { if ([...reports.values()].some(x => (x.transitNos || []).some(n => sameOutgoing({ receipt_no: n }, r)))) r.in_report = true; continue; }
    const inRep = [...reports.values()].find(x => x.departure_at && inDay(x) && (x.transitNos || []).some(n => sameOutgoing({ receipt_no: n }, r)));
    if (inRep) { r.report_id = inRep.id; r.departure_at = inRep.departure_at; r.in_report = true; continue; }
    const ok = reps.filter(x => x.route.end === r.destination_city || x.route.stops.includes(r.destination_city));
    const rep = ok.find(x => new Date(x.departure_at).getTime() >= now) || ok.at(-1);
    r.report_id = rep ? rep.id : null; r.departure_at = rep ? rep.departure_at : null;
  }
}
async function saveTransit(r, patch) {
  const now = new Date().toISOString(); let pp = null;
  if (patch.status === "loaded") pp = { status: "forwarded", status_at: now, fwd_at: now, fwd_destination: r.destination_city, fwd_departure_at: r.departure_at || now, fwd_bus: keyLabel(tripKeyOf(r)) };
  else if (patch.status === "waiting" || patch.status === "not_loaded") pp = { status: "transit", status_at: now, fwd_at: null, fwd_destination: null, fwd_departure_at: null, fwd_bus: null };
  if (pp) { const { error } = await D.sb.from("parcels").update(pp).eq("id", r._parcel.id); if (error) throw error;
    r._parcel = { ...r._parcel, ...pp }; r.status = pp.status === "forwarded" ? "loaded" : "waiting"; if (patch.photographed) r.photographed = true; }
  rows.set(r.id, r); return r;
}
async function loadReports(list) {
  const ids = [...new Set(list.map(r => r.report_id).filter(id => id && !reports.has(id)))];
  if (!ids.length) return;
  const { data } = await D.sb.from("outgoing_reports").select("id,departure_at,items").in("id", ids);
  for (const rep of data || []) setReport(rep);
}
function setReport(rep) {
  const items = (rep.items || []).filter(i => isAgrinioReceipt(i.receipt_no));
  const transitNos = (rep.items || []).filter(i => i.receipt_no && !isAgrinioReceipt(i.receipt_no)).map(i => i.receipt_no);
  reports.set(rep.id, { ...rep, transitNos, route: routeOf(items.map(i => i.destination_city)) });
}
/** Οι καταστάσεις της ημέρας (ακόμα κι αν έχουν μόνο διερχόμενα). */
async function loadDayReports(S, E) {
  const { data } = await D.sb.from("outgoing_reports").select("id,departure_at,items").gte("departure_at", S).lt("departure_at", E).limit(200);
  for (const rep of data || []) if (!reports.has(rep.id)) setReport(rep);
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
  if (String(id || "").startsWith("p:")) { const r = rows.get(id); if (!r) throw new Error("το διερχόμενο δεν βρέθηκε"); return saveTransit(r, patch); }
  const q = id ? D.sb.from("outgoing").update(patch).eq("id", id) : D.sb.from("outgoing").insert(patch);
  const { data, error } = await q.select().single(); if (error) throw error;
  if (inDay(data)) rows.set(data.id, data); else rows.delete(data.id);
  if (found) found = found.map(x => (x.id === data.id ? data : x));
  return data;
}
// Χωρίς σήμα στην αποβάθρα: η «φόρτωση» κρατιέται στο κινητό και στέλνεται μόλις επανέλθει το ίντερνετ.
const QK = "outQueue";
const qGet = () => { try { return JSON.parse(localStorage.getItem(QK) || "[]"); } catch { return []; } };
const qSet = q => { try { localStorage.setItem(QK, JSON.stringify(q)); } catch { /* */ } };
const netErr = e => !navigator.onLine || /fetch|network|Failed to|timeout|Load failed/i.test(String(e && (e.message || e)));
async function saveQueued(r, patch) {
  try { return await save(r.id, patch); }
  catch (e) {
    if (!netErr(e)) throw e;
    const q = qGet().filter(x => x.id !== r.id); q.push({ id: r.id, patch: { ...(q.find(x => x.id === r.id)?.patch || {}), ...patch } }); qSet(q);
    const local = { ...r, ...patch }; rows.set(r.id, local); queueBadge(); return local;
  }
}
let flushing = false;
async function flushQueue() {
  const q = qGet(); if (!q.length || flushing || !navigator.onLine) { queueBadge(); return; } flushing = true;
  const left = [];
  for (const x of q) { try { await save(x.id, x.patch); } catch (e) { if (netErr(e)) left.push(x); } }
  qSet(left); flushing = false; queueBadge(); if (q.length !== left.length) render();
}
function queueBadge() {
  const n = qGet().length, m = $("outMsg"); if (!m) return;
  const t = $("scanStatus");
  if (n) { show(m, "📴 Χωρίς ίντερνετ: " + n + " φορτώσεις κρατήθηκαν στο κινητό — θα σταλούν μόλις έρθει σήμα. ΜΗΝ κλείσεις την εφαρμογή.", "warn"); if (t && scan) t.textContent = "📴 " + n + " σε αναμονή αποστολής"; }
}
window.addEventListener("online", flushQueue); setInterval(flushQueue, 20000);
const loadedPatch = () => ({ status: "loaded", loaded_at: new Date().toISOString(), status_at: new Date().toISOString() });

// ---------------------------------------------------------------- 1) κατάσταση δρομολογίου (σύστημα ΚΤΕΛ)
async function runReport(files) {
  if (busy) return; if (D.needOperator()) return; busy = true; const msg = $("outMsg");
  try {
    show(msg, "Διαβάζω την κατάσταση… (έως 1 λεπτό)", "info");
    // ΔΙΠΛΗ ανάγνωση (δύο ανεξάρτητες, με διαφορετική ανάλυση): όπου διαφωνούν σε προορισμό/τεμάχια → ⚠ ΕΛΕΓΞΕ
    const images = [], images2 = [];
    for (const f of files) { images.push({ data: await toJpegB64(f, 2000, 0.82), media_type: "image/jpeg" }); images2.push({ data: await toJpegB64(f, 2600, 0.9), media_type: "image/jpeg" }); }
    const [r1, r2] = await Promise.all([
      D.sb.functions.invoke("extract-receipt", { body: { mode: "manifest", images } }),
      D.sb.functions.invoke("extract-receipt", { body: { mode: "manifest", images: images2 } }).catch(() => ({ error: true })),
    ]);
    if (r1.error && r2.error) throw new Error(await errText(r1.error));
    const A = r1.error ? r2 : r1, B = r1.error ? null : r2.error ? null : r2;
    const m = A.data.data || {}; const dep = parseGrDate(m.departure || B?.data?.data?.departure)?.toISOString() || null;
    const all = (m.items || []).filter(i => i.receipt_no); const items = all.filter(i => isAgrinioReceipt(i.receipt_no)); const skipped = all.length - items.length;
    const doubts = []; let extra = 0;
    if (B) {
      const second = new Map(((B.data.data || {}).items || []).filter(i => isAgrinioReceipt(i.receipt_no)).map(i => [ktelNo(i.receipt_no), i]));
      const firstNos = new Set(items.map(i => ktelNo(i.receipt_no)));
      for (const it of items) {
        const b = second.get(ktelNo(it.receipt_no)); if (!b) continue;
        const d1 = cityFromStation(it.destination_city), d2 = cityFromStation(b.destination_city);
        if (d1 && d2 && d1 !== d2) { it.dest_alt = d2; doubts.push((it.recipient || it.receipt_no) + ": " + d1 + " ή " + d2); }
        else if (!d1 && d2) it.destination_city = d2;
        const p1 = Number(it.pieces) || 0, p2 = Number(b.pieces) || 0; if (p1 && p2 && p1 !== p2) { it.pieces_doubt = p1 + " ή " + p2; doubts.push((it.recipient || it.receipt_no) + ": " + p1 + " ή " + p2 + " τεμ."); }
        if (it.checked !== true && b.checked === true) it.checked_doubt = true;
      }
      for (const [no, b] of second) if (!firstNos.has(no)) { items.push({ ...b, unsure: true, only_second: true }); extra++; } // γραμμή που η 1η ανάγνωση έχασε
    }
    if (!items.length && !all.length) { show(msg, skipped ? "Καμία γραμμή της κατάστασης δεν ξεκινά με 228 (αποθήκη Αγρινίου) — δεν καταχωρήθηκε τίποτα." : "Δεν βρήκα γραμμές στην κατάσταση. Τράβα πιο καθαρά ή σε περισσότερες σελίδες.", "warn"); return; }
    // ⇄ γραμμές άλλων πρακτορείων (όχι 228) = διερχόμενα → ψάχνονται στα Εισερχόμενα (μεταφορτώσεις)
    const others = all.filter(i => !isAgrinioReceipt(i.receipt_no));
    const rep = await D.sb.from("outgoing_reports").insert({ departure_at: dep, total_declared: m.total_declared ?? null, items: [...items, ...others.map(i => ({ ...i, transit: true }))], operator: D.operator() || null }).select("id").single();
    if (rep.data) setReport({ id: rep.data.id, departure_at: dep, items: [...items, ...others.map(i => ({ ...i, transit: true }))] });
    const tr = { found: 0, loaded: 0, direct: 0, missing: [] };
    if (others.length) {
      const since = new Date(Date.now() - 21 * 864e5).toISOString();
      const { data: cand } = await D.sb.from("parcels").select("id,receipt_no,status,bypassed,destination_city,fwd_destination,recipient_name").in("status", ["transit", "forwarded"]).gte("created_at", since).limit(2000);
      const busLabel = rep.data ? keyLabel(hhmm(dep || new Date().toISOString()) + "|" + (reports.get(rep.data.id)?.route.end || "—")) : null;
      for (const it of others) {
        const p = (cand || []).find(x => sameOutgoing({ receipt_no: x.receipt_no }, { receipt_no: it.receipt_no }));
        if (!p) { tr.missing.push((it.recipient || "?") + " " + it.receipt_no + " → " + (cityFromStation(it.destination_city) || it.destination_city || "?")); continue; }
        if (p.bypassed) { tr.direct++; continue; } // απευθείας μεταφόρτωση — δεν περνά από την αποθήκη
        tr.found++;
        if (it.checked === true && p.status === "transit") { // ✓ στην κατάσταση = φορτώθηκε → στα Εισερχόμενα «Προωθήθηκε»
          const now = new Date().toISOString();
          const { error } = await D.sb.from("parcels").update({ status: "forwarded", status_at: now, fwd_at: now, fwd_destination: cityFromStation(it.destination_city) || p.fwd_destination || p.destination_city, fwd_departure_at: dep || now, fwd_bus: busLabel }).eq("id", p.id);
          if (!error) tr.loaded++;
        }
      }
    }
    let added = 0, matched = 0, ticked = 0;
    for (const it of items) {
      const tk = it.checked === true; if (tk) ticked++; // ✓ με στυλό = καταχωρήθηκε & φορτώθηκε
      const warn = [it.dest_alt ? "⚠ ΕΛΕΓΞΕ ΠΡΟΟΡΙΣΜΟ: " + cityFromStation(it.destination_city) + " ή " + it.dest_alt + " (διαφωνία ανάγνωσης)" : "",
        it.pieces_doubt ? "⚠ ΕΛΕΓΞΕ ΤΕΜΑΧΙΑ: " + it.pieces_doubt : "", it.checked_doubt ? "⚠ ΕΛΕΓΞΕ αν είναι τσεκαρισμένο" : "",
        it.unsure ? "⚠ Έλεγξε: αβέβαιη γραμμή στην κατάσταση" : ""].filter(Boolean).join(" · ") || null;
      const conf = it.dest_alt ? { dest_alt: it.dest_alt } : null;
      const o = { receipt_no: it.receipt_no, recipient_name: it.recipient ? surnameFirst(it.recipient) : null, destination_city: cityFromStation(it.destination_city) || null,
        fare_eur: it.fare_eur, pieces: Math.min(99, Math.max(1, Number(it.pieces) || 1)), departure_at: dep };
      const pcFix = Number(it.pieces) > 0 ? Math.min(99, Number(it.pieces)) : null; // τα τεμάχια της κατάστασης υπερισχύουν
      const ex = await findExisting(o);
      const wasOut = ex && /Εκτός κατάστασης[^·]*|Σάρωση: εκτός κατάστασης/.test(ex.notes || ""); // μπήκε τώρα στη νέα κατάσταση
      if (ex) { await save(ex.id, { ...fillBlanks(ex, o), ...(wasOut ? { notes: (ex.notes || "").replace(/Εκτός κατάστασης[^·]*(· )?|Σάρωση: εκτός κατάστασης(· )?/g, "").replace(/^[\s·]+|[\s·]+$/g, "") || null } : {}), ...(pcFix && pcFix !== ex.pieces ? { pieces: pcFix } : {}), ...(warn && !ex.photographed ? { notes: (ex.notes ? ex.notes + " · " : "") + warn } : {}), ...(conf && !ex.photographed ? { extraction_confidence: { ...(ex.extraction_confidence || {}), ...conf } } : {}), in_report: true, report_id: rep.data?.id || null, ...(tk && ex.status === "waiting" ? loadedPatch() : {}) }); matched++; }
      else { await save(null, { ...o, in_report: true, report_id: rep.data?.id || null, status: "waiting", ...(tk ? loadedPatch() : {}), operator: D.operator() || null, notes: warn, extraction_confidence: conf }); added++; }
    }
    if (dep && dayKey(dep) !== $("outDay").value) { $("outDay").value = dayKey(dep); await load(); } else if (others.length) await load(); else render();
    show(msg, "✓ Κατάσταση " + (dep ? fmtGr(dep) : "") + ": " + items.length + " δέματα (" + added + " νέα, " + matched + " υπήρχαν)" + (others.length ? "\n⇄ Διερχόμενα στην κατάσταση: " + others.length + " · βρέθηκαν στα Εισερχόμενα " + tr.found + (tr.loaded ? " (" + tr.loaded + " τσεκαρισμένα → «Προωθήθηκε»)" : "") + (tr.direct ? " · " + tr.direct + " απευθείας μεταφορτώσεις" : "") + (tr.missing.length ? "\n⚠ Διερχόμενα που ΔΕΝ έχουν περαστεί στα Εισερχόμενα (" + tr.missing.length + "): " + tr.missing.slice(0, 8).join(" · ") : "") : "") + (B ? (doubts.length ? "\n⚠ Διπλή ανάγνωση — ΕΛΕΓΞΕ " + doubts.length + ": " + doubts.slice(0, 8).join(" · ") : "\n✓ Διπλή ανάγνωση: οι δύο αναγνώσεις συμφωνούν σε προορισμούς και τεμάχια") + (extra ? " · ＋" + extra + " γραμμές που βρήκε μόνο η 2η ανάγνωση (⚠)" : "") : " · ⚠ έγινε μόνο μία ανάγνωση") + (ticked ? " · ✓ " + ticked + " τσεκαρισμένα → «Φορτώθηκε»" + (ticked < items.length ? ", " + (items.length - ticked) + " χωρίς τσεκ → «Περιμένει»" : "") : "") + (m.total_declared && m.total_declared !== all.length ? " · ⚠ η κατάσταση γράφει σύνολο " + m.total_declared : "") + ". Τώρα φωτογράφισε τις αποδείξεις στη φόρτωση." + missAfterReport(dep), "ok");
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
async function onePhoto(file, loading, expectNo = null) {
  const img = await toJpegB64(file, 1600, 0.8);
  const { data, error } = await D.sb.functions.invoke("extract-receipt", { body: { images: [{ data: img, media_type: "image/jpeg" }] } });
  if (error) throw new Error(await errText(error));
  const d = data.data || {}; const o = extractedToOutgoing(d); const senderBiz = o.sender_is_business; delete o.sender_is_business;
  if (expectNo && !(o.receipt_no && sameOutgoing({ receipt_no: o.receipt_no }, { receipt_no: expectNo }))) o.receipt_no = expectNo; // η σάρωση (3 ίδιες αναγνώσεις) υπερισχύει
  if (!o.receipt_no && !o.parcel_code) { openEdit(null, o); throw new Error("δεν διαβάστηκε αριθμός απόδειξης — συμπλήρωσέ τον στη φόρμα"); }
  if (!isAgrinioReceipt(o.receipt_no)) throw new Error("η απόδειξη " + (o.receipt_no || "") + " δεν είναι της αποθήκης Αγρινίου (δεν ξεκινά με 228) — δεν καταχωρήθηκε");
  const flags = (d.unsure || []).filter(u => ["receipt_no", "phone", "fare_eur", "recipient", "destination_city"].includes(u));
  const note = flags.length ? "⚠ Έλεγξε: " + flags.map(f => ({ receipt_no: "αριθμό", phone: "τηλέφωνο", fare_eur: "κόμιστρο", recipient: "παραλήπτη", destination_city: "προορισμό" }[f])).join(", ") : null;
  const ex = await findExisting(o);
  let r;
  // η ίδια η απόδειξη υπερισχύει της κατάστασης για τον προορισμό (η κατάσταση διαβάζεται σε πίνακα και μπορεί να «γλιστρήσει» γραμμή)
  const destFix = ex && o.destination_city && ex.destination_city && ex.destination_city !== o.destination_city && !(d.unsure || []).includes("destination_city")
    ? { destination_city: o.destination_city, extraction_confidence: { ...(ex.extraction_confidence || {}), dest_alt: null }, notes: ((ex.notes ? ex.notes + " · " : "") + "Προορισμός διορθώθηκε από την απόδειξη: " + ex.destination_city + " → " + o.destination_city) } : {};
  const altOk = ex && ex.extraction_confidence?.dest_alt && o.destination_city && !destFix.destination_city ? { extraction_confidence: { ...ex.extraction_confidence, dest_alt: null } } : {};
  if (ex) r = await save(ex.id, { ...fillBlanks(ex, o), ...altOk, ...destFix, photographed: true, ...(loading && ex.status === "waiting" ? loadedPatch() : {}), ...(note && !ex.notes ? { notes: note } : {}) });
  else r = await save(null, { ...o, photographed: true, status: loading ? "loaded" : "waiting", ...(loading ? loadedPatch() : {}), operator: D.operator() || null, notes: note, extraction_confidence: { unsure: d.unsure || [] } });
  // πελάτες: αποστολέας → καρτέλα πελάτη· τηλέφωνο παραλήπτη από γνωστό πελάτη (μόνο αν υπάρχει ΕΝΑΣ με τηλέφωνο)
  if (r.sender_name && !r.customer_id) { const cid = await D.linkCustomer(r.sender_name, r.sender_phone); if (cid) r = await save(r.id, { customer_id: cid }); }
  if (senderBiz && r.customer_id) D.sb.from("customers").update({ is_business: true }).eq("id", r.customer_id).eq("is_business", false).then(() => {});
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
  if (!rep && r.departure_at) rep = repsFor(dayKey(r.departure_at)).find(x => tk(x) === tk(r) && (x.route.end === r.destination_city || x.route.stops.includes(r.destination_city)));
  return rep ? tk(rep) + "|" + (rep.route.end || "—") : tk(r) + "|" + (r.destination_city || "—");
}
const keyLabel = key => { const [k, d] = key.split("|"); return (d === "—" ? "Χωρίς προορισμό" : d) + " " + (k === "—" ? "(χωρίς ώρα)" : k); };
// πλήθος = τεμάχια (ένα δέμα με 3 κομμάτια μετράει 3)
const pcs = a => a.reduce((s, r) => s + Math.max(1, Number(r.pieces) || 1), 0);
function render() {
  assignTransit(); assignSched();
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
  const schedNotes = new Map();
  const byTime = new Map(); for (const rep of (found ? [...reports.values()] : repsFor($("outDay").value))) { const k = tKey(rep); (byTime.get(k) || byTime.set(k, []).get(k)).push(rep); }
  const stopsOf = new Map();
  for (const r of src) {
    let rep = r.report_id && reports.get(r.report_id);
    if (!rep && r.departure_at) rep = (byTime.get(tKey(r)) || []).find(x => x.route.end === r.destination_city || x.route.stops.includes(r.destination_city));
    const k = rep ? routeKey(rep) : tKey(r) + "|" + (r.destination_city || "—");
    if (rep) { const s = stopsOf.get(k) || new Set(); [...rep.route.stops, rep.route.end].forEach(x => s.add(x)); stopsOf.set(k, s); if (rep.sched && rep.notes.length) schedNotes.set(k, rep.notes); }
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
    if (stopList.length > 1 || schedNotes.has(key)) head.append(el("div", "hint routeline", "🚌 " + stopList.join(" → ") + (schedNotes.has(key) ? " · " + schedNotes.get(key).join(" · ") : "")));
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
    if (live.length) acts.append(btn("🖨 Εκτύπωση", "", () => printTrip(title, g, stopList, found ? null : $("outDay").value)));
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
// ---------------------------------------------------------------- 🖨 εκτυπώσιμη κατάσταση δρομολογίου
function printTrip(title, g, stops, day) {
  const live = g.filter(r => r.status !== "cancelled");
  const order = d => { const i = stops.indexOf(d); return i < 0 ? 99 : i; };
  const dests = [...new Set(live.map(r => r.destination_city || "—"))].sort((a, b) => order(a) - order(b) || a.localeCompare(b, "el"));
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let n = 0, html = "";
  for (const d of dests) {
    const a = live.filter(r => (r.destination_city || "—") === d).sort((x, y) => (x.recipient_name || "").localeCompare(y.recipient_name || "", "el"));
    html += `<tr class="dh"><td colspan="7">${esc(d)} · ${pcs(a)} τεμ.${pcs(a) > a.length ? " (" + a.length + " αποδ.)" : ""}</td></tr>`;
    for (const r of a) html += `<tr><td>${++n}</td><td class="mono">${esc(r.receipt_no)}</td><td>${r._parcel ? "⇄ " : ""}${esc(r.recipient_name || "")}${r._parcel ? ' <small>(διερχ.' + (r._parcel.origin_city ? " από " + esc(r._parcel.origin_city) : "") + ")</small>" : ""}</td><td>${esc(r.recipient_phone ? fmtPhone(r.recipient_phone) : "")}</td><td class="c"><b>${r.pieces || 1}</b></td><td class="r">${r.fare_eur != null ? esc(money(r.fare_eur)) : ""}</td><td class="c">${r.status === "loaded" ? "✓" : "☐"}</td></tr>`;
  }
  const area = $("printArea");
  area.innerHTML = `<h1>Κατάσταση δρομολογίου · ${esc(title)}</h1>
    <div class="pmeta">${day ? esc(new Date(day + "T12:00").toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })) + " · " : ""}Αποθήκη ΚΤΕΛ Αγρινίου · εκτύπωση ${esc(new Date().toLocaleString("el-GR"))}${D.operator() ? " · " + esc(D.operator()) : ""}</div>
    <table class="ptab"><thead><tr><th>#</th><th>Απόδειξη</th><th>Παραλήπτης</th><th>Τηλέφωνο</th><th>Τεμ.</th><th>Κόμιστρο</th><th>Φορτ.</th></tr></thead><tbody>${html}</tbody>
    <tfoot><tr><td colspan="4">Σύνολο: ${live.length} αποδείξεις</td><td class="c"><b>${pcs(live)}</b></td><td class="r">${esc(money(outCash(live, 0).fares))}</td><td></td></tr></tfoot></table>
    <div class="psum">${dests.map(d => esc(d) + ": <b>" + pcs(live.filter(r => (r.destination_city || "—") === d)) + "</b>").join(" · ")}</div>
    <div class="psign"><span>Παρέδωσε: ____________________</span><span>Παρέλαβε (οδηγός): ____________________</span></div>`;
  document.body.classList.add("printing");
  const done = () => { document.body.classList.remove("printing"); area.innerHTML = ""; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done); setTimeout(() => window.print(), 50);
}
const smsOn = () => D.settings().sms_enabled === true;
const canSms = r => !r._parcel && smsOn() && r.status === "loaded" && !r.sms_sent_at && /^69\d{8}$/.test(r.recipient_phone || "");
function card(r) {
  const c = el("article", "outcard st-" + r.status); c.id = "out-" + r.id;
  const top = el("div", "outtop");
  top.append(el("b", null, r.recipient_name || "— χωρίς όνομα —"), el("span", "chip st", STATUS[r.status] || r.status));
  if (r.in_report && !r.photographed) top.append(el("span", "badge bad", "χωρίς φωτογραφία"));
  if (r.photographed && !r.in_report) top.append(el("span", "badge warn", "εκτός κατάστασης"));
  if (r.in_cash) top.append(el("span", "badge ok", "🧾 ταμείο"));
  const isStar = r.customer_id && starred.has(r.customer_id);
  if (isStar) { c.classList.add("is-star"); top.append(el("span", "badge star", "⭐ ΤΑΚΤΙΚΟΣ")); }
  if (r._parcel) { c.classList.add("is-transit"); top.append(el("span", "badge transit", "⇄ ΔΙΕΡΧΟΜΕΝΟ" + (r._parcel.origin_city ? " από " + r._parcel.origin_city : ""))); }
  c.append(top);
  const info = el("div", "outinfo");
  const add = (l, v) => { if (v == null || v === "") return; const x = el("div", "line"); x.append(el("span", "lbl", l), el("span", null, v)); info.append(x); };
  add("Προορισμός", r.destination_city); add("Απόδειξη", r.receipt_no + (r.parcel_code && !/\(/.test(r.receipt_no || "") ? " · " + r.parcel_code : ""));
  if (!r._parcel) add("Κόμιστρο", r.fare_eur != null ? money(r.fare_eur) + (r.pieces > 1 ? " · " + r.pieces + " τεμ." : "") : "⚠ λείπει");
  add("Αναχώρηση", r.departure_at ? fmtGr(r.departure_at) + (r._schedDep ? " (επόμενο λεωφορείο κατά το πρόγραμμα)" : "") : null); add("Έκδοση", r.issued_at ? fmtGr(r.issued_at) : null); add("Αποστολέας", [r.sender_name, r.sender_phone ? fmtPhone(r.sender_phone) : ""].filter(Boolean).join(" · "));
  add("Τηλ. παραλήπτη", r.recipient_phone ? fmtPhone(r.recipient_phone) + (r.sms_sent_at ? " · 📩 SMS " + fmtGr(r.sms_sent_at) : "") : null);
  add("Υπάλληλος", r.operator); add("Παρατηρήσεις", r.notes);
  c.append(info);
  const dalt = r.extraction_confidence && r.extraction_confidence.dest_alt;
  if (dalt) {
    const w = el("div", "msg warn sugg"); w.append(el("b", null, "⚠ Ποιος είναι ο προορισμός; "), "Οι δύο αναγνώσεις της κατάστασης διαφωνούν — κοίτα την ετικέτα: ");
    for (const d of [r.destination_city, dalt].filter(Boolean)) w.append(btn(d, "primary", () => save(r.id, { destination_city: d, extraction_confidence: { ...r.extraction_confidence, dest_alt: null }, notes: (r.notes || "").replace(/⚠ ΕΛΕΓΞΕ ΠΡΟΟΡΙΣΜΟ[^·]*(· )?/, "").trim() || null }).then(render)), " ");
    c.append(w);
  }
  const hint = r.extraction_confidence && r.extraction_confidence.phone_hint;
  if (!r.recipient_phone && hint) {
    const w = el("div", "msg info sugg"); w.append("📇 Μήπως το τηλέφωνο του παραλήπτη είναι ", el("b", null, fmtPhone(hint)), "; ");
    w.append(btn("Ναι", "primary", () => save(r.id, { recipient_phone: hint }).then(render)), " ", btn("Όχι", "", () => save(r.id, { extraction_confidence: { ...r.extraction_confidence, phone_hint: null } }).then(render)));
    c.append(w);
  }
  const a = el("div", "outacts");
  if (r.status === "waiting") { a.append(btn("✓ Φορτώθηκε", "primary", () => save(r.id, loadedPatch()).then(render))); if (!r._parcel) a.append(btn("✗ Δεν φορτώθηκε", "", () => save(r.id, { status: "not_loaded", status_at: new Date().toISOString() }).then(render))); }
  else if (r.status !== "cancelled") a.append(btn("↺ Περιμένει", "", () => save(r.id, { status: "waiting", loaded_at: null, status_at: new Date().toISOString() }).then(render)));
  if (canSms(r)) a.append(btn("📩 SMS παραλήπτη", "", async () => { await sendSms(r, false); render(); }));
  if (!r._parcel) a.append(btn("✎ Επεξεργασία", "", () => openEdit(r)));
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
    regCache.at = 0; $("outDlg").close(); render();
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
  const dayRows = [...rows.values()].filter(r => !r._parcel);
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
    let upd = 0, ins = 0; const errs = [], destFixed = [];
    show(msg, "Αντιπαραβολή " + rec.count + " αποδείξεων…", "info");
    for (const { item: it, row: r } of rec.matched) {
      const p = { in_cash: true, cash_date: cashDay };
      const iss = parseGrDate(it.issued); if (iss) p.issued_at = iss.toISOString(); // η ώρα έκδοσης του POS είναι η σωστή
      const dep = parseGrDate(it.departure); if (dep && !r.departure_at) p.departure_at = dep.toISOString();
      const to = cityFromStation(it.to) || norm(it.to); if (to && !r.destination_city) p.destination_city = to;
      // το POS γράφει τον προορισμό ανά απόδειξη, δίπλα στον αριθμό → υπερισχύει της κατάστασης
      if (to && r.extraction_confidence?.dest_alt && !it.unsure) p.extraction_confidence = { ...r.extraction_confidence, dest_alt: null };
      if (to && r.destination_city && to !== r.destination_city && !it.unsure) { p.destination_city = to; p.notes = ((r.notes ? r.notes + " · " : "") + "Προορισμός διορθώθηκε από το ταμείο: " + r.destination_city + " → " + to); destFixed.push((r.recipient_name || it.receipt_no) + " " + r.destination_city + "→" + to); }
      if (it.amount != null && r.fare_eur == null) p.fare_eur = it.amount;
      if (it.amount != null && r.fare_eur != null && Math.abs(Number(r.fare_eur) - it.amount) > 0.009 && !String(r.notes || "").includes("ταμείο"))
        p.notes = (((p.notes || r.notes) ? (p.notes || r.notes) + " · " : "") + "⚠ Ταμείο: ποσό " + money(it.amount) + " (εδώ " + money(r.fare_eur) + ")");
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
    if (destFixed.length) L.push("✎ Διορθώθηκε προορισμός σε " + destFixed.length + ": " + destFixed.slice(0, 8).join(" · "));
    if (rec.fareDiff.length) L.push("⚠ Διαφορά ποσού σε " + rec.fareDiff.length + ": " + rec.fareDiff.slice(0, 8).map(x => (x.row.recipient_name || x.item.receipt_no) + " ταμείο " + money(x.item.amount) + " / εδώ " + money(x.row.fare_eur)).join(" · "));
    if (notIn.length) L.push("❌ Στην εφαρμογή αλλά ΟΧΙ στο ταμείο (" + notIn.length + "): " + notIn.slice(0, 10).map(r => (r.recipient_name || "?") + " " + (r.receipt_no || "")).join(" · "));
    if (fails.length || errs.length) L.push("⚠ Σφάλματα: " + [...fails, ...errs].slice(0, 5).join(" · "));
    show(msg, L.join("\n"), cntOk && sumOk && !rec.gaps.length && !notIn.length && !errs.length ? "ok" : "warn");
  } catch (e) { show(msg, "Το κλείσιμο ταμείου δεν διαβάστηκε: " + String(e.message || e).slice(0, 220), "bad"); }
  finally { busy = false; }
}

// ---------------------------------------------------------------- 📇 ΑΠΟΣΤΟΛΕΑΣ/ΠΑΡΑΛΗΠΤΗΣ από το πρόγραμμα του ΚΤΕΛ (τέλος ημέρας)
// Φωτογραφίες της οθόνης/εκτύπωσης του ΚΤΕΛ → συμπληρώνει αποστολέα, παραλήπτη και τηλέφωνα στα ήδη καταχωρημένα (από σάρωση/κατάσταση) με τον αριθμό απόδειξης.
async function runPeople(files) {
  if (busy) { show($("outMsg"), "Περίμενε να τελειώσει η προηγούμενη αποστολή.", "warn"); return; }
  if (D.needOperator()) return; busy = true; const msg = $("outMsg");
  try {
    const items = [], fails = [];
    for (let i = 0; i < files.length; i += 3) {
      show(msg, "Διαβάζω αποστολείς/παραλήπτες… φωτογραφίες " + (i + 1) + "–" + Math.min(files.length, i + 3) + " από " + files.length, "info");
      const images = []; for (const f of files.slice(i, i + 3)) images.push({ data: await toJpegB64(f, 2200, 0.85), media_type: "image/jpeg" });
      const { data, error } = await D.sb.functions.invoke("extract-receipt", { body: { mode: "people", images } });
      if (error) { fails.push(await errText(error)); continue; }
      items.push(...((data.data || {}).items || []));
    }
    const seen = new Map(); for (const it of items) { const n = ktelNo(it.receipt_no); if (isAgrinioReceipt(n) && !seen.has(n)) seen.set(n, { ...it, receipt_no: n }); }
    const list = [...seen.values()];
    if (!list.length) throw new Error(fails.length ? fails.join(" · ") : "δεν βρήκα αποδείξεις 228 — μήπως η εφαρμογή στον server είναι παλιά; (ξανά-deploy το extract-receipt)");
    const [s0] = dayRange(); const s = new Date(s0); s.setDate(s.getDate() - 3); const e = new Date(s0); e.setDate(e.getDate() + 3); const S = s.toISOString(), E = e.toISOString();
    const { data: near, error: nerr } = await D.sb.from("outgoing").select("*")
      .or(`and(created_at.gte.${S},created_at.lt.${E}),and(departure_at.gte.${S},departure_at.lt.${E}),and(issued_at.gte.${S},issued_at.lt.${E})`).limit(3000);
    if (nerr) throw nerr;
    const byNo = new Map((near || []).map(r => [ktelNo(r.receipt_no), r]));
    let upd = 0, ins = 0, starredHits = 0; const errs = [], diffs = [];
    for (const it of list) {
      show(msg, "Ενημερώνω " + (upd + ins + 1) + "/" + list.length + "…", "info");
      const r = byNo.get(it.receipt_no) || (near || []).find(x => sameOutgoing(x, { receipt_no: it.receipt_no }));
      const sName = it.sender ? surnameFirst(it.sender, it.sender_is_business) : null, rName = it.recipient ? surnameFirst(it.recipient, it.recipient_is_business) : null;
      const dest = cityFromStation(it.destination) || norm(it.destination) || null;
      try {
        let row;
        if (r) {
          const p = {};
          if (sName && r.sender_name !== sName) p.sender_name = sName; if (it.sender_phone && r.sender_phone !== it.sender_phone) p.sender_phone = it.sender_phone;
          if (rName && !r.recipient_name) p.recipient_name = rName; else if (rName && norm(r.recipient_name) !== norm(rName) && !it.unsure) { diffs.push(r.recipient_name + " → " + rName); p.recipient_name = rName; }
          if (it.recipient_phone && !r.recipient_phone) p.recipient_phone = it.recipient_phone;
          if (dest && !r.destination_city) p.destination_city = dest;
          row = Object.keys(p).length ? await save(r.id, p) : r; upd++;
        } else {
          row = await save(null, { receipt_no: it.receipt_no, sender_name: sName, sender_phone: it.sender_phone || null, recipient_name: rName, recipient_phone: it.recipient_phone || null,
            destination_city: dest, status: "waiting", operator: D.operator() || null, notes: "Μόνο από το πρόγραμμα ΚΤΕΛ — δεν σαρώθηκε/δεν ήταν σε κατάσταση" + (it.unsure ? " · ⚠ αβέβαιη ανάγνωση" : "") }); ins++;
        }
        if (row.sender_name && (!row.customer_id || (r && sName && r.sender_name !== sName))) {
          const cid = await D.linkCustomer(row.sender_name, row.sender_phone);
          if (cid) { if (cid !== row.customer_id) row = await save(row.id, { customer_id: cid }); if (it.sender_is_business) await D.sb.from("customers").update({ is_business: true }).eq("id", cid).eq("is_business", false); }
        }
        if (row.customer_id && starred.has(row.customer_id)) starredHits++;
      } catch (x) { errs.push(it.receipt_no + ": " + x.message); }
    }
    regCache.at = 0; await load();
    const L = ["📇 Από το πρόγραμμα ΚΤΕΛ: διάβασα " + list.length + " αποδείξεις.", "✓ Συμπληρώθηκαν " + upd + " που υπήρχαν ήδη" + (ins ? " · ＋ " + ins + " νέα που δεν είχαν σαρωθεί" : "") + "."];
    if (starredHits) L.push("⭐ " + starredHits + " από τακτικούς πελάτες.");
    if (diffs.length) L.push("✎ Διορθώθηκε παραλήπτης σε " + diffs.length + ": " + diffs.slice(0, 6).join(" · "));
    if (fails.length || errs.length) L.push("⚠ Σφάλματα: " + [...fails, ...errs].slice(0, 5).join(" · "));
    show(msg, L.join("\n"), errs.length || fails.length ? "warn" : "ok");
  } catch (e) { show(msg, "Δεν διαβάστηκαν: " + String(e.message || e).slice(0, 220), "bad"); }
  finally { busy = false; }
}

// ================================================================ 🔎 ΣΑΡΩΣΗ ΦΟΡΤΩΣΗΣ (κείμενο από την κάμερα)
// Περνάς τις αποδείξεις μπροστά στην κάμερα· διαβάζεται ο αριθμός 228-…, σημειώνεται «Φορτώθηκε», μπιπ.
let scan = null; // { key, stream, timer, last, hits:Map, seen:Map }
async function openScanner(key) {
  if (D.needOperator()) return;
  sound.unlock();
  const d = $("scanDlg");
  $("scanLog").textContent = ""; scanStatus("Ανοίγω την κάμερα…", "info"); d.showModal();
  scan = { key, stream: null, timer: null, hits: new Map(), seen: new Map(), busy: false };
  fillTripSelect(key); setScanKey(key);
  try {
    scan.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    const v = $("scanVideo"); v.srcObject = scan.stream; await v.play();
    const tr = scan.stream.getVideoTracks()[0], caps = tr.getCapabilities ? tr.getCapabilities() : {};
    try { if ((caps.focusMode || []).includes("continuous")) await tr.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch { /* */ }
    const tb = $("scanTorch"); tb.hidden = !caps.torch; let on = false;
    tb.onclick = async () => { on = !on; try { await tr.applyConstraints({ advanced: [{ torch: on }] }); tb.classList.toggle("primary", on); } catch { /* */ } };
  } catch (e) { scanStatus("Δεν άνοιξε η κάμερα: " + (e.name === "NotAllowedError" ? "δώσε άδεια κάμερας στον browser." : e.message), "bad"); return; }
  scanStatus("Φορτώνω την ανάγνωση κειμένου… (την πρώτη φορά ~3 MB)", "info");
  try { await getWorker(m => { if (m.status && /load|init/i.test(m.status)) scanStatus("Φορτώνω την ανάγνωση κειμένου… " + Math.round((m.progress || 0) * 100) + "%", "info"); }); }
  catch (e) { scanStatus("Η ανάγνωση κειμένου δεν φόρτωσε: " + e.message, "bad"); return; }
  scanStatus("Βάλε τον «Αρ. Απόδειξης» μέσα στο πλαίσιο.", "info");
  const pool = await getWorkers().catch(() => []); if (!scan) return;
  scan.ms = [];
  pool.forEach((w, i) => setTimeout(() => scanLoop(w, i), i * 150)); // παράλληλες αναγνώσεις, μετατοπισμένες στον χρόνο
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
const canv = [];
async function scanLoop(w, i) {
  if (!scan) return;
  const v = $("scanVideo"); const me = scan;
  try {
    const c = grabBand(v, canv[i] || (canv[i] = document.createElement("canvas")));
    if (c) { const t = performance.now(); const { data } = await w.recognize(c); if (scan === me) { me.ms.push(performance.now() - t); if (me.ms.length > 20) me.ms.shift(); window.__scanMs = me.ms; for (const n of find228(data.text)) await onNumber(n, data.confidence || 0); } }
  } catch { /* επόμενο καρέ */ }
  if (scan === me) me.timer = setTimeout(() => scanLoop(w, i), 15);
}
// Γρήγορο: αριθμός της λίστας με καθαρή ανάγνωση (≥80%) = 1 καρέ· θολή ανάγνωση = 2 ίδια καρέ· άγνωστος αριθμός = 3.
async function onNumber(n, conf = 0) {
  const now = Date.now();
  const last = scan.seen.get(n); if (last && now - last < 4000) return; // ήδη χειρίστηκε πρόσφατα
  const h = (scan.hits.get(n) || 0) + 1; scan.hits.set(n, h); setTimeout(() => scan && scan.hits.delete(n), 2500);
  const is228 = isAgrinioReceipt(n);
  const r = [...rows.values()].find(x => (is228 || x._parcel) && sameOutgoing(x, { receipt_no: n }));
  if (!is228 && (!r || h < 2)) return; // αριθμοί άλλων σταθμών: μόνο τα διερχόμενα της λίστας
  if (!r && h < 3) return; if (r && h < (conf >= 80 ? 1 : 2)) return;
  scan.seen.set(n, now); scan.hits.delete(n);
  if (r) {
    const k = tripKeyOf(r);
    if (scan.key && k !== scan.key) { flash("bad", "✋ ΛΑΘΟΣ ΛΕΩΦΟΡΕΙΟ", (r.recipient_name || n), "είναι για " + keyLabel(k)); sound.bad(); scanStatus("⚠ ΛΑΘΟΣ ΛΕΩΦΟΡΕΙΟ: " + (r.recipient_name || n) + " είναι για " + keyLabel(k) + " — ΟΧΙ για αυτό!", "bad"); scanLog("⚠ " + n + " · " + (r.recipient_name || "") + " → " + keyLabel(k) + " (άλλο δρομολόγιο)", "bad"); return; }
    if (r.status === "cancelled") { flash("bad", "✋ ΑΚΥΡΩΜΕΝΟ", r.recipient_name || n, "μην το φορτώσεις"); sound.bad(); scanStatus("⚠ " + n + " είναι ΑΚΥΡΩΜΕΝΟ.", "bad"); scanLog("⚠ " + n + " ακυρωμένο", "bad"); return; }
    if (r.status === "loaded") { flash("dup", "✓ ΗΔΗ ΣΑΡΩΜΕΝΟ", r.recipient_name || n, "προχώρα στο επόμενο"); sound.dup(); scanStatus("Ήδη σαρωμένο: " + (r.recipient_name || n), "info"); return; }
    const alt = r.extraction_confidence?.dest_alt;
    if (alt) { flash("warn", "⚠ ΚΟΙΤΑ ΤΗΝ ΕΤΙΚΕΤΑ", r.recipient_name || n, "ΠΟΙΟΣ ΠΡΟΟΡΙΣΜΟΣ;", false, [r.destination_city, alt].filter(Boolean).map(d => [d, () => save(r.id, { destination_city: d, extraction_confidence: { ...r.extraction_confidence, dest_alt: null }, notes: (r.notes || "").replace(/⚠ ΕΛΕΓΞΕ ΠΡΟΟΡΙΣΜΟ[^·]*(· )?/, "").trim() || null }).then(() => { scanCounters(); scanLog("✎ " + n + " → " + d, "ok"); })])); sound.bad(); }
    else { flash("ok", "✓", r.recipient_name || n, (r.destination_city || "?") + (r.pieces > 1 ? " · " + r.pieces + " ΤΕΜ." : ""), true); sound.ok(); }
    try { await saveQueued(r, { ...loadedPatch(), photographed: true }); scanCounters(); flashCount(); scanStatus("✓ " + (r.recipient_name || n) + " → " + (r.destination_city || "?") + (r.pieces > 1 ? " · " + r.pieces + " τεμ." : ""), "ok"); scanLog("✓ " + n + " · " + (r.recipient_name || "") + " → " + (r.destination_city || ""), "ok"); }
    catch (e) { flash("bad", "⚠ ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ", r.recipient_name || n, "ξανασάρωσέ το"); scan.seen.delete(n); sound.bad(); scanStatus("Δεν αποθηκεύτηκε: " + e.message, "bad"); }
  } else {
    // δεν είναι στη λίστα της ημέρας → μήπως άλλη μέρα; αλλιώς καταχώρηση μόνο με τον αριθμό («εκτός κατάστασης»)
    const ex = await findExisting({ receipt_no: n });
    if (ex) { flash("bad", "✋ ΑΛΛΗ ΗΜΕΡΑ", n, ex.departure_at ? fmtGr(ex.departure_at) : "έλεγξέ το"); sound.bad(); scanStatus("⚠ " + n + " είναι καταχωρημένο για " + (ex.departure_at ? fmtGr(ex.departure_at) : "άλλη ημέρα") + " — έλεγξέ το.", "bad"); scanLog("⚠ " + n + " άλλη ημέρα", "bad"); return; }
    // ΧΩΡΙΣ κατάσταση (ή εκτός της): καταχωρείται αμέσως με τον αριθμό και το καρέ διαβάζεται από το AI στο παρασκήνιο
    // για όνομα/προορισμό/ώρα/κόμιστρο. Η εικόνα ΔΕΝ αποθηκεύεται πουθενά.
    const withReport = scan.key ? reportFor(scan.key) : [...rows.values()].some(x => x.in_report);
    if (withReport) { // ΔΕΝ είναι στην κατάσταση → κόκκινο· καταχωρείται ΜΟΝΟ αν πατήσεις ＋
      const shot0 = await grabFull($("scanVideo"));
      flash("bad", "✋ ΕΚΤΟΣ ΚΑΤΑΣΤΑΣΗΣ", n, "δεν είναι στην κατάσταση", false, [["＋ Πρόσθεσέ το", () => addOutside(n, shot0)], ["Άφησέ το", () => scanLog("✋ " + n + " εκτός κατάστασης — δεν φορτώθηκε", "bad")]]);
      sound.bad(); scanStatus("✋ " + n + " ΔΕΝ είναι στην κατάσταση. ＋ για να το προσθέσεις ή «Άφησέ το».", "bad"); scanCounters(); return;
    }
    const dep = scan.key ? [...rows.values()].find(x => tripKeyOf(x) === scan.key && x.departure_at)?.departure_at || null : null;
    const shot = await grabFull($("scanVideo"));
    try { await save(null, { receipt_no: n, ...loadedPatch(), photographed: true, in_report: false, departure_at: dep, operator: D.operator() || null, notes: withReport ? "Σάρωση: εκτός κατάστασης" : "Σάρωση" });
      if (withReport) { flash("warn", "⚠ ΕΚΤΟΣ ΚΑΤΑΣΤΑΣΗΣ", n, "διαβάζω τα στοιχεία…"); sound.bad(); scanStatus("⚠ " + n + " ΔΕΝ είναι στην κατάσταση — διαβάζω τα στοιχεία της ετικέτας…", "warn"); }
      else { flash("ok", "✓ ΝΕΟ", n, "διαβάζω τα στοιχεία…", true); sound.ok(); scanStatus("✓ " + n + " — διαβάζω όνομα/προορισμό…", "ok"); }
      scanLog((withReport ? "⚠ " : "✓ ") + n + " · διαβάζω…", withReport ? "warn" : "ok");
      if (shot) enrichScan(shot, n, scan.key);
    }
    catch (e) { flash("bad", "⚠ ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ", n, netErr(e) ? "χωρίς ίντερνετ — ξανασάρωσέ το" : "ξανασάρωσέ το"); scan.seen.delete(n); sound.bad(); scanStatus("Δεν αποθηκεύτηκε: " + e.message, "bad"); }
  }
  scanCounters();
}
/** Ολόκληρο το καρέ (για ανάγνωση στοιχείων από το AI· δεν αποθηκεύεται). */
function grabFull(v) {
  return new Promise(res => {
    const w = v.videoWidth, h = v.videoHeight; if (!w || !h) return res(null);
    const k = Math.min(1, 1600 / Math.max(w, h)), c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); c.toBlob(b => res(b), "image/jpeg", 0.85);
  });
}
async function enrichScan(blob, n, key) {
  try {
    const r = await onePhoto(blob, true, n);
    const line = n + " → " + (r.recipient_name || "?") + " · " + (r.destination_city || "?") + (r.departure_at ? " · " + hhmm(r.departure_at) : "");
    if (scan && key && tripKeyOf(r) !== key && r.destination_city) {
      flash("bad", "✋ ΛΑΘΟΣ ΛΕΩΦΟΡΕΙΟ;", (r.recipient_name || n), r.destination_city + " — είναι για " + keyLabel(tripKeyOf(r))); sound.bad();
      scanLog("⚠ " + line + " (άλλο δρομολόγιο;)", "bad");
    } else if (scan) scanLog("📄 " + line, "ok");
    render(); if (scan) scanCounters();
  } catch (e) { if (scan) scanLog("⚠ " + n + ": δεν διαβάστηκαν στοιχεία (" + String(e.message || e).slice(0, 60) + ") — συμπλήρωσέ τα μετά", "warn"); }
}
// ---- επιλογή δρομολογίου μέσα στη σάρωση
function fillTripSelect(key) {
  const sel = $("scanTrip"); sel.textContent = "";
  const cnt = new Map(); for (const r of rows.values()) if (r.status !== "cancelled") { const k = tripKeyOf(r); cnt.set(k, (cnt.get(k) || 0) + Math.max(1, Number(r.pieces) || 1)); }
  // + τα λεωφορεία του προγράμματος που δεν έχουν φύγει ακόμα (για φόρτωση χωρίς κατάσταση)
  const now = Date.now() - 30 * 60e3;
  for (const rep of schedReps($("outDay").value)) if (new Date(rep.departure_at).getTime() >= now) { const k = hhmm(rep.departure_at) + "|" + rep.route.end; if (!cnt.has(k)) cnt.set(k, 0); }
  sel.append(new Option("Όλα τα δρομολόγια", ""));
  for (const k of [...cnt.keys()].sort()) sel.append(new Option(keyLabel(k) + (cnt.get(k) ? " · " + cnt.get(k) + " τεμ." : "") + (reportFor(k) ? " · 📄" : ""), k));
  sel.value = key || "";
  sel.onchange = () => { setScanKey(sel.value || null); scanStatus("Δρομολόγιο: " + (sel.value ? keyLabel(sel.value) : "όλα") + ". Σάρωσε.", "info"); };
}
const reportFor = key => key && [...rows.values()].some(r => r.in_report && tripKeyOf(r) === key);
function setScanKey(key) {
  if (!scan) return; scan.key = key || null; scan.seen.clear(); scan.hits.clear();
  $("scanTitle").textContent = "🔎 Φόρτωση · " + (scan.key ? keyLabel(scan.key) : "όλα τα δρομολόγια");
  scanCounters();
}
// ---- ＋ δέμα εκτός κατάστασης: φωτογραφία της απόδειξης (το καρέ της κάμερας) → AI → καταχώριση στο δρομολόγιο
async function addOutside(n, shot) {
  if (!scan) return; const key = scan.key;
  shot = shot || await grabFull($("scanVideo"));
  if (!shot) { scanStatus("Δεν πάρθηκε εικόνα — κράτα την απόδειξη μέσα στο πλαίσιο και ξαναπάτα ＋.", "warn"); return; }
  const dep = key ? (repsFor($("outDay").value).find(x => hhmm(x.departure_at) + "|" + x.route.end === key)?.departure_at
    || [...rows.values()].find(x => tripKeyOf(x) === key && x.departure_at)?.departure_at || null) : null;
  scanStatus("📷 Διαβάζω την απόδειξη…", "info");
  try {
    let r;
    if (n) { r = await save(null, { receipt_no: n, ...loadedPatch(), photographed: true, in_report: false, departure_at: dep, operator: D.operator() || null, notes: "Εκτός κατάστασης — προστέθηκε στη φόρτωση" });
      await enrichScan(shot, n, key); r = rows.get(r.id) || r; }
    else { r = await onePhoto(shot, true); const p = { in_report: false, notes: (r.notes ? r.notes + " · " : "") + "Εκτός κατάστασης — προστέθηκε στη φόρτωση" }; if (!r.departure_at && dep) p.departure_at = dep; r = await save(r.id, p); }
    scan.seen.set(r.receipt_no, Date.now());
    flash("warn", "＋ ΠΡΟΣΤΕΘΗΚΕ", r.recipient_name || r.receipt_no, (r.destination_city || "?") + " · εκτός κατάστασης", true); sound.ok();
    scanLog("＋ " + r.receipt_no + " · " + (r.recipient_name || "") + " → " + (r.destination_city || "") + " (εκτός κατάστασης)", "warn"); scanCounters(); render();
  } catch (e) { flash("bad", "⚠ ΔΕΝ ΠΡΟΣΤΕΘΗΚΕ", n || "", String(e.message || e).slice(0, 60)); sound.bad(); scanStatus("Δεν προστέθηκε: " + (e.message || e), "bad"); }
}
// Μεγάλη έγχρωμη ένδειξη πάνω στην κάμερα: πράσινο = ΟΚ (σβήνει μόνη σε 1,2″), κόκκινο/κίτρινο = στάσου (2,5″ ή πάτημα).
let flashT = null;
function flash(kind, big, name, sub, quick, choices) {
  const f = $("scanFlash"); clearTimeout(flashT);
  const cb = $("scanFlashBtns"); cb.textContent = "";
  for (const [label, fn] of choices || []) { const b = el("button", "sfchoice", label); b.type = "button"; b.onclick = ev => { ev.stopPropagation(); fn(); f.hidden = true; }; cb.append(b); }
  f.className = "scanflash " + kind; f.hidden = false;
  $("scanFlashBig").textContent = big; $("scanFlashName").textContent = name || ""; $("scanFlashSub").textContent = sub || ""; $("scanFlashCnt").textContent = "";
  $("scanDlg").classList.remove("pulse-ok", "pulse-bad"); void f.offsetWidth; $("scanDlg").classList.add(kind === "ok" ? "pulse-ok" : "pulse-bad");
  if (!choices) flashT = setTimeout(() => { f.hidden = true; }, quick ? 900 : 2500); // με επιλογές: μένει μέχρι να διαλέξεις
}
function flashCount() {
  if (!scan) return; const live = [...rows.values()].filter(r => r.status !== "cancelled" && (!scan.key || tripKeyOf(r) === scan.key));
  const ok = pcs(live.filter(r => r.status === "loaded")), all = pcs(live);
  $("scanFlashCnt").textContent = ok + " / " + all + (ok === all && all ? " · ΠΛΗΡΕΣ ✓" : " · ΕΠΟΜΕΝΟ ▶");
}
export function initScanner() {
  $("scanFlash").onclick = () => { if ($("scanFlashBtns").childNodes.length) return; clearTimeout(flashT); $("scanFlash").hidden = true; };
  $("scanClose").onclick = closeScanner;
  $("scanDlg").addEventListener("cancel", e => { e.preventDefault(); closeScanner(); });
  $("scanManual").onsubmit = async e => { e.preventDefault(); const v = $("scanNum").value.trim(); const m = find228(v)[0] || (/^\d{6}$/.test(v) ? [...rows.values()].find(x => String(x.receipt_no || "").endsWith(v))?.receipt_no : null);
    $("scanNum").value = ""; if (!m) { scanStatus("Γράψε τον αριθμό σαν 228-336-142206 ή τα 6 τελευταία ψηφία.", "warn"); return; }
    scan.hits.set(m, 5); await onNumber(m); };
  $("scanAdd").onclick = () => addOutside(null);
}
