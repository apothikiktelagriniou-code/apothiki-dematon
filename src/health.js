// 🩺 Κατάσταση συστήματος:
//  1) εκκρεμείς offline καταχωρίσεις ΑΝΑ ΣΥΣΚΕΥΗ (κάθε συσκευή δηλώνει τι περιμένει → το βλέπουν όλες)
//  2) παρακολούθηση SMS: ρωτά το SMS Gateway αν παραδόθηκε· αποτυχία → το δέμα ξαναμπαίνει στο «Να ειδοποιηθούν»
//  3) έλεγχος Edge Functions (extract-receipt, send-sms, gemi-sync)
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { outboxInfo } from "./capture.js";
import { outQueueInfo } from "./outgoing.js";
import { lastBackup } from "./backup.js";

const $ = id => document.getElementById(id);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
let D = null;
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } } };
const DEV_ID = ls.get("deviceId") || (() => { const id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).slice(0, 8); ls.set("deviceId", id); return id; })();
const KIND = matchMedia("(pointer:fine)").matches ? "υπολογιστής" : "κινητό";
const ago = t => { const m = Math.round((Date.now() - new Date(t).getTime()) / 60000); return m < 1 ? "τώρα" : m < 60 ? m + "′ πριν" : m < 1440 ? Math.round(m / 60) + " ώρ. πριν" : Math.round(m / 1440) + " μ. πριν"; };
const FINAL = ["Delivered", "Failed", "Error", "Dismissed"]; // Dismissed = «το ξέρω, κλείσ' το» από τον χρήστη
export const SMS_FAIL_TAG = "SMS απέτυχε";

const state = { fns: [], devices: null, devErr: null, sms: { sent: 0, delivered: 0, failed: [], pending: 0, stuck: 0, unsupported: false }, backup: null, at: null };

// ---------------------------------------------------------------- 1) συσκευές
async function heartbeat() {
  if (!D || !D.loggedIn()) return;
  const ob = await outboxInfo(), out = outQueueInfo();
  const row = { id: DEV_ID, operator: D.operator() || null, kind: KIND, version: typeof __BUILD__ !== "undefined" ? __BUILD__ : null,
    pending_in: ob.n, pending_out: out, oldest_pending: ob.oldest ? new Date(ob.oldest).toISOString() : null, online: navigator.onLine, last_seen: new Date().toISOString() };
  if (!navigator.onLine) return;
  const { error } = await D.sb.from("device_status").upsert(row);
  state.devErr = error ? (/does not exist|schema cache|not find/i.test(error.message) ? "Τρέξε το 0021_health.sql στο Supabase." : error.message) : null;
}
async function loadDevices() {
  const { data, error } = await D.sb.from("device_status").select("*").order("last_seen", { ascending: false }).limit(30);
  const seen = new Set(); state.devices = error ? null : (data || []).filter(d => !seen.has(d.id) && seen.add(d.id));
}
/** Συσκευή με εκκρεμότητες που δεν έχει φανεί > 10′ = κίνδυνος να χαθούν. */
const staleDevices = () => (state.devices || []).filter(d => (d.pending_in || d.pending_out) && Date.now() - new Date(d.last_seen).getTime() > 10 * 60000);

// ---------------------------------------------------------------- 2) SMS
let smsBusy = false;
async function smsWatch() {
  if (!D || !D.loggedIn() || smsBusy || !navigator.onLine) return; smsBusy = true;
  try {
    const since = Date.now() - 48 * 3600e3;
    const listOf = () => D.rows().filter(p => p.notify_channel === "sms" && p.notified_at && new Date(p.notified_at).getTime() > since);
    const openOf = l => l.filter(p => p.sms_message_id && !FINAL.includes(p.sms_state || ""));
    const open = openOf(listOf()).sort((a, b) => new Date(a.sms_state_at || 0) - new Date(b.sms_state_at || 0)); // πρώτα όσα δεν ελέγχθηκαν ποτέ / πιο παλιά
    for (const p of open.slice(0, 15)) {
      const { data, error } = await D.sb.functions.invoke("send-sms", { body: { status: p.sms_message_id } });
      if (error) { let b = {}; try { b = await error.context.json(); } catch { /* */ } if (b.error === "invalid_phone" || b.error === "bad_text") { state.sms.unsupported = true; break; } continue; }
      const st = data && data.state; if (!st) continue;
      if (st === p.sms_state) { D.updateParcel(p.id, { sms_state_at: new Date().toISOString() }).catch(() => {}); continue; } // ελέγχθηκε → πάει στο τέλος της σειράς
      const patch = { sms_state: st, sms_state_at: new Date().toISOString() };
      if (st === "Failed") Object.assign(patch, { status: p.status === "notified" ? "arrived" : p.status, tags: [...new Set([...(p.tags || []), SMS_FAIL_TAG])] });
      try { await D.updateParcel(p.id, patch); } catch { /* χωρίς 0021: η στήλη δεν υπάρχει */ state.devErr = state.devErr || "Τρέξε το 0021_health.sql στο Supabase."; break; }
    }
    const list = listOf(), op = openOf(list);
    state.sms.sent = list.length;
    state.sms.delivered = list.filter(p => p.sms_state === "Delivered").length;
    state.sms.failed = list.filter(p => p.sms_state === "Failed" || p.sms_state === "Error");
    state.sms.pending = op.length;
    const age = p => Date.now() - new Date(p.notified_at).getTime();
    // κόλλησε στο κινητό SMS (δεν έφυγε καθόλου) → πρόβλημα · έφυγε («Sent») αλλά δεν ήρθε αναφορά παράδοσης → απλή πληροφορία
    state.sms.stuckList = op.filter(p => (p.sms_state === "Pending" || p.sms_state === "Processed") && age(p) > 30 * 60000); // μόνο όσα ελέγχθηκαν και ΔΕΝ έφυγαν
    state.sms.noReport = op.filter(p => p.sms_state === "Sent" && age(p) > 2 * 3600e3);
    state.sms.stuck = state.sms.stuckList.length;
  } finally { smsBusy = false; banner(); }
}
/** Αποτυχία αποστολής από το ίδιο το gateway (π.χ. κινητό εκτός) — καταγράφεται στο δέμα. */
export async function smsSendFailed(p, why) {
  try { await D.updateParcel(p.id, { sms_state: "Error", sms_state_at: new Date().toISOString(), tags: [...new Set([...(p.tags || []), SMS_FAIL_TAG])] }); } catch { /* */ }
  state.sms.lastError = why; banner();
}

// ---------------------------------------------------------------- 3) Edge Functions
const FNS = [["extract-receipt", "Ανάγνωση με AI", j => j.hasKey ? "" : "λείπει το κλειδί AI"], ["send-sms", "Αποστολή SMS", j => j.ready ? "" : "λείπουν τα στοιχεία SMS Gateway"], ["gemi-sync", "Βάση επιχειρήσεων (ΓΕΜΗ)", j => j.ready ? "" : "δεν έχει μπει κλειδί ΓΕΜΗ (προαιρετικό)"]];
async function checkFns() {
  state.fns = await Promise.all(FNS.map(async ([name, label, bad]) => {
    const t0 = performance.now();
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/" + name + "?health=1", { headers: { apikey: SUPABASE_KEY }, cache: "no-store" });
      const ms = Math.round(performance.now() - t0);
      if (!r.ok) return { name, label, ok: false, ms, note: r.status === 404 ? "δεν έχει ανέβει" : "HTTP " + r.status, optional: name === "gemi-sync" };
      const j = await r.json(); const n = bad(j);
      return { name, label, ok: !n, ms, version: j.version || "", note: n, optional: name === "gemi-sync" };
    } catch { return { name, label, ok: false, ms: null, note: navigator.onLine ? "δεν απαντά" : "χωρίς internet", optional: name === "gemi-sync" }; }
  }));
  state.at = new Date(); banner();
}

// ---------------------------------------------------------------- μπάρα προβλημάτων + παράθυρο
function problems() {
  const out = [];
  state.fns.filter(f => !f.ok && !f.optional).forEach(f => out.push("❌ " + f.label + ": " + f.note));
  staleDevices().forEach(d => out.push("📴 " + (d.operator || "Συσκευή") + " (" + d.kind + "): " + (d.pending_in + d.pending_out) + " καταχωρίσεις δεν έχουν σταλεί — άνοιξε την εφαρμογή εκεί με internet"));
  if (state.sms.failed.length) out.push("📩 " + state.sms.failed.length + " SMS δεν παραδόθηκαν — ξαναμπήκαν στο «Να ειδοποιηθούν» (κάλεσέ τους)");
  if (state.sms.stuck) out.push("📩 " + state.sms.stuck + " SMS δεν έφυγαν από το κινητό SMS εδώ και 30′ — πάτα για να δεις ποια (και να τα κλείσεις αν ειδοποίησες αλλιώς)");
  return out;
}
function banner() {
  const b = $("healthMsg"); if (!b) return;
  const p = problems(); b.hidden = !p.length;
  b.textContent = p.length ? "🩺 " + p[0] + (p.length > 1 ? "  (+" + (p.length - 1) + " ακόμα — πάτα)" : "  (πάτα για λεπτομέρειες)") : "";
}
export async function openHealth() {
  const body = $("dlgBody"); body.textContent = "";
  body.append(el("h2", null, "🩺 Κατάσταση συστήματος"), el("div", "hint", "Έλεγχος…")); $("dlg").showModal();
  await Promise.all([checkFns(), heartbeat().then(loadDevices), smsWatch(), lastBackup(D.sb).then(b => { state.backup = b; }).catch(() => {})]);
  body.textContent = ""; body.append(el("h2", null, "🩺 Κατάσταση συστήματος"));
  const sec = (t, ok) => { const h = el("h3", "hsec " + (ok ? "ok" : "bad"), (ok ? "✓ " : "⚠ ") + t); body.append(h); };
  // Edge Functions
  const fOk = state.fns.every(f => f.ok || f.optional); sec("Υπηρεσίες (Edge Functions)", fOk);
  state.fns.forEach(f => body.append(el("div", "hrow " + (f.ok ? "ok" : f.optional ? "opt" : "bad"), (f.ok ? "✓ " : f.optional ? "○ " : "✗ ") + f.label + " — " + (f.ok ? "λειτουργεί" + (f.ms != null ? " (" + f.ms + " ms)" : "") : f.note) + (f.version ? " · έκδ. " + f.version : ""))));
  // Συσκευές
  const st = staleDevices(); sec("Εκκρεμείς offline καταχωρίσεις", !st.length && !state.devErr);
  if (state.devErr) body.append(el("div", "hrow bad", state.devErr));
  (state.devices || []).forEach(d => {
    const pend = (d.pending_in || 0) + (d.pending_out || 0), me = d.id === DEV_ID;
    body.append(el("div", "hrow " + (pend ? (st.includes(d) ? "bad" : "warn") : "ok"),
      (me ? "👉 " : "") + (d.operator || "—") + " · " + d.kind + " · " + ago(d.last_seen) + " · " +
      (pend ? "⏳ " + (d.pending_in ? d.pending_in + " φωτογραφίες εισερχ." : "") + (d.pending_in && d.pending_out ? " + " : "") + (d.pending_out ? d.pending_out + " φορτώσεις εξερχ." : "") + (d.oldest_pending ? " (από " + ago(d.oldest_pending) + ")" : "") : "τίποτα σε αναμονή") +
      (d.version && typeof __BUILD__ !== "undefined" && d.version !== __BUILD__ ? " · ⚠ παλιά έκδοση" : "")));
  });
  if (state.devices && !state.devices.length && !state.devErr) body.append(el("div", "hint", "Καμία συσκευή δεν έχει δηλωθεί ακόμα."));
  // SMS
  const s = state.sms; sec("SMS (τελευταίες 48 ώρες)", !s.failed.length && !s.stuck);
  body.append(el("div", "hrow", "Στάλθηκαν " + s.sent + " · παραδόθηκαν " + s.delivered + " · σε εξέλιξη " + s.pending + " · απέτυχαν " + s.failed.length));
  if (s.unsupported) body.append(el("div", "hrow warn", "Η παρακολούθηση παράδοσης θέλει τη νέα έκδοση του send-sms — ξανανέβασέ το στο Supabase."));
  // «κλείσ' το»: σημειώνει το SMS ως τακτοποιημένο ώστε να μη χτυπά άλλο (το δέμα μένει όπως είναι)
  const dismiss = async (list, b) => { b.disabled = true; for (const p of list) { try { await D.updateParcel(p.id, { sms_state: "Dismissed", sms_state_at: new Date().toISOString() }); } catch { /* */ } }
    await smsWatch(); openHealth(); };
  const who = p => (p.recipient_name || "—") + " · " + (p.recipient_phone || "") + (p.receipt_no ? " · απόδ. " + p.receipt_no : "") + " · " + new Date(p.notified_at).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  if (s.stuck) {
    body.append(el("div", "hrow bad", s.stuck + " SMS δεν έφυγαν από το κινητό SMS μετά από 30′. Έλεγξε ότι το κινητό είναι ανοιχτό, με μπαταρία, σήμα και ανοιχτή την εφαρμογή SMS Gateway — μόλις συνδεθεί, φεύγουν μόνα τους."));
    for (const p of s.stuckList.slice(0, 20)) { const r = el("div", "hrow bad", "⏳ " + who(p) + " ");
      const b = el("button", "btn small", "✓ Το ειδοποίησα αλλιώς — κλείσ' το"); b.type = "button"; b.onclick = () => dismiss([p], b); r.append(b); body.append(r); }
  }
  if ((s.noReport || []).length) { const r = el("div", "hrow", "ℹ " + s.noReport.length + " SMS έφυγαν από το κινητό αλλά δεν ήρθε επιβεβαίωση παράδοσης (συνήθως κλειστό κινητό παραλήπτη ή εταιρεία που δεν στέλνει αναφορά). Δεν χρειάζεται κάτι. ");
    const b = el("button", "btn small", "✓ Κλείσ' τα"); b.type = "button"; b.onclick = () => dismiss(s.noReport, b); r.append(b); body.append(r); }
  s.failed.slice(0, 20).forEach(p => body.append(el("div", "hrow bad", "✗ " + (p.recipient_name || "—") + " · " + (p.recipient_phone || "") + " · " + (p.sms_state === "Error" ? "δεν στάλθηκε" : "δεν παραδόθηκε"))));
  if (s.lastError) body.append(el("div", "hint", "Τελευταίο σφάλμα αποστολής: " + s.lastError));
  // Αντίγραφο
  const bk = state.backup, bOk = bk && bk.name && bk.name.slice(0, 10) >= new Date(Date.now() - 36 * 3600e3).toISOString().slice(0, 10);
  sec("Αντίγραφο ασφαλείας", !!bOk);
  body.append(el("div", "hrow " + (bOk ? "ok" : "bad"), bk ? "Τελευταίο: " + bk.name + (bk.size ? " · " + Math.round(bk.size / 1024) + " KB" : "") : "Δεν βρέθηκε αντίγραφο"));
  body.append(el("div", "hint", "Έλεγχος: " + (state.at ? state.at.toLocaleTimeString("el-GR") : "—") + " · αυτή η συσκευή: " + KIND + " " + DEV_ID));
}
export function initHealth(deps) {
  D = deps;
  if ($("healthMsg")) $("healthMsg").onclick = openHealth;
  setTimeout(() => { heartbeat(); checkFns(); loadDevices().then(banner); }, 10000);
  setInterval(heartbeat, 60000);
  setInterval(() => loadDevices().then(banner), 120000);
  setInterval(smsWatch, 120000); setTimeout(smsWatch, 25000);
  setInterval(checkFns, 600000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) heartbeat(); });
  window.addEventListener("online", heartbeat);
}
export const pokeHealth = () => heartbeat();
