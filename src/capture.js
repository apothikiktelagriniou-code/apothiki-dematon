// Φωτογραφίες → ανάγνωση με AI → αυτόματη καταχώρηση ή λίστα ελέγχου.
// Οι φωτογραφίες περιμένουν σε IndexedDB αν δεν υπάρχει σύνδεση, και στέλνονται μόλις επανέλθει.
import { isGreeklishName, greekName, unsureNote, surnameFirst, norm, cleanPhone, fmtGr, parseGrDate, autoSaveDecision, extractedToParcel, problemText, shelfFor, HOME } from "./lib.js";

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
    let items = (await obAll()).sort((a, b) => a.at - b.at);
    while (items.length && navigator.onLine) {
      const chunk = items.splice(0, 3);
      const res = await Promise.all(chunk.map(processOne));
      await refreshOutboxInfo();
      if (res.includes("offline")) break;
    }
  } finally { running = false; }
  await refreshOutboxInfo();
  if (stats.total) {
    const done = stats.auto + stats.review + stats.fail;
    show($("capMsg"), "Καταχωρήθηκαν αυτόματα: " + stats.auto + (stats.pieces ? " (από αυτά " + stats.pieces + " επιπλέον τεμάχια υπαρχουσών αποστολών)" : "") + " · Για έλεγχο: " + stats.review + (stats.fail ? " · Απέτυχαν: " + stats.fail : "") + (done < stats.total ? " · Σε αναμονή: " + (stats.total - done) : ""), stats.review || stats.fail ? "warn" : "ok");
    if (done >= stats.total) { D.sb.from("batches").insert({ photo_count: stats.total, auto_saved: stats.auto, queued: stats.review, failed: stats.fail, device: matchMedia("(pointer:fine)").matches ? "pc" : "phone", operator: D.operator() }).then(() => {}); stats.total = 0; }
  }
}
async function processOne(it) {
  const pkgIdx = typeof it.pkgIdx === "number" ? it.pkgIdx : -1;
  const { data, error } = await D.sb.functions.invoke("extract-receipt", { body: { images: it.imgs.map(d => ({ data: d, media_type: "image/jpeg" })), package_index: pkgIdx } });
  if (error) {
    const st = error.context && error.context.status;
    if (!st || error.name === "FunctionsFetchError" || error.name === "FunctionsRelayError") return "offline"; // ξαναδοκιμή αργότερα
    if (st === 401) { show($("capMsg"), "Η σύνδεση έληξε. Αποσυνδέσου και ξαναμπές — οι φωτογραφίες περιμένουν.", "bad"); return "offline"; }
    let body = {}; try { body = await error.context.json(); } catch {}
    if (body.error === "missing_key") { show($("capMsg"), "Λείπει το κλειδί Anthropic στο Supabase (Edge Functions → Secrets → ANTHROPIC_API_KEY).", "bad"); return "offline"; }
    await toQueue(it, { notes: "Σφάλμα ανάγνωσης: " + (body.detail || body.error || ("HTTP " + st)) }, ["ai_unavailable"]); stats.review++; await obDel(it.id); return "review";
  }
  const d = data.data; if (it.old) d.old_stock = true;
  if (!d.recipient_is_business && isGreeklishName(d.recipient)) { d.recipient_latin = d.recipient; d.recipient = greekName(d.recipient); } // greeklish → ελληνικά
  d.recipient = surnameFirst(d.recipient, d.recipient_is_business); // πρώτα το επώνυμο
  // τηλέφωνο από αρχείο πελατών
  const custs = d.recipient ? (await D.findCustomers(d.recipient)).filter(c => (c.phones || []).length) : [];
  const ph = cleanPhone(d.phone);
  // ίδιος αριθμός απόδειξης = επόμενο τεμάχιο της ίδιας αποστολής
  const addPiece = async () => {
    const { data: rows } = await D.sb.rpc("add_piece", { p_receipt: d.receipt_no, p_total: Number(d.pieces) || 1 });
    if (rows && rows.length) { D.onSaved(rows[0]); if (it.pkg && !rows[0].package_photo_path) await D.attachPackage(rows[0].id, it.pkg, d.package_desc); stats.auto++; stats.pieces = (stats.pieces || 0) + 1; await obDel(it.id); return true; }
    return false;
  };
  const ex = d.receipt_no && D.findByReceipt(d.receipt_no);
  if (ex && Math.max(ex.pieces_total || 1, Number(d.pieces) || 1) > 1 && await addPiece()) return "ok";
  const dec = autoSaveDecision(d, rn => D.receiptExists(rn), D.settings().max_reasonable_fare_eur || 40);
  if (d.pair_mismatch) { dec.auto = false; dec.problems = [...dec.problems, "pair_mismatch"]; }
  if (dec.auto) {
    const p = extractedToParcel(d);
    if (!ph && custs.length === 1) { p.recipient_phone = custs[0].phones[0]; p.phone_source = "customer_db"; p.phone_confirmed = true; }
    if (ph && d.phone_is_handwritten && custs.some(c => c.phones.includes(ph))) p.phone_confirmed = true;
    if (!ph && custs.length > 1) p.notes = [p.notes, "Βρέθηκαν " + custs.length + " πελάτες με αυτό το όνομα — διάλεξε τηλέφωνο."].filter(Boolean).join(" · ");
    const un = unsureNote(dec.flags); if (un) p.notes = [un, p.notes].filter(Boolean).join(" · ");
    if (d.recipient_latin) p.notes = [p.notes, "Ετικέτα σε greeklish: " + d.recipient_latin].filter(Boolean).join(" · ");
    if ((dec.flags || []).includes("phone") && p.phone_source !== "customer_db") p.phone_confirmed = false;
    applyOld(p, d); p.source = "photo_auto"; p.batch_id = it.batch; p.operator = it.operator; p.extraction_confidence = { ...(p.extraction_confidence || {}), unsure: d.unsure || [], biz: !!d.recipient_is_business };
    p.customer_id = custs.length === 1 ? custs[0].id : await D.linkCustomer(p.recipient_name, p.recipient_phone);
    const ins = await D.saveParcel(p);
    if (ins.error && ins.error.code === "23505" && (Number(d.pieces) || 1) > 1 && await addPiece()) return "ok";
    if (ins.error) { await toQueue(it, d, [ins.error.code === "23505" ? "duplicate" : "ai_unavailable"]); stats.review++; }
    else { D.onSaved(ins.data); if (it.pkg) await D.attachPackage(ins.data.id, it.pkg, d.package_desc); stats.auto++; }
  } else { await toQueue(it, d, dec.problems); stats.review++; }
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
  await D.sb.from("extraction_queue").insert({ batch_id: null, extracted: d, problems, thumbnail: it.thumb, package_thumb: it.pkg || null });
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
  const msg = el("div", "msg warn"); msg.hidden = true; right.append(msg);
  const bar = el("div", "toolbar");
  const save = el("button", "btn primary", "Αποθήκευση ↵"); save.type = "submit";
  const same = el("button", "btn small", "↻ Ίδιο δρομολόγιο"); same.type = "button";
  same.onclick = () => { const prev = idx > 0 ? queue[idx - 1].extracted : null; const lt = D.lastTrip();
    const src = prev && prev.origin_city && prev.departure ? { o: prev.origin_city, dep: prev.departure } : lt ? { o: lt.origin_city, dep: fmtGr(lt.departure_at) } : null;
    if (src) { inputs.origin_city.value = src.o; inputs.departure.value = src.dep; inputs.origin_city.classList.remove("bad"); inputs.departure.classList.remove("bad"); } };
  const skip = el("button", "btn small", "Απόρριψη"); skip.type = "button";
  skip.onclick = async () => { await D.sb.from("extraction_queue").update({ status: "discarded", thumbnail: null, package_thumb: null }).eq("id", q.id); loadQueue(); };
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
    if (!p.recipient_phone && p.recipient_name) { const cs = (await D.findCustomers(p.recipient_name)).filter(c => (c.phones || []).length); if (cs.length === 1) { p.recipient_phone = cs[0].phones[0]; p.phone_source = "customer_db"; p.phone_confirmed = true; } }
    applyOld(p, ed); p.source = "photo_reviewed"; p.operator = D.operator(); p.extraction_confidence = { ...(p.extraction_confidence || {}), biz: !!ed.recipient_is_business };
    p.customer_id = await D.linkCustomer(p.recipient_name, p.recipient_phone);
    const ins = await D.saveParcel(p);
    if (ins.error) { save.disabled = false; return say(ins.error.code === "23505" ? "Αυτή η απόδειξη υπάρχει ήδη." : "Δεν αποθηκεύτηκε. Δοκίμασε ξανά."); }
    D.onSaved(ins.data);
    if (pkgKeep && q.package_thumb) await D.attachPackage(ins.data.id, q.package_thumb, ed.package_desc);
    await D.sb.from("extraction_queue").update({ status: "saved", thumbnail: null, package_thumb: null, parcel_id: ins.data.id }).eq("id", q.id);
    queue = queue.filter(x => x.id !== q.id); renderQueue();
    const next = $("reviewList").querySelector("input.bad, input"); next && next.focus();
  };
  card.addEventListener("keydown", e => { if (e.key === "Escape") skip.click(); });
  return card;
}

// ---------- εκκίνηση ----------
export function initCapture(deps) {
  D = deps;
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
