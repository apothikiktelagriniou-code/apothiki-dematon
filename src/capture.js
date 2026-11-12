// Φωτογραφίες → ανάγνωση με AI → αυτόματη καταχώρηση ή λίστα ελέγχου.
// Οι φωτογραφίες περιμένουν σε IndexedDB αν δεν υπάρχει σύνδεση, και στέλνονται μόλις επανέλθει.
import { sound } from "./scan.js";
import { isGreeklishName, greekName, unsureNote, surnameFirst, norm, cleanPhone, fmtGr, parseGrDate, autoSaveDecision, extractedToParcel, problemText, shelfFor, HOME, fmtPhone, safeAutoPhone } from "./lib.js";

let D; // εξαρτήσεις από main.js
const $ = id => document.getElementById(id);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const show = (n, t, c) => { n.textContent = t; n.className = "msg " + c; n.hidden = !t; };

// ---------- IndexedDB (ουρά αποστολής) ----------
const idb = () => new Promise((res, rej) => { const r = indexedDB.open("apothiki", 1); r.onupgradeneeded = () => r.result.createObjectStore("outbox", { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function ob(mode, fn) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction("outbox", mode); const s = tx.objectStore("outbox"); const out = fn(s); tx.oncomplete = () => res(out && out.result !== undefined ? out.result : out); tx.onerror = () => rej(tx.error); }); }
const obAll = () => ob("readonly", s => s.getAll());
const obPut = v => ob("readwrite", s => s.put(v));
const obDel = id => ob("readwrite", s => s.delete(id));

// ---------- εικόνες ----------
function loadImg(file) { return new Promise((res, rej) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = rej; i.src = u; }); }
export async function toJpegB64(file, max, q) {
  const img = await loadImg(file); const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q).split(",")[1];
}

// ---------- δίσκος (πριν την αποστολή) ----------
// Κάθε φωτογραφία έχει τύπο: "label" (ετικέτα από κοντά) ή "parcel" (ολόκληρο δέμα).
// Κάθε φωτογραφία του δίσκου = ετικέτα. Η φωτογραφία δέματος μπαίνει μόνο με «＋ δέμα» δίπλα στην ετικέτα.
let tray = []; // [{id, file, url, type, extra:[{file,url}]}]
const classifying = 0;
export function pairUp(photos) {
  const out = []; let cur = null;
  for (const ph of photos) {
    if (ph.type === "parcel") {
      if (cur && cur.label && !cur.pkg) cur.pkg = ph; else out.push({ label: null, pkg: ph });
      cur = null;
    } else { cur = { label: ph, pkg: null }; out.push(cur); }
  }
  return out;
}
function slot(ph, role, idx) {
  const s = el("div", "tslot " + role);
  const i = el("img"); i.src = ph.url; i.alt = (role === "pkg" ? "Δέμα " : "Ετικέτα ") + (idx + 1); s.append(i);
  ph.extra.forEach(x => { const j = el("img", "textra"); j.src = x.url; j.alt = "2η φωτογραφία"; s.append(j); });
  const bar = el("div", "tbar");
  bar.append(el("span", "ttype", ph.type === "parcel" ? "📦 Δέμα" : "🏷 Ετικέτα"));
  if (ph.type !== "parcel" && ph.extra.length < 1) { const add = el("label", "btn small", "＋ τηλ."); add.title = "2η φωτογραφία της ετικέτας (π.χ. χειρόγραφο τηλέφωνο)";
    const f = el("input"); f.type = "file"; f.accept = "image/*"; f.hidden = true;
    f.onchange = () => { const x = f.files[0]; if (x) { ph.extra.push({ file: x, url: URL.createObjectURL(x) }); renderTray(); } }; add.append(f); bar.append(add); }
  const del = el("button", "btn small", "✕"); del.type = "button"; del.setAttribute("aria-label", "Αφαίρεση");
  del.onclick = () => { URL.revokeObjectURL(ph.url); ph.extra.forEach(x => URL.revokeObjectURL(x.url)); tray = tray.filter(x => x !== ph); renderTray(); };
  bar.append(del); s.append(bar); return s;
}
function renderTray() {
  const t = $("tray"); t.textContent = "";
  const pairs = pairUp(tray);
  pairs.forEach((pr, idx) => {
    const box = el("div", "tpair" + (!pr.label ? " orphan" : ""));
    box.append(el("div", "tnum", String(idx + 1)));
    box.append(slot(pr.label, "lbl", idx));
    if (pr.pkg) box.append(slot(pr.pkg, "pkg", idx));
    t.append(box);
  });
  const nPkg = pairs.filter(p => p.pkg).length;
  $("sendBtn").hidden = !tray.length; $("sendBtn").disabled = classifying > 0;
  $("sendBtn").textContent = classifying ? "Αναγνώριση φωτογραφιών…" : "Αποστολή (" + pairs.length + " δέματα" + (nPkg ? ", " + nPkg + " με φωτο δέματος" : "") + ")";
  $("trayHint").hidden = !tray.length;
  $("trayHint").textContent = "Κάθε φωτογραφία = μία ετικέτα. Φωτογραφία δέματος: από την κάρτα του δέματος («📷 Φωτο δέματος»).";
}
function addFiles(files) {
  const add = [...files].filter(f => f.type.startsWith("image/")).sort((a, b) => a.lastModified - b.lastModified)
    .map(f => ({ id: crypto.randomUUID(), file: f, url: URL.createObjectURL(f), type: "label", extra: [] }));
  if (!add.length) return;
  tray.push(...add); renderTray();
  if ($("autoSend").checked) send(); // αυτόματη αποστολή, όπως στα εξερχόμενα
}

async function send() {
  if (D.needOperator() || classifying) return;
  const pairs = pairUp(tray); const all = tray; tray = []; renderTray();
  show($("capMsg"), "Ετοιμάζω " + pairs.length + " δέματα…", "info");
  const batch = crypto.randomUUID();
  for (const pr of pairs) {
    try {
      const lbl = pr.label ? [pr.label.file, ...pr.label.extra.map(x => x.file)] : [];
      const imgs = await Promise.all([...lbl, ...(pr.pkg ? [pr.pkg.file] : [])].map(f => toJpegB64(f, 1600, 0.8)));
      const pkg = pr.pkg ? await toJpegB64(pr.pkg.file, 1200, 0.72) : null;
      const thumb = await toJpegB64((pr.label || pr.pkg).file, 1000, 0.6);
      await obPut({ id: crypto.randomUUID(), batch, imgs, pkgIdx: pr.pkg ? lbl.length : -1, pkg, thumb, at: Date.now(), operator: D.operator(), old: $("oldStock").checked });
    } catch { /* χαλασμένη εικόνα */ }
  }
  all.forEach(ph => { URL.revokeObjectURL(ph.url); ph.extra.forEach(x => URL.revokeObjectURL(x.url)); });
  stats = { auto: 0, review: 0, fail: 0, pieces: 0, total: pairs.length };
  pump();
}

const FILL_TXT = { receipt_no: "αριθμός", recipient: "παραλήπτης", origin_city: "πόλη", departure: "ώρα", fare_eur: "κόμιστρο", pieces: "τεμάχια", destination_city: "προορισμός" };
/** Για την «Κατάσταση συστήματος»: πόσες φωτογραφίες περιμένουν σε αυτή τη συσκευή και από πότε. */
export async function outboxInfo() { const a = await obAll().catch(() => []); return { n: a.length, oldest: a.length ? Math.min(...a.map(x => x.at)) : null }; }
// ---------- επεξεργασία ουράς ----------
let running = false, stats = { auto: 0, review: 0, fail: 0, total: 0 };
async function refreshOutboxInfo() {
  const n = (await obAll().catch(() => [])).length;
  $("queueInfo").textContent = n ? "⏳ " + n + " φωτογραφίες σε αναμονή" + (navigator.onLine ? " — στέλνονται τώρα…" : " — θα σταλούν μόλις υπάρξει σύνδεση.") : "";
}
export async function pump() {
  await refreshOutboxInfo();
  if (running || !navigator.onLine) return;
  running = true;
  try {
    // ξαναδιαβάζει την ουρά σε κάθε γύρο: ό,τι μπαίνει από την κάμερα όσο τρέχει, παίρνεται αμέσως
    for (;;) {
      if (!navigator.onLine) break;
      const items = (await obAll()).sort((a, b) => a.at - b.at); if (!items.length) break;
      const res = await Promise.all(items.slice(0, 3).map(processOne));
      await refreshOutboxInfo();
      if (res.includes("offline")) break;
    }
  } finally { running = false; }
  await refreshOutboxInfo();
  if (stats.total) {
    const done = stats.auto + stats.review + stats.fail;
    show($("capMsg"), "Καταχωρήθηκαν αυτόματα: " + stats.auto + (stats.pieces ? " (από αυτά " + stats.pieces + " επιπλέον τεμάχια υπαρχουσών αποστολών)" : "") + " · Για έλεγχο: " + stats.review + (stats.fail ? " · Απέτυχαν: " + stats.fail : "") + (done < stats.total ? " · Σε αναμονή: " + (stats.total - done) : "") + (stats.inList ? " · 📋 Στην κατάσταση: " + stats.inList : "") + (stats.notIn ? " · ⚠ Εκτός κατάστασης: " + stats.notIn : "") + (stats.ask ? " · 👤 Ρωτάω ποιος πελάτης: " + stats.ask : ""), stats.review || stats.notIn || stats.fail ? "warn" : "ok");
    if (done >= stats.total) { D.sb.from("batches").insert({ photo_count: stats.total, auto_saved: stats.auto, queued: stats.review, failed: stats.fail, device: matchMedia("(pointer:fine)").matches ? "pc" : "phone", operator: D.operator() }).then(() => {}); stats.total = 0; }
  }
}
// ---------- αποτέλεσμα ανά φωτογραφία: πράσινο (πέρασε) / κόκκινο (δεν πέρασε) ----------
const waiters = new Map();
function report(id, r) { const w = waiters.get(id); if (w) { waiters.delete(id); w(r); } else pageFlash(r); }
let pfT = null, efT = null;
export function edgeFlash(ok) {
  const e = $("edgeFlash"); if (!e) return; clearTimeout(efT);
  e.className = "edgeflash " + (ok ? "ok" : "bad"); e.hidden = false;
  efT = setTimeout(() => { e.hidden = true; }, ok ? 1300 : 3000);
}
function pageFlash(r) {
  const f = $("capFlash"); if (!f) return; clearTimeout(pfT);
  f.className = "scanflash capflash " + (r.ok ? "ok" : "bad"); f.hidden = false;
  edgeFlash(r.ok); r.ok ? sound.ok() : sound.bad(); // πράσινο/κόκκινο πλαίσιο σε όλη την οθόνη + ήχος
  $("capBig").textContent = r.ok ? "✓ ΠΕΡΑΣΕ" : "✗ ΔΕΝ ΠΕΡΑΣΕ"; $("capName").textContent = r.name || ""; $("capSub").textContent = r.sub || "";
  pfT = setTimeout(() => { f.hidden = true; }, r.ok ? 1300 : 3500);
}
const subOk = p => p.status === "transit" ? "Μεταφόρτωση → " + (p.destination_city || "") : (p.shelf ? "Ράφι " + p.shelf : "") ;
/** Μία φωτογραφία ετικέτας από την κάμερα → ουρά → υπόσχεση με το αποτέλεσμα ({ok, name, sub}). */
export async function enqueueShot(file) {
  if (D.needOperator()) return null;
  const id = crypto.randomUUID(); const res = new Promise(r => waiters.set(id, r));
  const img = await toJpegB64(file, 1600, 0.8), thumb = await toJpegB64(file, 1000, 0.6);
  await obPut({ id, batch: "cam-" + new Date().toDateString(), imgs: [img], pkgIdx: -1, pkg: null, thumb, at: Date.now(), operator: D.operator(), old: $("oldStock").checked });
  if (!stats.total) stats = { auto: 0, review: 0, fail: 0, pieces: 0, total: 0 }; stats.total++;
  pump(); return res;
}
async function processOne(it) {
  const pkgIdx = typeof it.pkgIdx === "number" ? it.pkgIdx : -1;
  // αν το AI την είχε ήδη διαβάσει (αλλά έπεσε το internet πριν αποθηκευτεί), δεν ξαναπληρώνουμε ανάγνωση
  let data = it.extracted ? { data: JSON.parse(JSON.stringify(it.extracted)) } : null, error = null; const t0 = Date.now();
  if (!data) ({ data, error } = await D.sb.functions.invoke("extract-receipt", { body: { images: it.imgs.map(d => ({ data: d, media_type: "image/jpeg" })), package_index: pkgIdx } }));
  if (error) {
    const st = error.context && error.context.status;
    if (!st || error.name === "FunctionsFetchError" || error.name === "FunctionsRelayError") return "offline"; // ξαναδοκιμή αργότερα
    if (st === 401) { show($("capMsg"), "Η σύνδεση έληξε. Αποσυνδέσου και ξαναμπές — οι φωτογραφίες περιμένουν.", "bad"); return "offline"; }
    let body = {}; try { body = await error.context.json(); } catch {}
    if (body.error === "missing_key") { show($("capMsg"), "Λείπει το κλειδί Anthropic στο Supabase (Edge Functions → Secrets → ANTHROPIC_API_KEY).", "bad"); return "offline"; }
    try { await toQueue(it, { notes: "Σφάλμα ανάγνωσης: " + (body.detail || body.error || ("HTTP " + st)) }, ["ai_unavailable"]); } catch { return "offline"; }
    stats.review++; await obDel(it.id);
    report(it.id, { ok: false, name: "Δεν διαβάστηκε", sub: "Πήγε στο «Για έλεγχο» — ξαναφωτογράφισε πιο καθαρά" }); return "review";
  }
  const raw = JSON.parse(JSON.stringify(data.data));
  const secs = it.extracted ? "" : " · " + ((Date.now() - t0) / 1000).toFixed(1).replace(".", ",") + "″"; // πόση ώρα πήρε η ανάγνωση
  // «Για έλεγχο» που δεν πέρασε (π.χ. έπεσε το internet): η φωτογραφία μένει στη συσκευή με ό,τι διάβασε το AI και ξαναδοκιμάζεται
  const review = async (dd, pr) => { try { await toQueue(it, dd, pr); return true; } catch { await obPut({ ...it, extracted: raw }).catch(() => {}); return false; } };
  const d = data.data; if (it.old) d.old_stock = true;
  // κατάσταση που ανέβηκε πριν: τσεκάρισμα + συμπλήρωση ό,τι δεν διαβάστηκε καλά
  const h = D.expectHelp && D.expectHelp(d);
  if (h) {
    Object.assign(d, h.d);
    if (h.item) { stats.inList = (stats.inList || 0) + 1; d._mnote = [h.note, h.filled.length ? "📋 Από την κατάσταση: " + h.filled.map(f => FILL_TXT[f] || f).join(", ") : ""].filter(Boolean).join(" · "); }
    else if (h.miss) { stats.notIn = (stats.notIn || 0) + 1; d._mnote = "⚠ Δεν είναι στην κατάσταση " + (h.miss.origin_city || "") + " " + fmtGr(h.miss.departure_at); }
  }
  if (!d.recipient_is_business && isGreeklishName(d.recipient)) { d.recipient_latin = d.recipient; d.recipient = greekName(d.recipient); } // greeklish → ελληνικά
  d.recipient = surnameFirst(d.recipient, d.recipient_is_business); // πρώτα το επώνυμο
  // τηλέφωνο από αρχείο πελατών
  const custs = d.recipient ? (await D.findCustomers(d.recipient)).filter(c => (c.phones || []).length) : [];
  const ph = cleanPhone(d.phone);
  // ίδιος αριθμός απόδειξης = επόμενο τεμάχιο της ίδιας αποστολής
  const addPiece = async () => {
    const { data: rows } = await D.sb.rpc("add_piece", { p_receipt: d.receipt_no, p_total: Number(d.pieces) || 1 });
    if (rows && rows.length) { D.onSaved(rows[0]); if (it.pkg && !rows[0].package_photo_path) await D.attachPackage(rows[0].id, it.pkg, d.package_desc); stats.auto++; stats.pieces = (stats.pieces || 0) + 1; await obDel(it.id);
      report(it.id, { ok: true, name: rows[0].recipient_name || "", sub: "Τεμάχιο " + (rows[0].pieces_in || "?") + "/" + (rows[0].pieces_total || "?") + (subOk(rows[0]) ? " · " + subOk(rows[0]) : "") }); return true; }
    return false;
  };
  const ex = d.receipt_no && D.findByReceipt(d.receipt_no);
  if (ex && Math.max(ex.pieces_total || 1, Number(d.pieces) || 1) > 1 && await addPiece()) return "ok";
  const dec = autoSaveDecision(d, rn => D.receiptExists(rn), D.settings().max_reasonable_fare_eur || 40);
  // όνομα που υπάρχει ήδη (π.χ. ΣΑΚΚΟΣ) και η ετικέτα δεν έχει τηλέφωνο → ρώτα «ποιος είναι;» πριν την καταχώρηση
  if (!ph && d.recipient && D.similarCustomers) {
    const cands = await D.similarCustomers(d.recipient);
    if (cands.length && !(custs.length === 1 && cands.length === 1 && cands[0].id === custs[0].id && safeAutoPhone(custs[0], d.recipient))) { d._cands = cands; dec.auto = false; dec.problems = [...dec.problems, "confirm_customer"]; stats.ask = (stats.ask || 0) + 1; }
  }
  if (d.pair_mismatch) { dec.auto = false; dec.problems = [...dec.problems, "pair_mismatch"]; }
  if (dec.auto) {
    const p = extractedToParcel(d);
    if (!ph && custs.length === 1 && safeAutoPhone(custs[0], d.recipient)) { p.recipient_phone = safeAutoPhone(custs[0], d.recipient); p.phone_source = "customer_db"; p.phone_confirmed = true; }
    if (ph && d.phone_is_handwritten && custs.some(c => c.phones.includes(ph))) p.phone_confirmed = true;
    if (!ph && !p.recipient_phone && custs.length) p.notes = [p.notes, "Στο αρχείο υπάρχει «" + d.recipient + "» αλλά δεν είναι σίγουρο ποιος — διάλεξε τηλέφωνο."].filter(Boolean).join(" · ");
    const un = unsureNote(dec.flags); if (un) p.notes = [un, p.notes].filter(Boolean).join(" · ");
    if (d.recipient_latin) p.notes = [p.notes, "Ετικέτα σε greeklish: " + d.recipient_latin].filter(Boolean).join(" · ");
    if (d._mnote) p.notes = [d._mnote, p.notes].filter(Boolean).join(" · ");
    if ((dec.flags || []).includes("phone") && p.phone_source !== "customer_db") p.phone_confirmed = false;
    applyOld(p, d); p.source = "photo_auto"; p.batch_id = it.batch; p.operator = it.operator; p.extraction_confidence = { ...(p.extraction_confidence || {}), unsure: d.unsure || [], biz: !!d.recipient_is_business };
    p.customer_id = await D.linkCustomer(p.recipient_name, p.recipient_phone);
    const ins = await D.saveParcel(p);
    if (ins.error && ins.error.code === "23505" && (Number(d.pieces) || 1) > 1 && await addPiece()) return "ok";
    if (ins.error) { const pr = [ins.error.code === "23505" ? "duplicate" : "ai_unavailable"]; if (!await review(d, pr)) return "offline"; stats.review++; report(it.id, { ok: false, name: d.recipient || d.receipt_no || "", sub: pr.map(problemText).join(" · ") + " → «Για έλεγχο»" }); }
    else { D.onSaved(ins.data); if (it.pkg) await D.attachPackage(ins.data.id, it.pkg, d.package_desc); stats.auto++; report(it.id, { ok: true, name: ins.data.recipient_name || "", sub: subOk(ins.data) + secs }); }
  } else { if (!await review(d, dec.problems)) return "offline"; stats.review++; report(it.id, { ok: false, name: d.recipient || d.receipt_no || "", sub: dec.problems.map(problemText).join(" · ") + " → «Για έλεγχο»" }); }
  await obDel(it.id);
  return "ok";
}
// «Παλιό απόθεμα»: το δέμα ήταν ήδη στην αποθήκη πριν την εφαρμογή → άφιξη = ημερομηνία ετικέτας
export const OLD_TAG = "Παλιό απόθεμα";
function applyOld(p, d) {
  if (!d || !d.old_stock) return;
  const t = p.departure_at || p.issued_at; const today = new Date(); today.setHours(0, 0, 0, 0);
  if (t && new Date(t) < today) { p.created_at = t; p.status_at = t; p.extraction_confidence = { ...(p.extraction_confidence || {}), registered_at: new Date().toISOString() }; }
  p.tags = [...new Set([...(p.tags || []), OLD_TAG])];
}
async function toQueue(it, d, problems) {
  const { error } = await D.sb.from("extraction_queue").insert({ batch_id: null, extracted: d, problems, thumbnail: it.thumb, package_thumb: it.pkg || null });
  if (error) throw error; // ΔΕΝ σβήνουμε τη φωτογραφία αν δεν μπήκε στο «Για έλεγχο»
  loadQueue();
}

// ---------- λίστα ελέγχου ----------
let queue = [];
export const pendingReviewCount = () => queue.length;
export async function loadQueue() {
  const { data } = await D.sb.from("extraction_queue").select("*").eq("status", "pending").order("created_at").limit(100);
  queue = data || []; renderQueue();
}
const QF = [["receipt_no", "Αρ. απόδειξης", "mono"], ["recipient", "Παραλήπτης", ""], ["phone", "Τηλέφωνο", "mono"], ["origin_city", "Από", ""],
  ["destination_city", "Προορισμός", ""], ["departure", "Αναχώρηση", "mono"], ["fare_eur", "Κόμιστρο €", "mono"], ["parcel_code", "Κωδ. δέματος", "mono"], ["package_desc", "Συσκευασία", ""]];
const fieldOfProblem = p => ({ missing_receipt_no: "receipt_no", duplicate: "receipt_no", missing_recipient: "recipient", missing_origin: "origin_city", missing_fare: "fare_eur", fare_out_of_range: "fare_eur", missing_departure: "departure", invalid_phone: "phone" }[p] || (p.startsWith("unsure:") ? p.slice(7) : ""));

const cards = new Map();
function renderQueue() {
  const panel = $("reviewPanel"); panel.hidden = !queue.length;
  $("reviewCount").textContent = queue.length;
  const list = $("reviewList"); const ids = new Set(queue.map(q => q.id));
  for (const [id, c] of cards) if (!ids.has(id)) { c.remove(); cards.delete(id); }
  queue.forEach((q, i) => { if (!cards.has(q.id)) { const c = reviewCard(q, i); cards.set(q.id, c); list.append(c); } });
}
function reviewCard(q, idx) {
  const d = { ...q.extracted }; const card = el("form", "rcard"); card.autocomplete = "off";
  const img = el("img", "rthumb"); img.alt = "Φωτογραφία απόδειξης"; if (q.thumbnail) img.src = "data:image/jpeg;base64," + q.thumbnail;
  img.onclick = () => img.classList.toggle("zoom");
  const left = el("div", "rimgs"); left.append(img);
  let pkgKeep = !!q.package_thumb;
  if (q.package_thumb) {
    const pw = el("div", "rpkg"); const pi = el("img", "rthumb"); pi.alt = "Φωτογραφία δέματος"; pi.src = "data:image/jpeg;base64," + q.package_thumb; pi.onclick = () => pi.classList.toggle("zoom");
    const rm = el("button", "btn small", "✕ Χωρίς φωτο δέματος"); rm.type = "button"; rm.onclick = () => { pkgKeep = false; pw.remove(); };
    pw.append(el("div", "hint", "📦 Φωτογραφία δέματος"), pi, rm); left.append(pw);
  }
  const right = el("div", "rfields");
  const probs = el("div", "rprobs"); q.problems.forEach(p => probs.append(el("span", "codb", problemText(p)))); right.append(probs);
  if (d.notes) right.append(el("div", "hint", d.notes));
  if (d._mnote) right.append(el("div", "hint", d._mnote));
  let chosen = null;
  const candBox = el("div", "rcands");
  if ((d._cands || []).length) {
    candBox.append(el("div", "hint", "👤 Είναι κάποιος από αυτούς; Πάτα και αποθηκεύεται με το τηλέφωνό του."));
    d._cands.forEach(c => (c.phones || []).forEach((ph, i) => { const b = el("button", "btn cand", "");
      b.append(el("b", null, c.name), el("span", null, " · " + fmtPhone(ph) + (i ? "" : " · " + c.n + " δέμα" + (c.n === 1 ? "" : "τα") + (c.last ? " · τελ. " + fmtGr(c.last).slice(0, 5) : "")) + (c.starred ? " ⭐" : "") + (c.phones.length > 1 ? " · ⚠ πολλά κινητά" : "")));
      b.type = "button"; b.onclick = () => { chosen = { ...c, phones: [ph], _multi: c.phones.length > 1 }; inputs.recipient.value = c.name; inputs.phone.value = ph; card.requestSubmit(); }; candBox.append(b); }));
    const none = el("button", "btn small", "Κανένας — άλλος παραλήπτης"); none.type = "button";
    none.onclick = () => { chosen = null; candBox.remove(); inputs.phone.focus(); }; candBox.append(none);
    right.append(candBox);
  }
  const bad = new Set(q.problems.map(fieldOfProblem));
  const inputs = {};
  const g = el("div", "rgrid");
  QF.forEach(([k, label, cls]) => { const w = el("div", "f"); const i = el("input", cls); i.value = d[k] == null ? "" : String(d[k]); i.name = k;
    if (bad.has(k)) i.classList.add("bad"); if (k === "phone") i.inputMode = "tel"; if (k === "fare_eur") i.inputMode = "decimal";
    if (k === "origin_city" || k === "destination_city") i.setAttribute("list", "cities");
    w.append(el("label", null, label), i); g.append(w); inputs[k] = i; });
  if (!inputs.destination_city.value) inputs.destination_city.placeholder = HOME;
  const kind = el("select"); ["Ασυνόδευτο", "Συνοδευτικό"].forEach(t => kind.append(new Option(t))); kind.value = "Ασυνόδευτο";
  const kw = el("div", "f"); kw.append(el("label", null, "Τύπος"), kind); g.append(kw);
  const hw = el("label", "check"); const hwc = el("input"); hwc.type = "checkbox"; hwc.checked = !!d.phone_is_handwritten; hw.append(hwc, document.createTextNode(" Τηλ. από χειρόγραφο")); g.append(hw);
  right.append(g);
  if (inputs.recipient) { // «Μήπως εννοείς…;» κάτω από το όνομα (μόνο πρόταση)
    const nh = el("div", "hint"); inputs.recipient.closest(".f").append(nh);
    const sug = () => { nh.textContent = ""; const s = D.nameSuggest && D.nameSuggest(inputs.recipient.value); if (!s) return;
      const b = el("button", "btn small", s.to); b.type = "button"; b.onclick = () => { inputs.recipient.value = s.to; nh.textContent = ""; inputs.recipient.dispatchEvent(new Event("input")); };
      nh.append(s.latin ? "🔤 Στα ελληνικά: " : "✎ Μήπως εννοείς: ", b, " ;"); };
    sug(); inputs.recipient.addEventListener("change", sug);
  }
  const msg = el("div", "msg warn"); msg.hidden = true; right.append(msg);
  const bar = el("div", "toolbar");
  const save = el("button", "btn primary", "Αποθήκευση ↵"); save.type = "submit";
  const same = el("button", "btn small", "↻ Ίδιο δρομολόγιο"); same.type = "button";
  same.onclick = () => { const prev = idx > 0 ? queue[idx - 1].extracted : null; const lt = D.lastTrip();
    const src = prev && prev.origin_city && prev.departure ? { o: prev.origin_city, dep: prev.departure } : lt ? { o: lt.origin_city, dep: fmtGr(lt.departure_at) } : null;
    if (src) { inputs.origin_city.value = src.o; inputs.departure.value = src.dep; inputs.origin_city.classList.remove("bad"); inputs.departure.classList.remove("bad"); } };
  const skip = el("button", "btn small", "Απόρριψη"); skip.type = "button";
  skip.onclick = async () => {
    if (!skip.dataset.sure) { skip.dataset.sure = "1"; skip.textContent = "Σίγουρα; Πάτα ξανά"; setTimeout(() => { delete skip.dataset.sure; skip.textContent = "Απόρριψη"; }, 5000); return; } // 2 πατήματα: η φωτογραφία σβήνεται οριστικά
    await D.sb.from("extraction_queue").update({ status: "discarded", thumbnail: null, package_thumb: null }).eq("id", q.id); loadQueue(); };
  bar.append(save, same, skip); right.append(bar);
  card.append(left, right);
  card.onsubmit = async e => {
    e.preventDefault(); if (D.needOperator()) return;
    const v = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim()]));
    const ed = { ...d, ...v, kind: kind.value, fare_eur: v.fare_eur ? Number(v.fare_eur.replace(",", ".")) : null, phone_is_handwritten: hwc.checked };
    const say = t => { msg.textContent = t; msg.hidden = false; };
    if (!ed.receipt_no && !ed.recipient) return say("Γράψε τουλάχιστον αριθμό απόδειξης ή παραλήπτη.");
    if (v.phone && !cleanPhone(v.phone)) return say("Το τηλέφωνο δεν μοιάζει σωστό (10 ψηφία).");
    if (v.departure && !parseGrDate(v.departure)) return say("Η αναχώρηση θέλει μορφή 31/10/2026 17:00.");
    if (ed.receipt_no && D.receiptExists(ed.receipt_no)) return say("Αυτή η απόδειξη υπάρχει ήδη. Πάτα «Απόρριψη».");
    save.disabled = true;
    const p = extractedToParcel(ed);
    if (p.phone_source === "handwritten") p.phone_confirmed = true; // το είδε άνθρωπος στον έλεγχο
    if (chosen && cleanPhone(v.phone) === chosen.phones[0]) { p.phone_source = "customer_db"; p.phone_confirmed = true; }
    if (!p.recipient_phone && p.recipient_name) { const cs = (await D.findCustomers(p.recipient_name)).filter(c => (c.phones || []).length); if (cs.length === 1 && safeAutoPhone(cs[0], p.recipient_name)) { p.recipient_phone = safeAutoPhone(cs[0], p.recipient_name); p.phone_source = "customer_db"; p.phone_confirmed = true; } }
    if (ed._mnote) p.notes = [ed._mnote, p.notes].filter(Boolean).join(" · ");
    applyOld(p, ed); p.source = "photo_reviewed"; p.operator = D.operator(); p.extraction_confidence = { ...(p.extraction_confidence || {}), biz: !!ed.recipient_is_business };
    p.customer_id = chosen && !chosen._multi && cleanPhone(v.phone) === chosen.phones[0] ? chosen.id : await D.linkCustomer(p.recipient_name, p.recipient_phone);
    const ins = await D.saveParcel(p);
    if (ins.error) { save.disabled = false; return say(ins.error.code === "23505" ? "Αυτή η απόδειξη υπάρχει ήδη." : "Δεν αποθηκεύτηκε. Δοκίμασε ξανά."); }
    D.onSaved(ins.data);
    if (pkgKeep && q.package_thumb) await D.attachPackage(ins.data.id, q.package_thumb, ed.package_desc);
    await D.sb.from("extraction_queue").update({ status: "saved", thumbnail: null, package_thumb: null, parcel_id: ins.data.id }).eq("id", q.id);
    queue = queue.filter(x => x.id !== q.id); renderQueue();
    const next = $("reviewList").querySelector("input.bad, input"); next && next.focus();
  };
  card.addEventListener("keydown", e => { if (e.key !== "Escape" || e.target.matches("input,select,textarea")) return; skip.click(); }); // Esc μέσα σε πεδίο = κλείσιμο λίστας, ΟΧΙ απόρριψη
  return card;
}

// ---------- εκκίνηση ----------
export function initCapture(deps) {
  D = deps;
  document.querySelector('label[for="photos"]')?.addEventListener("click", () => sound.unlock()); // ο ήχος θέλει ένα πάτημα πρώτα (iPhone)
  $("photos").onchange = e => { addFiles(e.target.files); e.target.value = ""; };
  $("sendBtn").onclick = send;
  // ο διακόπτης «Παλιό απόθεμα» κρατά μόνο για σήμερα (για να μη μείνει ξεχασμένος ανοιχτός)
  const today = new Date().toDateString(); let on = false; try { on = localStorage.getItem("oldStock") === today; } catch {}
  const sync = () => { $("oldStockL").classList.toggle("on", $("oldStock").checked); try { localStorage.setItem("oldStock", $("oldStock").checked ? today : ""); } catch {} };
  $("oldStock").checked = on; $("oldStock").onchange = sync; sync();
  try { $("autoSend").checked = localStorage.getItem("autoSend") !== "0"; } catch {}
  $("autoSend").onchange = () => { try { localStorage.setItem("autoSend", $("autoSend").checked ? "1" : "0"); } catch {} if ($("autoSend").checked && tray.length) send(); };
  const cap = $("captureBox");
  ["dragenter", "dragover"].forEach(t => cap.addEventListener(t, e => { e.preventDefault(); cap.classList.add("drop"); }));
  ["dragleave", "drop"].forEach(t => cap.addEventListener(t, () => cap.classList.remove("drop")));
  cap.addEventListener("drop", e => { e.preventDefault(); addFiles(e.dataTransfer.files); });
  document.addEventListener("paste", e => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); addFiles(f); } });
  window.addEventListener("online", pump);
  setInterval(pump, 30000);
  pump(); loadQueue();
  D.sb.channel("queue").on("postgres_changes", { event: "*", schema: "public", table: "extraction_queue" }, () => loadQueue()).subscribe();
}
