import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import {
  HOME, norm, shelfFor, cleanPhone, fmtPhone, parseGrDate, fmtGr, toLocalInput, money, hoursSince, daysSince,
  tripsOf, tripLabel, sortTrips, isClosed, isTransit, parseLabel, fillTemplate, toCSV, cleanIdDoc, sameReceipt, likelySameParcel, sameNameTrip,
} from "./lib.js";
import { initCapture, pendingReviewCount, toJpegB64 } from "./capture.js";
import { openManifest } from "./manifest.js";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const show = (node, text, cls) => { node.textContent = text; node.className = "msg " + cls; node.hidden = !text; };
const store = { get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

const STATUS = { arrived: "Ήρθε", notified: "Ειδοποιήθηκε", done: "Παραδόθηκε", transit: "Μεταφόρτωση", forwarded: "Προωθήθηκε", returned: "Επεστράφη" , not_arrived: "Δεν πέρασε από αποθήκη"};
let settings = { reminder_days: 3, transit_alert_hours: 3, old_parcel_days: 5, max_reasonable_fare_eur: 40, city_colors: {}, notification_template: "{αρ}", reminder_template: "{αρ}" };
let rows = new Map();       // id → parcel
let filter = "all", cityFilter = "", tripFilter = "", tripDay = "", editingId = null;
let openBox = { id: null, kind: null }; // ειδοποίηση/παράδοση/προώθηση/ζημιά
let bulk = false, shelfManual = false, customerChoice = null;

// ---------------------------------------------------------------- χειριστής
const operator = () => store.get("operator");
const STAFF = [...$("opInput").options].map(o => o.value).filter(Boolean);
// ---------------------------------------------------------------- θέμα (φωτεινό / σκούρο)
function curTheme() { const t = document.documentElement.dataset.theme; return t || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
function paintThemeBtn() { const d = curTheme() === "dark"; $("themeBtn").textContent = d ? "☀️" : "🌙"; $("themeBtn").title = d ? "Φωτεινό θέμα" : "Σκούρο θέμα"; }
$("themeBtn").onclick = () => { const t = curTheme() === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = t; try { localStorage.setItem("theme", t); } catch {} paintThemeBtn(); };
paintThemeBtn();
function renderOperator() {
  if (operator() && !STAFF.includes(operator())) store.set("operator", "");
  $("opName").textContent = operator() || "όνομα;";
  $("opForm").hidden = !!operator();
}
$("opBtn").onclick = () => { $("opForm").hidden = false; $("opInput").value = operator(); $("opInput").focus(); };
$("opForm").onsubmit = e => { e.preventDefault(); const v = $("opInput").value; if (!v) return; store.set("operator", v); renderOperator(); };
$("opInput").addEventListener("change", () => { if ($("opInput").value) $("opForm").requestSubmit(); });
function needOperator() {
  if (operator()) return false;
  $("opForm").hidden = false; $("opInput").focus();
  show($("formMsg"), "Γράψε πρώτα ποιος δουλεύει (πάνω).", "warn");
  if ($("editDlg").open) $("editDlg").close();
  return true;
}

// ---------------------------------------------------------------- σύνδεση
async function boot() {
  const { data } = await sb.auth.getSession();
  if (!data.session) { $("login").hidden = false; $("app").hidden = true; return; }
  $("login").hidden = true; $("app").hidden = false;
  renderOperator();
  await loadSettings();
  await loadParcels(); loadManifests(); setInterval(loadManifests, 120000);
  subscribe();
  loadNotes();
  checkSms().then(render);
  initCapture({ sb, operator, attachPackage, needOperator, findCustomers, linkCustomer, lastTrip, settings: () => settings,
    receiptExists: rn => [...rows.values()].some(p => !(p.bypassed && p.status === "not_arrived") && sameReceipt(p.receipt_no, rn)),
    saveParcel,
    findByReceipt: rn => [...rows.values()].find(p => !(p.bypassed && p.status === "not_arrived") && sameReceipt(p.receipt_no, rn)),
    updatePiece: async (p, patch) => { try { return await updateParcel(p.id, patch); } catch { return null; } },
    onSaved: p => { rows.set(p.id, p); scheduleRender(); } });
}
$("loginForm").onsubmit = async e => {
  e.preventDefault(); $("lgBtn").disabled = true; show($("lgMsg"), "", "bad");
  const email = $("lgEmail").value.trim().toLowerCase(), password = $("lgPass").value;
  let error = null;
  try { ({ error } = await sb.auth.signInWithPassword({ email, password })); } catch (e) { error = e; }
  $("lgBtn").disabled = false;
  if (error) {
    const code = error.code || "", st = error.status;
    const txt = code === "invalid_credentials" || st === 400 ? "Λάθος email ή κωδικός. Πάτα «Εμφάνιση κωδικού» και έλεγξε κεφαλαία/μικρά και γλώσσα πληκτρολογίου (ελληνικά/αγγλικά)."
      : code === "email_not_confirmed" ? "Ο λογαριασμός δεν έχει επιβεβαιωθεί. Στο Supabase → Authentication → Users, επιβεβαίωσέ τον."
      : !navigator.onLine || st === 0 || /fetch|network|Failed/i.test(error.message || "") ? "Δεν υπάρχει σύνδεση με τον διακομιστή. Έλεγξε το internet του κινητού (Wi-Fi/δεδομένα) και δοκίμασε ξανά."
      : st === 429 ? "Πολλές προσπάθειες. Περίμενε 1–2 λεπτά και δοκίμασε ξανά."
      : "Η σύνδεση απέτυχε: " + (error.message || "άγνωστο σφάλμα") + (st ? " (" + st + ")" : "");
    show($("lgMsg"), txt, "bad"); return;
  }
  boot();
};
$("lgShow").onchange = e => { $("lgPass").type = e.target.checked ? "text" : "password"; };
$("logoutBtn").onclick = async () => { await sb.auth.signOut(); location.reload(); };

async function loadSettings() {
  const { data } = await sb.from("app_settings").select("*").eq("id", 1).maybeSingle();
  if (data) settings = data;
}

// ---------------------------------------------------------------- δεδομένα
async function loadParcels() {
  const since = new Date(Date.now() - 45 * 864e5).toISOString();
  const { data, error } = await sb.from("parcels").select("*")
    .or(`status.in.(arrived,notified,transit),created_at.gte.${since}`)
    .order("created_at", { ascending: false }).limit(5000);
  if (error) { show($("netMsg"), "Δεν φορτώθηκαν τα δέματα. Έλεγξε τη σύνδεση και ανανέωσε τη σελίδα.", "bad"); return; }
  rows = new Map(data.map(p => [p.id, p]));
  render(); purgeAllClosed();
}
function subscribe() {
  sb.channel("live")
    .on("postgres_changes", { event: "*", schema: "public", table: "parcels" }, ev => {
      if (ev.eventType === "DELETE") rows.delete(ev.old.id); else rows.set(ev.new.id, ev.new);
      scheduleRender();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "shift_notes" }, () => loadNotes())
    .subscribe(st => { $("netMsg").hidden = st === "SUBSCRIBED" || st === "CLOSED"; if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") show($("netMsg"), "Χάθηκε η ζωντανή σύνδεση — οι αλλαγές από την άλλη συσκευή θα φανούν με ανανέωση.", "warn"); });
}
let rT = null; const scheduleRender = () => { clearTimeout(rT); rT = setTimeout(render, 120); };
window.addEventListener("online", () => { $("netMsg").hidden = true; loadParcels(); });
window.addEventListener("offline", () => show($("netMsg"), "Χωρίς σύνδεση στο internet.", "warn"));

/** Νέο δέμα· αν υπάρχει ήδη στη λίστα «Δεν πέρασαν» (ίδιος αριθμός), το μεταφέρει αντί για διπλή εγγραφή. */
async function saveParcel(o) {
  const ex = o.receipt_no && [...rows.values()].find(p => p.source === "manifest" && p.status === "not_arrived" && likelySameParcel(p, o));
  if (ex) {
    const patch = { ...o, bypassed: false, receipt_no: o.receipt_no, status_at: new Date().toISOString() };
    const res = await sb.from("parcels").update(patch).eq("id", ex.id).select().single();
    if (!res.error) rows.set(ex.id, res.data);
    return res;
  }
  return sb.from("parcels").insert(o).select().single();
}
async function updateParcel(id, patch) {
  const { data, error } = await sb.from("parcels").update({ ...patch, operator: operator() }).eq("id", id).select().single();
  if (error) throw error;
  rows.set(id, data); render(); purgePackage(data); return data;
}

// ---------------------------------------------------------------- φωτογραφία δέματος (σβήνεται όταν κλείσει)
async function attachPackage(id, b64, desc) {
  try {
    const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const path = id + ".jpg";
    const { error } = await sb.storage.from("packages").upload(path, new Blob([u8], { type: "image/jpeg" }), { upsert: true, contentType: "image/jpeg" });
    if (error) throw error;
    const patch = { package_photo_path: path }; const cur = rows.get(id); if (desc && !(cur && cur.package_desc)) patch.package_desc = desc;
    const { data } = await sb.from("parcels").update(patch).eq("id", id).select().single();
    if (data) { rows.set(id, data); render(); purgePackage(data); }
  } catch (e) { console.warn("package photo", e); }
}
const purging = new Set();
async function purgePackage(p) {
  if (!p || !p.package_photo_path || !isClosed(p) || purging.has(p.id)) return;
  purging.add(p.id);
  try {
    await sb.storage.from("packages").remove([p.package_photo_path]);
    const { data } = await sb.from("parcels").update({ package_photo_path: null }).eq("id", p.id).select().single();
    if (data) rows.set(p.id, data);
  } catch (e) { console.warn("purge", e); } finally { purging.delete(p.id); }
}
function purgeAllClosed() { [...rows.values()].filter(p => p.package_photo_path && isClosed(p)).forEach(purgePackage); }
// «📷 Φωτο δέματος» από την κάρτα: φωτογραφία → σύντομη περιγραφή από AI → αποθήκευση
function pickPackagePhoto(p, btn) {
  if (needOperator()) return;
  const f = el("input"); f.type = "file"; f.accept = "image/*"; f.capture = "environment";
  f.onchange = async () => {
    const file = f.files[0]; if (!file) return;
    const lbl = btn.querySelector(".gl"); const old = lbl.textContent; lbl.textContent = "⏳ Ανάλυση…"; btn.disabled = true;
    try {
      const b64 = await toJpegB64(file, 1200, 0.72);
      let desc = "";
      try {
        const { data } = await sb.functions.invoke("extract-receipt", { body: { mode: "describe", images: [{ data: b64, media_type: "image/jpeg" }] } });
        desc = (data && data.data && data.data.package_desc) || "";
        const ph = data && data.data && cleanPhone(data.data.phone);
        if (ph && !p.recipient_phone) await updateParcel(p.id, { recipient_phone: ph, phone_source: "handwritten", phone_confirmed: false });
      } catch { /* χωρίς περιγραφή — η φωτογραφία κρατιέται */ }
      if (desc) { const { data } = await sb.from("parcels").update({ package_desc: desc }).eq("id", p.id).select().single(); if (data) rows.set(p.id, data); }
      await attachPackage(p.id, b64, desc);
      show($("formMsg"), "📷 " + (p.recipient_name || "Δέμα") + ": " + (desc || "η φωτογραφία αποθηκεύτηκε (χωρίς περιγραφή)"), "ok");
    } catch { lbl.textContent = old; btn.disabled = false; show($("formMsg"), "Δεν αποθηκεύτηκε η φωτογραφία. Δοκίμασε ξανά.", "bad"); }
  };
  f.click();
}
async function showPackage(p) {
  const { data } = await sb.storage.from("packages").createSignedUrl(p.package_photo_path, 300);
  const b = $("dlgBody"); b.textContent = "";
  b.append(el("h3", null, "📦 " + (p.recipient_name || p.receipt_no || "Δέμα")), el("div", "hint", p.package_desc || ""));
  if (data) { const i = el("img", "pkgimg"); i.alt = "Φωτογραφία δέματος"; i.src = data.signedUrl; b.append(i); } else b.append(el("div", "msg warn", "Δεν βρέθηκε η φωτογραφία."));
  $("dlg").showModal();
}

// ---------------------------------------------------------------- πελάτες
async function findCustomers(name) {
  const k = norm(name); if (!k) return [];
  const { data } = await sb.from("customers").select("*").eq("name_key", k).limit(5);
  return data || [];
}
async function linkCustomer(name, phone) {
  const k = norm(name); if (!k) return null;
  let c = null;
  if (phone) { const { data } = await sb.from("customers").select("*").contains("phones", [phone]).limit(1); c = data && data[0]; }
  if (!c) { const list = await findCustomers(name); if (list.length === 1) c = list[0]; }
  if (c) {
    if (phone && !(c.phones || []).includes(phone)) await sb.from("customers").update({ phones: [phone, ...(c.phones || [])] }).eq("id", c.id);
    return c.id;
  }
  const { data } = await sb.from("customers").insert({ full_name: name.trim(), phones: phone ? [phone] : [] }).select("id").single();
  return data ? data.id : null;
}
async function lookupCustomerForForm() {
  const name = $("recipient_name").value; const hint = $("custHint"); hint.textContent = ""; customerChoice = null;
  if (!norm(name) || $("recipient_phone").value.trim()) return;
  const list = (await findCustomers(name)).filter(c => (c.phones || []).length);
  if (list.length === 1) {
    $("recipient_phone").value = list[0].phones[0]; $("recipient_phone").classList.add("ai");
    $("recipient_phone").dataset.src = "customer_db"; customerChoice = list[0].id;
    hint.textContent = "📇 Τηλέφωνο από το αρχείο πελατών.";
  } else if (list.length > 1) {
    hint.textContent = "Βρέθηκαν " + list.length + " πελάτες με αυτό το όνομα: ";
    list.forEach(c => { const b = el("button", "btn small", fmtPhone(c.phones[0])); b.type = "button";
      b.onclick = () => { $("recipient_phone").value = c.phones[0]; $("recipient_phone").dataset.src = "customer_db"; customerChoice = c.id; hint.textContent = "📇 Επιλέχθηκε."; };
      hint.append(" ", b); });
  }
}

// ---------------------------------------------------------------- φόρμα
const FIELDS = ["receipt_no", "parcel_code", "kind", "origin_city", "destination_city", "fare_eur", "recipient_name", "recipient_phone", "shelf", "sender_name", "package_desc", "item", "cod_amount_eur", "notes", "pieces_total", "pieces_in"];
function clearForm() {
  for (const f of FIELDS) { const e = $(f); e.classList.remove("ai"); if (e.tagName === "SELECT") e.selectedIndex = 0; else e.value = ""; delete e.dataset.src; }
  editingId = null; shelfManual = false; customerChoice = null; $("custHint").textContent = ""; $("destHint").textContent = "";
  $("saveBtn").textContent = "Αποθήκευση"; show($("editMsg"), "", "info"); ["departure_d", "departure_t", "issued_d", "issued_t", "ret_d", "ret_t", "ret_bus", "ret_note"].forEach(i => { $(i).value = ""; }); $("ret_on").checked = false; $("retSet").hidden = true; $("retFields").hidden = true;
}
function fillForm(o, ai) {
  for (const f of FIELDS) if (o[f] != null && o[f] !== "") { $(f).value = o[f]; if (ai) $(f).classList.add("ai"); }
  if (ai) { autoShelf(); lookupCustomerForForm(); }
}
function autoShelf() {
  const dest = norm($("destination_city").value);
  if (dest && dest !== HOME) { $("shelf").value = ""; $("destHint").textContent = "Μεταφόρτωση: δεν μπαίνει σε ράφι."; return; }
  $("destHint").textContent = "";
  if (shelfManual && $("shelf").value.trim()) return;
  const s = shelfFor($("recipient_name").value); $("shelf").value = s; $("shelf").classList.toggle("ai", !!s);
}
$("recipient_name").addEventListener("input", autoShelf);
$("recipient_name").addEventListener("change", lookupCustomerForForm);
$("destination_city").addEventListener("input", autoShelf);
$("shelf").addEventListener("input", () => { shelfManual = !!$("shelf").value.trim(); });
$("recipient_phone").addEventListener("input", () => { $("recipient_phone").dataset.src = "manual"; });
for (const f of FIELDS) $(f).addEventListener("input", e => e.target.classList.remove("ai"));
$("clearBtn").onclick = () => { clearForm(); $("editDlg").close(); };
$("editClose").onclick = () => { clearForm(); $("editDlg").close(); };
$("newManualBtn").onclick = () => { if (needOperator()) return; clearForm(); setDT("departure", null); $("departure_d").value = tripDay || ""; $("issued_d").value = tripDay || ""; $("editTitle").textContent = "Νέο δέμα (χωρίς φωτογραφία)"; render(); $("editDlg").showModal(); $("recipient_name").focus(); };

function readForm() {
  const v = f => $(f).value.trim();
  const fare = v("fare_eur") ? Number(v("fare_eur").replace(",", ".")) : null;
  const cod = v("cod_amount_eur") ? Number(v("cod_amount_eur").replace(",", ".")) : null;
  const dest = norm(v("destination_city")) || HOME;
  const phone = cleanPhone(v("recipient_phone"));
  const o = {
    receipt_no: v("receipt_no").replace(/\s/g, "") || null, parcel_code: v("parcel_code").toUpperCase() || null, kind: v("kind"),
    origin_city: norm(v("origin_city")) || null, destination_city: dest,
    issued_at: getDT("issued"), departure_at: getDT("departure"),
    fare_eur: fare, recipient_name: v("recipient_name"), recipient_phone: phone || null,
    phone_source: phone ? ($("recipient_phone").dataset.src || "manual") : null,
    shelf: dest === HOME ? (v("shelf").toUpperCase() || shelfFor(v("recipient_name")) || null) : null, shelf_manual: shelfManual,
    sender_name: v("sender_name") || null, package_desc: v("package_desc") || null, item: v("item") || null, cod_amount_eur: cod, notes: v("notes") || null,
    pieces_total: Math.max(1, parseInt(v("pieces_total"), 10) || 1), pieces_in: Math.max(0, parseInt(v("pieces_in"), 10) || 1),
  };
  // Όποιος αποθηκεύει τη φόρμα έχει δει το τηλέφωνο μπροστά του → μετράει ως επιβεβαίωση.
  // Αν το άλλαξε με το χέρι, δεν είναι πια «χειρόγραφο από AI».
  const prev = editingId && rows.get(editingId);
  if (prev && o.phone_source === "handwritten" && o.recipient_phone !== prev.recipient_phone) o.phone_source = "manual";
  o.phone_confirmed = true;
  return o;
}
$("form").addEventListener("submit", async e => {
  e.preventDefault();
  for (const id of ["departure_t", "issued_t", "ret_t"]) if (parseT24($(id).value) === null) { show($("editMsg"), "Λάθος ώρα: γράψε 24ωρη μορφή, π.χ. 17:30.", "bad"); $(id).focus(); return; } if (needOperator()) return;
  const o = readForm();
  if (!o.receipt_no && !o.recipient_name) { show($("editMsg"), "Γράψε τουλάχιστον αριθμό απόδειξης ή παραλήπτη.", "warn"); return; }
  if ($("recipient_phone").value.trim() && !o.recipient_phone) { show($("editMsg"), "Το τηλέφωνο δεν μοιάζει σωστό (10 ψηφία, κινητό από 69). Διόρθωσέ το ή άφησέ το κενό.", "warn"); return; }
  if (o.fare_eur != null && (isNaN(o.fare_eur) || o.fare_eur < 0)) { show($("editMsg"), "Το κόμιστρο δεν είναι σωστό ποσό.", "warn"); return; }
  if (o.fare_eur > Number(settings.max_reasonable_fare_eur || 40) && !confirmInline("Κόμιστρο " + money(o.fare_eur) + " — σίγουρα σωστό; Πάτα ξανά Αποθήκευση για επιβεβαίωση.")) return;
  const btn = $("saveBtn"); btn.disabled = true;
  try {
    o.customer_id = customerChoice || (o.recipient_name ? await linkCustomer(o.recipient_name, o.recipient_phone) : null);
    if (editingId) {
      const cur = rows.get(editingId) || {};
      if ($("ret_on").checked) {
        const when = getDT("ret");
        if (!when || !$("ret_t").value.trim()) { show($("editMsg"), "Για την επιστροφή βάλε ημερομηνία και ώρα δρομολογίου.", "warn"); $(!$("ret_d").value ? "ret_d" : "ret_t").focus(); return; }
        if (!o.origin_city) { show($("editMsg"), "Συμπλήρωσε το «Από» (σταθμό αποστολής) για να ξέρουμε πού επιστρέφει.", "warn"); $("origin_city").focus(); return; }
        const now = new Date().toISOString();
        Object.assign(o, { status: "returned", status_at: cur.status === "returned" ? cur.status_at : now, fwd_at: cur.status === "returned" ? cur.fwd_at : now,
          fwd_destination: o.origin_city, fwd_departure_at: when, fwd_bus: $("ret_bus").value.trim().toUpperCase() || null, fwd_note: $("ret_note").value.trim() || null });
      } else if (cur.status === "returned") {
        Object.assign(o, { status: o.destination_city === HOME ? "arrived" : "transit", status_at: new Date().toISOString(), fwd_at: null, fwd_destination: null, fwd_departure_at: null, fwd_bus: null, fwd_note: null });
      }
      await updateParcel(editingId, o);
      clearForm(); $("editDlg").close(); show($("formMsg"), "Ενημερώθηκε.", "ok");
    } else {
      o.status = o.destination_city === HOME ? "arrived" : "transit"; o.source = "manual"; o.operator = operator();
      const { data, error } = await saveParcel(o);
      if (error) {
        if (error.code === "23505") { const ex = [...rows.values()].find(r => r.receipt_no === o.receipt_no); show($("editMsg"), "Αυτή η απόδειξη έχει ήδη καταχωρηθεί" + (ex ? " (" + ex.recipient_name + ", " + fmtGr(ex.created_at) + ")" : "") + ".", "warn"); return; }
        throw error;
      }
      rows.set(data.id, data); render();
      clearForm(); $("editDlg").close(); show($("formMsg"), "Αποθηκεύτηκε" + (data.shelf ? " — Ράφι " + data.shelf : data.status === "transit" ? " — Μεταφόρτωση" : "") + ".", "ok");
    }
  } catch (err) { console.error(err); show($("editMsg"), "Δεν αποθηκεύτηκε. Δοκίμασε ξανά.", "bad"); }
  finally { btn.disabled = false; }
});
let pendingConfirm = "";
function confirmInline(text) { if (pendingConfirm === text) { pendingConfirm = ""; return true; } pendingConfirm = text; show($("editMsg"), text, "warn"); return false; }

function lastTrip() {
  return [...rows.values()].filter(p => p.departure_at && p.origin_city).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
}
// ημερομηνία + ώρα σε ξεχωριστά κελιά
const p2_ = n => String(n).padStart(2, "0");
function setDT(prefix, iso) {
  const d = iso ? new Date(iso) : null;
  $(prefix + "_d").value = d && !isNaN(d) ? d.getFullYear() + "-" + p2_(d.getMonth() + 1) + "-" + p2_(d.getDate()) : "";
  $(prefix + "_t").value = d && !isNaN(d) ? p2_(d.getHours()) + ":" + p2_(d.getMinutes()) : "";
}
// ώρα πάντα 24ωρη: «930» → 09:30, «1730» → 17:30
function parseT24(s) {
  const d = String(s || "").replace(/\D/g, ""); if (!d) return "";
  const h = d.length <= 2 ? d : d.slice(0, d.length - 2), m = d.length <= 2 ? "00" : d.slice(-2);
  return +h <= 23 && +m <= 59 ? p2_(+h) + ":" + m : null;
}
function t24(el) {
  el.addEventListener("input", () => { const d = el.value.replace(/\D/g, "").slice(0, 4); el.value = d.length > 2 ? d.slice(0, d.length - 2) + ":" + d.slice(-2) : d; });
  el.addEventListener("blur", () => { const t = parseT24(el.value); if (t) el.value = t; });
}
document.querySelectorAll(".t24").forEach(t24);
// ημερομηνία + 24ωρη ώρα για τα κουτιά πάνω στην κάρτα
function dtFields(box, dLabel, tLabel, iso) {
  const d = field(box, dLabel, inp("", { type: "date" })); const t = field(box, tLabel, inp("", { className: "mono", inputMode: "numeric", maxLength: 5, placeholder: "ΩΩ:ΛΛ (π.χ. 17:30)", autocomplete: "off" })); t24(t);
  const set = v => { const x = v ? new Date(v) : null; d.value = x && !isNaN(x) ? dayKey(x) : dayKey(new Date()); t.value = x && !isNaN(x) ? p2_(x.getHours()) + ":" + p2_(x.getMinutes()) : ""; };
  set(iso);
  return { set, get() { const tt = parseT24(t.value); if (!d.value || !tt) return null; const [y, m, dd] = d.value.split("-").map(Number); const [h, mi] = tt.split(":").map(Number); return new Date(y, m - 1, dd, h, mi).toISOString(); } };
}
function getDT(prefix) {
  const dv = $(prefix + "_d").value, tv = $(prefix + "_t").value; if (!dv) return null;
  const [y, m, d] = dv.split("-").map(Number); const [hh, mm] = (parseT24(tv) || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}
function syncRet() { $("retFields").hidden = !$("ret_on").checked; $("retTo").textContent = norm($("origin_city").value) ? "→ " + norm($("origin_city").value) : ""; }
$("ret_on").addEventListener("change", () => { syncRet(); if ($("ret_on").checked) $("ret_t").focus(); });
$("origin_city").addEventListener("input", syncRet);
function startEdit(p) {
  clearForm(); editingId = p.id;
  fillForm({ ...p, fare_eur: p.fare_eur ?? "", cod_amount_eur: p.cod_amount_eur ?? "" }, false);
  setDT("departure", p.departure_at); setDT("issued", p.issued_at);
  const isRet = p.status === "returned"; $("retSet").hidden = false; $("ret_on").checked = isRet;
  setDT("ret", isRet ? p.fwd_departure_at : null); if (!isRet) $("ret_d").value = dayKey(new Date());
  $("ret_bus").value = isRet ? p.fwd_bus || "" : ""; $("ret_note").value = isRet ? p.fwd_note || "" : ""; syncRet();
  shelfManual = !!p.shelf_manual; if (p.phone_source) $("recipient_phone").dataset.src = p.phone_source;
  $("saveBtn").textContent = "Αποθήκευση αλλαγών"; $("editTitle").textContent = "Επεξεργασία · " + (p.recipient_name || p.receipt_no || "δέμα");
  $("editDlg").showModal();
}

// ---------------------------------------------------------------- λίστα
const cityColor = c => (settings.city_colors || {})[norm(c)] || "#57534e";
const needsRemind = p => p.status === "notified" && daysSince(p.notified_at || p.status_at) >= (settings.reminder_days || 3);
const lateTransit = p => p.status === "transit" && (hoursSince(p.created_at) >= (settings.transit_alert_hours || 3) || new Date(p.created_at).toDateString() !== new Date().toDateString());
const sameDay = (iso, d) => iso && new Date(iso).toDateString() === d;
const phoneOk = p => !!p.recipient_phone;

const away = p => !!p.bypassed;
// ---------------------------------------------------------------- έλεγχος με καταστάσεις πρακτορείων
let manifests = [], chkReceipts = new Set(), chkTrips = new Set(), noneTrips = new Set();
const NO_LIST = "— ΧΩΡΙΣ ΚΑΤΑΣΤΑΣΗ —";
const rkey = r => { const d = String(r || "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; };
async function loadManifests() {
  const since = new Date(Date.now() - 45 * 864e5).toISOString();
  const { data } = await sb.from("manifests").select("id,origin_city,departure_at,agency,items,created_at").gte("created_at", since).limit(2000);
  manifests = data || []; scheduleRender();
}
function computeChecks(all) {
  chkReceipts = new Set(); chkTrips = new Set(); noneTrips = new Set();
  manifests.forEach(m => { if (m.agency === NO_LIST && m.origin_city && m.departure_at) noneTrips.add(tripsOf({ origin_city: m.origin_city, departure_at: m.departure_at })[0]); (m.items || []).forEach(it => { const k = rkey(it.receipt_no); if (k) chkReceipts.add(k); });
    if (m.origin_city && m.departure_at) chkTrips.add(tripsOf({ origin_city: m.origin_city, departure_at: m.departure_at })[0]); });
  all.forEach(p => { if (chkReceipts.has(rkey(p.receipt_no)) && p.departure_at) chkTrips.add(tripsOf(p)[0]); });
}
const inTrip = p => tripsOf(p)[0];
const receiptChecked = p => chkReceipts.has(rkey(p.receipt_no));
const tripChecked = t => chkTrips.has(t);
// «Δεν υπάρχει κατάσταση για αυτό το δρομολόγιο» → μετράει ως τακτοποιημένο (αποθηκεύεται ως κατάσταση χωρίς λίστα)
async function markNoList(t, on) {
  const [c, k] = t.split("|"); const g = [...rows.values()].find(p => inTrip(p) === t);
  if (on) await sb.from("manifests").insert({ origin_city: c, departure_at: g ? g.departure_at : null, agency: NO_LIST, items: [], found: 0, missing: 0, extra: 0, operator: operator() });
  else { const ids = manifests.filter(m => m.agency === NO_LIST && m.origin_city && m.departure_at && tripsOf({ origin_city: m.origin_city, departure_at: m.departure_at })[0] === t).map(m => m.id); if (ids.length) await sb.from("manifests").delete().in("id", ids); }
  await loadManifests();
}
function noListButtons(box, list) {
  const w = el("div", "quick"); w.style.marginTop = "6px";
  list.forEach(t => { const lbl = t.split("|")[1].split(" ")[1] + " " + t.split("|")[0]; const none = noneTrips.has(t);
    const b = el("button", "btn small", none ? "↺ " + lbl + ": αναίρεση «χωρίς κατάσταση»" : "📄— " + lbl + ": δεν υπάρχει κατάσταση"); b.type = "button";
    b.onclick = async () => { b.disabled = true; try { await markNoList(t, !none); } catch { b.disabled = false; } }; w.append(b); });
  box.append(w);
}
// δέμα που ήρθε με λεωφορείο τις τελευταίες 7 μέρες και δεν έχει ελεγχθεί με κατάσταση (ούτε το ίδιο ούτε το δρομολόγιό του)
const needsCheck = p => !away(p) && p.source !== "manifest" && daysSince(p.created_at) <= 7 && !receiptChecked(p) && !(inTrip(p) !== "__none" && tripChecked(inTrip(p)));

let focusKind = null, focusIdx = 0;
const ALERT_PRED = {
  transit: p => p.status === "transit",
  remind: p => needsRemind(p),
  hw: p => !isClosed(p) && p.phone_source === "handwritten" && !p.phone_confirmed,
  cod: p => p.cod_amount_eur > 0 && !p.cod_collected && !isClosed(p),
};
function matches(p) {
  const qq = $("q").value.trim();
  if (filter === "bypassed") { if (!(away(p) && !isTransit(p))) return false; }
  else if (filter === "direct") { if (!(away(p) && isTransit(p))) return false; }
  else if (away(p) && !qq) return false;
  if (cityFilter && p.origin_city !== cityFilter) return false;
  if (tripFilter === "__nocheck") { const t = inTrip(p); if (t === "__none" || !t.split("|")[1].startsWith(tripDay) || tripChecked(t)) return false; }
  else if (tripFilter === "__day") { if (!tripsOf(p).some(t => t !== "__none" && t.split("|")[1].startsWith(tripDay))) return false; }
  else if (tripFilter && !tripsOf(p).includes(tripFilter)) return false;
  switch (filter) {
    case "waiting": if (isClosed(p)) return false; break;
    case "tonotify": if (p.status !== "arrived") return false; break;
    case "remind": if (!needsRemind(p)) return false; break;
    case "nophone": if (isClosed(p) || isTransit(p) || phoneOk(p)) return false; break;
    case "transit": if (!(p.status === "transit" || (p.status === "forwarded" && !away(p)))) return false; break;
    case "cod": if (!(p.cod_amount_eur > 0 && !p.cod_collected)) return false; break;
    case "today": if (!sameDay(p.created_at, new Date().toDateString())) return false; break;
    case "done": if (!isClosed(p)) return false; break;
    case "nocheck": if (!needsCheck(p)) return false; break;
    case "tags": if (!(p.tags || []).length && !p.notes) return false; break;
  }
  const q = norm($("q").value); if (!q) return true;
  if (p.id_doc_number && p.id_doc_number.includes(cleanIdDoc(q)) && cleanIdDoc(q).length >= 3) return true;
  return norm([p.receipt_no, p.parcel_code, p.recipient_name, p.sender_name, p.recipient_phone, p.origin_city, p.destination_city, p.shelf, (p.tags || []).join(" "), p.notes, p.pickup_code, p.picked_by_name, p.picked_by_phone, p.id_doc_number, p.fwd_bus, p.fwd_destination, p.package_desc].join(" ")).includes(q);
}

function render() {
  const all = [...rows.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  computeChecks(all);
  const td = new Date().toDateString();
  const open = all.filter(p => !isClosed(p) && !away(p));
  $("stToday").textContent = all.filter(p => sameDay(p.created_at, td)).length;
  $("stWaiting").textContent = open.filter(p => !isTransit(p)).length;
  $("stOld").textContent = open.filter(p => daysSince(p.created_at) >= (settings.old_parcel_days || 5)).length;
  // μεταφορτώσεις της ημέρας: όσες ήρθαν ή στάλθηκαν σήμερα (και οι απευθείας), + πόσες περιμένουν ακόμα
  const trToday = all.filter(p => (isTransit(p) || p.status === "forwarded") && p.status !== "returned" && (sameDay(p.created_at, td) || (p.fwd_at && sameDay(p.fwd_at, td))));
  const trPend = all.filter(p => p.status === "transit").length;
  $("stTr").textContent = trToday.length; $("stTrL").textContent = "Μεταφορτώσεις σήμερα" + (trPend ? " · " + trPend + " περιμένουν" : "");
  const doneToday = all.filter(p => p.status === "done" && sameDay(p.picked_up_at || p.status_at, td));
  $("stDone").textContent = doneToday.length; $("stHome").textContent = doneToday.filter(p => p.home_delivery).length;

  // ειδοποιήσεις κορυφής
  const al = $("alerts"); al.textContent = "";
  // πάτημα σε ειδοποίηση → πάει στο (επόμενο) δέμα και το σημαδεύει με κόκκινο περίγραμμα
  const addAlert = (text, cls, kind) => { const n = all.filter(ALERT_PRED[kind]).length;
    const b = el("button", "msg " + cls + " alert", text + (focusKind === kind && n > 1 ? "  · " + ((focusIdx % n) + 1) + "/" + n + " — πάτα για το επόμενο" : "  ›")); b.type = "button";
    b.onclick = () => { if (focusKind === kind) focusIdx++; else { focusKind = kind; focusIdx = 0; }
      setFilter("all"); cityFilter = ""; tripFilter = ""; $("q").value = ""; openBox = { id: null }; render();
      const t = [...document.querySelectorAll("#list .row.flag")]; if (!t.length) return;
      const r = t[focusIdx % t.length]; r.scrollIntoView({ behavior: "smooth", block: "center" }); r.classList.remove("flash"); void r.offsetWidth; r.classList.add("flash"); };
    al.append(b); };
  const pendTr = all.filter(p => p.status === "transit");
  if (pendTr.length) { const late = pendTr.filter(lateTransit); const dests = [...new Set(pendTr.map(p => p.destination_city))].join(", ");
    addAlert((late.length ? "⚠ " : "⇄ ") + pendTr.length + " μεταφορτώσεις περιμένουν προώθηση (" + dests + ")" + (late.length ? " · " + late.length + " καθυστερούν" : "") + ".", late.length ? "bad" : "warn", "transit"); }
  const rem = all.filter(needsRemind).length; if (rem) addAlert("🔔 " + rem + " δέματα θέλουν υπενθύμιση.", "info", "remind");
  const hw = all.filter(p => !isClosed(p) && p.phone_source === "handwritten" && !p.phone_confirmed).length; if (hw) addAlert("✍ " + hw + " τηλέφωνα από χειρόγραφο θέλουν επιβεβαίωση.", "warn", "hw");
  const dups = findDuplicates().length; if (dups) { const b = el("button", "msg bad alert", "🔁 " + dups + " πιθανές διπλές καταχωρήσεις (κατάσταση + φωτογραφία) ›"); b.type = "button"; b.onclick = openDuplicates; al.append(b); }
  if (new Date().getDay() === 0 && store.get("invDoneDay") !== dayKey(new Date())) { const b = el("button", "msg info alert", "📦 Κυριακή: κάνε απογραφή αποθήκης ›"); b.type = "button"; b.onclick = () => { if (!needOperator()) openInventory(); }; al.append(b); }
  const cod = all.filter(p => p.cod_amount_eur > 0 && !p.cod_collected && !isClosed(p)).length; if (cod) addAlert("💶 " + cod + " δέματα με είσπραξη από τον παραλήπτη.", "warn", "cod");

  // πόλεις
  const cb = $("cityBar"); cb.textContent = ""; const cnt = {};
  open.forEach(p => { if (p.origin_city) cnt[p.origin_city] = (cnt[p.origin_city] || 0) + 1; });
  if (cityFilter && !cnt[cityFilter]) cnt[cityFilter] = 0;
  Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).forEach(c => { const b = el("button", "cchip"); b.type = "button"; b.style.setProperty("--cc", cityColor(c));
    b.setAttribute("aria-pressed", String(cityFilter === c)); b.append(el("i"), document.createTextNode(c + " " + cnt[c]));
    b.onclick = () => { cityFilter = cityFilter === c ? "" : c; render(); }; cb.append(b); });

  // δρομολόγια
  const trips = {}; all.forEach(p => tripsOf(p).forEach(t => (trips[t] = trips[t] || []).push(p)));
  if (!tripDay) tripDay = dayKey(new Date());
  $("tripDay").value = tripDay;
  const dayKeys = Object.keys(trips).filter(t => t !== "__none" && t.split("|")[1].startsWith(tripDay)).sort((a, b) => a.split("|")[1].localeCompare(b.split("|")[1]) || a.localeCompare(b));
  if (tripFilter && tripFilter !== "__day" && tripFilter !== "__nocheck" && !trips[tripFilter]) tripFilter = "";
  const inDay = dayKeys.filter(t => t[0] !== ">"); const unchk = inDay.filter(t => !tripChecked(t));
  const sel = $("tripSel"); sel.textContent = "";
  const dayAll = [...new Set(dayKeys.flatMap(t => trips[t]))];
  sel.append(new Option(dayKeys.length ? "— Όλα τα δέματα (χωρίς φίλτρο) —" : "Κανένα δρομολόγιο αυτή τη μέρα", ""));
  if (dayKeys.length) sel.append(new Option("Όλα τα δρομολόγια της ημέρας (" + dayKeys.length + " δρομ. · " + dayAll.length + " δέματα)", "__day"));
  if (inDay.length) sel.append(new Option(unchk.length ? "📄✗ Χωρίς έλεγχο κατάστασης: " + unchk.length + " από " + inDay.length + " δρομολόγια" : "📄✓ Όλα τα δρομολόγια τακτοποιήθηκαν", "__nocheck"));
  dayKeys.forEach(t => {
    const [c, k] = t.split("|"); const out = c[0] === ">"; const city = out ? c.slice(1) : c; const g = trips[t]; const open = g.filter(p => !isClosed(p)).length;
    sel.append(new Option(k.split(" ")[1] + " · " + (out ? (g.every(x => x.status === "returned") ? "↩ Επιστροφή → " : "Αποστολή → ") + city : "από " + city) + " — " + g.length + " δέματα" + (open ? ", " + open + " εκκρεμούν" : " ✓") + (out ? "" : noneTrips.has(t) ? " · 📄— χωρίς κατάσταση" : tripChecked(t) ? " · 📄✓" : " · 📄✗"), t));
  });
  if (trips.__none && trips.__none.some(p => !isClosed(p))) sel.append(new Option("Χωρίς δρομολόγιο — " + trips.__none.length + " δέματα", "__none"));
  sel.value = tripFilter;
  if (tripFilter === "__nocheck") show($("tripSum"), unchk.length ? "Δρομολόγια χωρίς έλεγχο κατάστασης: " + unchk.map(t => t.split("|")[1].split(" ")[1] + " " + t.split("|")[0]).join(", ") + ". Πάτα «📄 Έλεγχος κατάστασης» στο Μενού — ή, αν δεν ήρθε κατάσταση, πάτα το κουμπί του δρομολογίου:" : "Όλα τα δρομολόγια της ημέρας έχουν ελεγχθεί με κατάσταση ή σημειώθηκαν «χωρίς κατάσταση».", unchk.length ? "warn" : "ok");
  if (tripFilter === "__nocheck") { const marked = inDay.filter(t => noneTrips.has(t)); if (unchk.length || marked.length) noListButtons($("tripSum"), [...unchk, ...marked]); }
  else if (tripFilter === "__day") show($("tripSum"), "Δρομολόγια " + tripDay.split("-").reverse().join("/") + ": " + dayAll.length + " δέματα · εκκρεμούν " + dayAll.filter(p => !isClosed(p)).length + " · κόμιστρα " + money(dayAll.reduce((s, p) => s + (Number(p.fare_eur) || 0), 0)), "info");
  else if (tripFilter) { const g = trips[tripFilter]; const dn = g.filter(isClosed).length; const tr = g.filter(isTransit).length;
    show($("tripSum"), tripLabel(tripFilter) + ": " + g.length + " δέματα" + (tr ? " (μεταφόρτωση " + tr + ")" : "") + " · έκλεισαν " + dn + " · εκκρεμούν " + (g.length - dn) + " · κόμιστρα " + money(g.reduce((s, p) => s + (Number(p.fare_eur) || 0), 0)) + (tripFilter[0] === ">" || tripFilter === "__none" ? "" : noneTrips.has(tripFilter) ? " · 📄— χωρίς κατάσταση" : tripChecked(tripFilter) ? " · 📄✓ ελέγχθηκε" : " · 📄✗ χωρίς έλεγχο"), "info");
    if (tripFilter[0] !== ">" && tripFilter !== "__none" && (noneTrips.has(tripFilter) || !tripChecked(tripFilter))) noListButtons($("tripSum"), [tripFilter]); }
  else show($("tripSum"), "", "info");

  // μαζική ειδοποίηση
  const toN = all.filter(p => p.status === "arrived" && phoneOk(p)).length;
  $("bulkBar").hidden = !toN && !bulk; $("bulkSmsBtn").hidden = !(smsOn() && smsReady); renderSmsToggle(); $("bulkBtn").textContent = bulk ? "Σταμάτημα" : "Ειδοποίηση όλων (" + toN + ")";
  $("bulkHint").textContent = bulk ? "Πάτα κανάλι και ανοίγει το επόμενο." : "Δέματα με τηλέφωνο που δεν έχουν ειδοποιηθεί.";


  const list = $("list"); list.textContent = "";
  const vis = all.filter(matches);
  if (!vis.length) { list.append(el("div", "empty", rows.size ? "Κανένα δέμα με αυτό το φίλτρο." : "Ακόμα κανένα δέμα. Κάνε την πρώτη καταχώρηση αριστερά.")); return; }
  vis.slice(0, 300).forEach(p => list.append(card(p)));
  if (vis.length > 300) list.append(el("div", "empty", "Εμφανίζονται τα 300 πιο πρόσφατα από " + vis.length + ". Χρησιμοποίησε αναζήτηση ή φίλτρο."));
}

function card(p) {
  const tr = isTransit(p);
  const row = el("article", "row" + (focusKind && ALERT_PRED[focusKind](p) ? " flag" : "") + " st-" + p.status + (p.origin_city ? " has-city" : "") + (tr ? " is-transit" : "")); row.id = "row-" + p.id;
  if (p.origin_city) row.style.setProperty("--cc", cityColor(p.origin_city));
  const left = el("div"); left.style.minWidth = "0";
  const top = el("div", "top");
  if (p.origin_city) { const c = el("span", "city", p.origin_city); c.style.setProperty("--cc", cityColor(p.origin_city)); top.append(c); }
  top.append(el("span", "name", p.recipient_name || p.receipt_no || "Χωρίς όνομα"));
  const old = !isClosed(p) && daysSince(p.created_at) >= (settings.old_parcel_days || 5);
  const late = lateTransit(p); const rem = needsRemind(p);
  top.append(el("span", "pill " + (old || late ? "s-old" : "s-" + p.status),
    late ? "Μεταφόρτωση · " + Math.floor(hoursSince(p.created_at)) + " ώρες" : old ? STATUS[p.status] + " · " + daysSince(p.created_at) + " μέρες" : rem ? "Θέλει υπενθύμιση" : STATUS[p.status] || p.status));
  const tags = p.tags || [];
  if (tags.includes("Στο υπόγειο") && !isClosed(p)) top.append(el("span", "shelf", "📍 ΥΠΟΓΕΙΟ"));
  if (p.shelf && !isClosed(p)) top.append(el("span", "shelf", "Ράφι " + p.shelf));
  if (tr) top.append(el("span", "transit", "⇄ → " + (p.fwd_destination || p.destination_city)));
  if (p.cod_amount_eur > 0 && !p.cod_collected) top.append(el("span", "codb", "💶 ΕΙΣΠΡΑΞΗ " + money(p.cod_amount_eur)));
  const pt = p.pieces_total || 1, pin = p.pieces_in ?? 1;
  if (pt > 1) top.append(el("span", pin < pt ? "codb" : "tag", "📦 " + pin + "/" + pt + " τεμ."));
  if (p.damaged) top.append(el("span", "codb", "⚠ ΖΗΜΙΑ"));
  if (away(p)) top.append(isTransit(p) ? el("span", "transit", "⇄ ΑΠΕΥΘΕΙΑΣ ΜΕΤΑΦΟΡΤΩΣΗ") : el("span", "codb", "🚫 ΔΕΝ ΗΡΘΕ ΣΤΗΝ ΑΠΟΘΗΚΗ"));

  // πληροφορίες σε σειρές: αναχώρηση / καταχώρηση / απόδειξη / ασυνόδευτο+κόμιστρο / υπάλληλος / παρατηρήσεις
  const info = el("div", "info"); const line = (k, ...parts) => { const d = el("div", "iline"); d.append(el("span", "ik", k)); parts.filter(Boolean).forEach(x => d.append(typeof x === "string" ? el("span", null, x) : x)); info.append(d); return d; };
  line("Αναχώρηση", p.origin_city ? "από " + p.origin_city : "", p.departure_at ? fmtGr(p.departure_at) : "—");
  line("Καταχώρηση", fmtGr(p.created_at), p.notified_at && !isClosed(p) ? "· Ειδοπ. " + fmtGr(p.notified_at) + (p.notify_count > 1 ? " (" + p.notify_count + "×)" : "") : "");
  let ph = null;
  if (p.recipient_phone) { ph = el("span", null, "📞 " + fmtPhone(p.recipient_phone)); if (p.phone_source === "handwritten") {
    if (p.phone_confirmed) ph.append(" ", el("span", "badge", "✍ ✓"));
    else { const c = el("button", "btn small pkgbtn hwok", "✍ χειρόγραφο · Σωστό ✓"); c.type = "button"; c.title = "Έλεγξα το τηλέφωνο πάνω στο δέμα"; c.onclick = () => updateParcel(p.id, { phone_confirmed: true }).catch(() => show($("formMsg"), "Δεν αποθηκεύτηκε. Δοκίμασε ξανά.", "bad")); ph.append(" ", c); }
  } if (p.phone_source === "customer_db") ph.append(" ", el("span", "badge", "📇")); }
  line("Απόδειξη", el("span", "mono", p.receipt_no || "—"));
  if (ph) line("Τηλέφωνο", ph);
  const canPhoto = !isClosed(p) && p.status !== "not_arrived";
  if (p.package_desc || p.package_photo_path || canPhoto) {
    const d = line("Συσκευασία", p.package_desc || "");
    if (p.package_photo_path) { const b = el("button", "btn small pkgbtn", "📷 Προβολή"); b.type = "button"; b.onclick = () => showPackage(p); d.append(b); }
    if (canPhoto) { const b = el("button", "btn small pkgbtn" + (p.package_photo_path ? "" : " pkgadd")); b.type = "button"; b.append(el("span", "gl", p.package_photo_path ? "↻ Νέα" : "📷 + Φωτο δέματος")); b.onclick = () => pickPackagePhoto(p, b); d.append(b); }
  }
  line("Είδος", "Ασυνόδευτο", p.fare_eur != null ? "· " + money(p.fare_eur) : "");
  line("Υπάλληλος", p.operator ? "👤 " + p.operator : "—");
  const remarks = tags.filter(t => t !== "Στο υπόγειο" && t !== "Παραλήφθηκε με φθορά");
  if (remarks.length || p.notes) { const d = line("Παρατηρήσεις"); const w = el("span", "iremarks"); remarks.forEach(t => w.append(el("span", "tag", t))); if (p.notes) { const n = el("span", "inote", p.notes); n.title = "Πάτα για όλο το κείμενο"; n.onclick = () => n.classList.toggle("open"); w.append(n); } d.append(w); }
  left.append(top, info);
  const acts = el("div", "acts");
  const mk = (t, fn, cls) => { const b = el("button", "btn small" + (cls ? " " + cls : ""), t); b.type = "button"; b.onclick = fn; acts.append(b); return b; };
  const toggle = kind => () => { openBox = openBox.id === p.id && openBox.kind === kind ? { id: null } : { id: p.id, kind }; render(); const r = $("row-" + p.id); r && r.scrollIntoView({ behavior: "smooth", block: "nearest" }); };
  if (p.status === "not_arrived") {
    if (isTransit(p)) mk("Μεταφόρτωση σε δρομολόγιο", toggle("fwd"), "primary");
    mk(isTransit(p) ? "Ήρθε στην αποθήκη" : "Ήρθε τελικά", async () => { if (needOperator()) return; const dest = p.destination_city || HOME;
      await updateParcel(p.id, { bypassed: false, status: dest === HOME ? "arrived" : "transit", status_at: new Date().toISOString(), shelf: dest === HOME ? (p.shelf || shelfFor(p.recipient_name) || null) : null }).catch(() => {}); });
  } else if (p.status === "transit") mk("Προώθηση", toggle("fwd"), "primary");
  else if (!isClosed(p)) { mk(p.status === "notified" ? "Υπενθύμιση" : "Ειδοποίηση", toggle("notify")); mk("Παράδοση", toggle("pickup"), "primary"); }
  if ((p.pieces_total || 1) > 1 && (p.pieces_in ?? 1) < p.pieces_total && !isClosed(p)) {
    mk("+1 τεμάχιο", () => updateParcel(p.id, { pieces_in: (p.pieces_in ?? 1) + 1 }).catch(() => {}));
    mk("Ήρθαν όλα (" + p.pieces_total + ")", () => updateParcel(p.id, { pieces_in: p.pieces_total }).catch(() => {}));
  }
  const sec = el("div", "acts2"); const mk2 = (ic, t, fn) => { const b = el("button", "btn ghost"); b.type = "button"; b.append(el("span", "gi", ic), el("span", "gl", t)); b.onclick = fn; sec.append(b); return b; };
  mk2("✎", "Επεξεργασία", () => startEdit(p));
  if (!isClosed(p) && p.status !== "not_arrived") mk2("↩", "Επιστροφή", toggle("ret"));
  mk2("💬", "Παρατηρήσεις" + (tags.length || p.notes ? " (" + (tags.length + (p.notes ? 1 : 0)) + ")" : ""), toggle("tags"));
  mk2("🕘", "Ιστορικό", () => showHistory(p));
  row.append(left, acts);
  if (p.status === "done") {
    row.append(el("div", "meta note", ["Παρέλαβε: " + (!p.picked_by_name ? "—" : norm(p.picked_by_name) === norm(p.recipient_name || "") ? "ο ίδιος" : p.picked_by_name), p.id_doc_number ? (p.id_doc_type || "Έγγραφο") + " " + p.id_doc_number : p.id_doc_last4 ? (p.id_doc_type || "Έγγραφο") + " ••••" + p.id_doc_last4 : "", p.picked_by_phone ? fmtPhone(p.picked_by_phone) : "", fmtGr(p.picked_up_at), p.home_delivery ? "🏠 Delivery" : "", p.cod_collected ? "💶 Εισπράχθηκε " + money(p.cod_amount_eur) : ""].filter(Boolean).join(" · ")));
    if (p.signature_path) { const holder = el("div", "note"); const b = mk("Υπογραφή", () => showSignature(p, holder, b)); row.append(holder); }
  }
  if (p.status === "forwarded") row.append(el("div", "meta note", [(away(p) ? "Απευθείας μεταφόρτωση → " : "Προωθήθηκε → ") + (p.fwd_destination || p.destination_city), p.fwd_departure_at ? "δρομολόγιο " + fmtGr(p.fwd_departure_at) : "", p.fwd_bus ? "λεωφορείο " + p.fwd_bus : "", p.fwd_note || ""].filter(Boolean).join(" · ")));
  if (p.status === "returned") row.append(el("div", "meta note", ["↩ Επιστροφή → " + (p.fwd_destination || p.origin_city || "αποστολέα"), p.fwd_departure_at ? "δρομολόγιο " + fmtGr(p.fwd_departure_at) : "", p.fwd_bus ? "λεωφορείο " + p.fwd_bus : "", p.fwd_note || ""].filter(Boolean).join(" · ")));
  if (!acts.childNodes.length) acts.remove(); row.append(sec);
  if (openBox.id === p.id) row.append(openBox.kind === "notify" ? notifyBox(p) : openBox.kind === "pickup" ? pickupBox(p) : openBox.kind === "tags" ? tagsBox(p) : openBox.kind === "ret" ? retBox(p) : fwdBox(p));
  return row;
}

function setFilter(f) { filter = f; document.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.f === f))); }
document.querySelectorAll(".chip").forEach(c => c.onclick = () => { focusKind = null; setFilter(c.dataset.f); render(); });
$("q").addEventListener("input", scheduleRender);
const dayKey = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const shiftDay = n => { const [y, mo, d] = tripDay.split("-").map(Number); tripDay = dayKey(new Date(y, mo - 1, d + n)); tripFilter = ""; render(); };
$("tripSel").addEventListener("change", e => { tripFilter = e.target.value; render(); });
$("tripDay").addEventListener("change", e => { if (e.target.value) { tripDay = e.target.value; tripFilter = ""; render(); } });
$("dayPrev").onclick = () => shiftDay(-1); $("dayNext").onclick = () => shiftDay(1);
$("dayToday").onclick = () => { tripDay = dayKey(new Date()); tripFilter = ""; render(); };

// αναζήτηση και σε παλιότερα (εκτός των 45 ημερών)
let qT = null;
$("q").addEventListener("input", () => { clearTimeout(qT); const q = $("q").value.trim(); if (q.length < 3) return;
  qT = setTimeout(async () => { const s = q.replace(/[%,()]/g, " ");
    const { data } = await sb.from("parcels").select("*").or(`fwd_bus.ilike.%${s}%,recipient_name.ilike.%${s}%,receipt_no.ilike.%${s}%,recipient_phone.ilike.%${s}%,picked_by_phone.ilike.%${s}%,id_doc_number.ilike.%${s}%,picked_by_name.ilike.%${s}%,pickup_code.eq.${s}`).limit(50);
    if (data && data.length) { data.forEach(p => rows.set(p.id, p)); render(); } }, 400); });

// ---------------------------------------------------------------- ειδοποίηση
function nextToNotify(after) {
  const l = [...rows.values()].filter(p => p.status === "arrived" && phoneOk(p) && p.id !== after).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return l[0] ? l[0].id : null;
}
function notifyBox(p) {
  const box = el("div", "box");
  if (p.phone_source === "handwritten" && !p.phone_confirmed) {
    const w = el("div", "msg warn wide"); w.append("✍ Το τηλέφωνο διαβάστηκε από χειρόγραφο. Έλεγξέ το στο δέμα: ", el("b", null, fmtPhone(p.recipient_phone)), " ");
    const ok = el("button", "btn small primary", "Σωστό ✓"); ok.type = "button"; ok.onclick = () => updateParcel(p.id, { phone_confirmed: true });
    const ed = el("button", "btn small", "Διόρθωση"); ed.type = "button"; ed.onclick = () => startEdit(p);
    w.append(ok, " ", ed); box.append(w); return box;
  }
  const remind = p.status === "notified";
  const chInfo = el("div", "hint wide"); box.append(chInfo);
  const ta = el("textarea", "wide"); ta.value = fillTemplate(remind ? settings.reminder_template : settings.notification_template, p); ta.setAttribute("aria-label", "Μήνυμα");
  const bar = el("div", "toolbar wide"); const ph = p.recipient_phone;
  const mark = async ch => {
    try { await updateParcel(p.id, { status: "notified", status_at: new Date().toISOString(), notified_at: new Date().toISOString(), notify_count: (p.notify_count || 0) + 1, notify_channel: ch }); } catch {}
    openBox = bulk ? { id: nextToNotify(p.id), kind: "notify" } : { id: null }; if (!openBox.id) bulk = false; render();
  };
  const link = (label, href, ch, cls, pre) => { const a = el("a", "btn small" + (cls ? " " + cls : ""), label); a.target = "_blank"; a.rel = "noopener";
    a.onclick = async () => { a.href = href(); if (pre) await pre(); setTimeout(() => mark(ch), 400); }; a.href = href(); bar.append(a); };
  const sms = el("div", "toolbar wide"); const smsMsg = el("div", "hint wide");
  if (ph) {
    if (chOn("whatsapp")) link("WhatsApp", () => "https://wa.me/30" + ph + "?text=" + encodeURIComponent(ta.value), "whatsapp", "primary", () => setChannel(p, "whatsapp"));
    if (chOn("viber")) link("Viber", () => "viber://chat?number=%2B30" + ph + "&draft=" + encodeURIComponent(ta.value), "viber", chOn("whatsapp") ? "" : "primary", async () => { setChannel(p, "viber"); try { await navigator.clipboard.writeText(ta.value); } catch {} });
    const smsText = () => fillTemplate(settings.sms_template || "ΚΤΕΛ Αγρινίου: το δέμα σας{αρ} ήρθε. Κωδ. {κωδ}. Παραλαβή 06:30-21:30 ή delivery 3,50€ στο 6979334186", p);
    const onApps = [chOn("whatsapp") && "WhatsApp", chOn("viber") && "Viber"].filter(Boolean);
    const failTxt = onApps.length ? "✗ Ούτε " + onApps.join(" ούτε ") + " → " : "";
    if (!smsOn()) {
      const call = el("a", "btn small" + (onApps.length ? "" : " primary"), failTxt + "📞 Κλήση"); call.href = "tel:+30" + ph;
      call.onclick = async () => { await setTagCalled(p); }; sms.append(call);
    } else if (smsReady && /^69/.test(ph)) {
      const auto = el("button", "btn small" + (onApps.length ? "" : " primary"), failTxt + "📩 SMS αυτόματα"); auto.type = "button";
      auto.onclick = async () => { auto.disabled = true; smsMsg.textContent = "Αποστολή SMS…";
        const r = await sendSms(p, smsText());
        if (r.ok) { await setChannel(p, "sms"); smsMsg.textContent = "✓ Στάλθηκε SMS."; await mark("sms"); }
        else { auto.disabled = false; smsMsg.textContent = "Δεν στάλθηκε: " + r.error + ". Έλεγξε ότι το κινητό της αποθήκης είναι αναμμένο με σήμα."; } };
      sms.append(auto);
    } else {
      const a = el("a", "btn small", "SMS από αυτό το κινητό"); a.href = "sms:+30" + ph + "?&body=" + encodeURIComponent(smsText());
      a.onclick = () => { setChannel(p, "sms"); setTimeout(() => mark("sms"), 400); }; sms.append(a);
    }
    getChannel(p).then(ch => {
      const order = [chOn("whatsapp") && "WhatsApp", chOn("viber") && "Viber", smsOn() ? "SMS" : "κλήση"].filter(Boolean).join(" → αν δεν έχει, ");
      chInfo.textContent = ch === "sms" ? "📩 Ο πελάτης έχει μόνο SMS (από προηγούμενη φορά)." : ch === "whatsapp" ? "Προηγούμενη φορά: WhatsApp." : ch === "viber" ? "Προηγούμενη φορά: Viber." : "Δοκίμασε: " + order + ".";
      if (ch === "sms" && sms.firstChild) { sms.firstChild.classList.add("primary"); bar.querySelector("a")?.classList.remove("primary"); }
      if (ch === "viber" && chOn("whatsapp") && chOn("viber")) { bar.querySelectorAll("a")[0]?.classList.remove("primary"); bar.querySelectorAll("a")[1]?.classList.add("primary"); }
    });
  }
  const copy = el("button", "btn small", "Αντιγραφή"); copy.type = "button";
  copy.onclick = async () => { try { await navigator.clipboard.writeText(ta.value); copy.textContent = "Αντιγράφηκε"; } catch { ta.select(); } }; bar.append(copy);
  const close = el("button", "btn small", bulk ? "Επόμενο" : "Κλείσιμο"); close.type = "button";
  close.onclick = () => { openBox = bulk ? { id: nextToNotify(p.id), kind: "notify" } : { id: null }; if (!openBox.id) bulk = false; render(); }; bar.append(close);
  box.append(ta, bar, sms, smsMsg, el("div", "hint wide", ph ? "Viber: αν δεν εμφανιστεί το μήνυμα, έχει αντιγραφεί — κράτα πατημένο → Επικόλληση. Μόλις πατήσεις κανάλι, σημειώνεται «Ειδοποιήθηκε»." : "Δεν υπάρχει τηλέφωνο. Πάτα «Επεξεργασία» για να το προσθέσεις."));
  return box;
}
// ---------------------------------------------------------------- κανάλια & SMS
let smsReady = false; const chCache = new Map();
const smsOn = () => settings.sms_enabled === true;
const chOn = c => settings[c + "_enabled"] === true;
async function setTagCalled(p) {
  const tags = [...new Set([...(p.tags || []), "Ειδοποιήθηκε τηλεφωνικά"])];
  await updateParcel(p.id, { tags, status: "notified", status_at: new Date().toISOString(), notified_at: new Date().toISOString(), notify_count: (p.notify_count || 0) + 1, notify_channel: "call" }).catch(() => {});
  openBox = bulk ? { id: nextToNotify(p.id), kind: "notify" } : { id: null }; if (!openBox.id) bulk = false; render();
}
const CH_LABEL = { whatsapp: "WhatsApp", viber: "Viber", sms: "📩 SMS" };
function renderSmsToggle() { for (const c of ["whatsapp", "viber", "sms"]) { const b = $("tg-" + c); if (b && !b.dataset.asking) b.textContent = CH_LABEL[c] + ": " + (settings[c + "_enabled"] === true ? "ΕΝΕΡΓΟ ✓ (πάτα για απενεργοποίηση)" : "ανενεργό (πάτα για ενεργοποίηση)"); } }
async function checkSms() {
  if (!smsOn()) { smsReady = false; return; }
  try { const r = await fetch(SUPABASE_URL + "/functions/v1/send-sms?health=1", { headers: { apikey: SUPABASE_KEY } }); const j = await r.json(); smsReady = !!j.ready; } catch { smsReady = false; }
}
async function getChannel(p) {
  if (!p.customer_id) return null; if (chCache.has(p.customer_id)) return chCache.get(p.customer_id);
  const { data } = await sb.from("customers").select("channel").eq("id", p.customer_id).maybeSingle();
  const ch = data ? data.channel : null; chCache.set(p.customer_id, ch); return ch;
}
async function setChannel(p, ch) {
  if (!p.customer_id) { if (!p.recipient_name) return; const id = await linkCustomer(p.recipient_name, p.recipient_phone); if (!id) return; await updateParcel(p.id, { customer_id: id }).catch(() => {}); p = rows.get(p.id) || p; }
  chCache.set(p.customer_id, ch);
  await sb.from("customers").update({ channel: ch, channel_at: new Date().toISOString() }).eq("id", p.customer_id);
}
async function sendSms(p, text) {
  const { data, error } = await sb.functions.invoke("send-sms", { body: { phone: p.recipient_phone, text } });
  if (error) { let b = {}; try { b = await error.context.json(); } catch {} return { ok: false, error: b.error === "missing_credentials" ? "δεν έχουν μπει τα στοιχεία του κινητού στο Supabase" : (b.detail || b.error || "σφάλμα δικτύου") }; }
  if (data && data.id) updateParcel(p.id, { sms_message_id: data.id }).catch(() => {});
  return { ok: true };
}
async function bulkSms() {
  const { data } = await sb.from("customers").select("id").eq("channel", "sms").limit(5000);
  const smsIds = new Set((data || []).map(c => c.id));
  const list = [...rows.values()].filter(p => p.status === "arrived" && /^69/.test(p.recipient_phone || "") && smsIds.has(p.customer_id) && !(p.phone_source === "handwritten" && !p.phone_confirmed));
  return list;
}
for (const c of ["whatsapp", "viber", "sms"]) $("tg-" + c).onclick = async () => {
  const b = $("tg-" + c), key = c + "_enabled", on = settings[key] !== true;
  if (on && !b.dataset.asking) { b.dataset.asking = "1"; b.textContent = "Σίγουρα; Πάτα ξανά για ενεργοποίηση " + CH_LABEL[c]; setTimeout(() => { delete b.dataset.asking; renderSmsToggle(); }, 6000); return; }
  delete b.dataset.asking;
  const { error } = await sb.from("app_settings").update({ [key]: on }).eq("id", 1);
  if (error) { show($("formMsg"), "Δεν άλλαξε ο διακόπτης. Έχει τρέξει το 0006 στη βάση;", "bad"); return; }
  settings[key] = on; if (c === "sms") await checkSms(); render();
};
$("bulkSmsBtn").onclick = async () => {
  if (needOperator()) return; const b = $("bulkSmsBtn"); b.disabled = true;
  const list = await bulkSms(); if (!list.length) { $("bulkHint").textContent = "Κανένα δέμα για αυτόματο SMS (πελάτες που έχουν μόνο SMS)."; b.disabled = false; return; }
  let ok = 0, fail = 0;
  for (const p of list) { $("bulkHint").textContent = "📩 SMS " + (ok + fail + 1) + "/" + list.length + "…";
    const r = await sendSms(p, fillTemplate(settings.sms_template || "", p));
    if (r.ok) { ok++; await updateParcel(p.id, { status: "notified", status_at: new Date().toISOString(), notified_at: new Date().toISOString(), notify_count: (p.notify_count || 0) + 1, notify_channel: "sms" }).catch(() => {}); } else fail++; }
  $("bulkHint").textContent = "📩 Στάλθηκαν " + ok + " SMS" + (fail ? " · απέτυχαν " + fail : "") + "."; b.disabled = false;
};

$("bulkBtn").onclick = () => { if (bulk) { bulk = false; openBox = { id: null }; render(); return; }
  bulk = true; setFilter("tonotify"); openBox = { id: nextToNotify(null), kind: "notify" }; if (!openBox.id) bulk = false; render(); };

// ---------------------------------------------------------------- παράδοση
function field(box, label, input, wide) { const w = el("div", "f" + (wide ? " wide" : "")); w.append(el("label", null, label), input); box.append(w); return input; }
function inp(v, attrs) { const i = el("input"); i.value = v || ""; Object.assign(i, attrs || {}); return i; }
function pickupBox(p) {
  const box = el("form", "box"); box.autocomplete = "off";
  // γρήγορη παράδοση: τον παραλαμβάνει ο ίδιος ο παραλήπτης (καθημερινοί πελάτες, χωρίς στοιχεία)
  const self = el("button", "btn primary big wide selfbtn", "✓ Παρέλαβε ο ίδιος" + (p.recipient_name ? " · " + p.recipient_name : "")); self.type = "button"; box.append(self);
  box.append(el("div", "hint wide", "…ή αν παραλαμβάνει άλλο πρόσωπο / θες έγγραφο ή υπογραφή, συμπλήρωσε από κάτω:"));
  const name = field(box, "Όνομα παραλαβόντα (κενό = ο ίδιος ο παραλήπτης)", inp("", { placeholder: p.recipient_name || "Ονοματεπώνυμο", autocapitalize: "characters" }), true);
  const phone = field(box, "Τηλέφωνο παραλαβόντα (υποχρεωτικό αν είναι άλλο πρόσωπο)", inp(p.recipient_phone, { inputMode: "tel", className: "mono", autocomplete: "off" }), true);
  const when = dtFields(box, "Ημέρα παραλαβής", "Ώρα (24ωρη)", new Date().toISOString());
  const sel = el("select"); ["Ταυτότητα", "Δίπλωμα", "Διαβατήριο"].forEach(t => sel.append(new Option(t))); field(box, "Έγγραφο", sel);
  const idn = field(box, "Αριθμός εγγράφου (προαιρετικό)", inp("", { className: "mono", autocapitalize: "characters" }));
  const chk = (text) => { const l = el("label", "check wide"); const c = el("input"); c.type = "checkbox"; l.append(c, document.createTextNode(text)); box.append(l); return c; };
  const home = chk("Παράδοση στο σπίτι (delivery 3,50 €)");
  const codC = p.cod_amount_eur > 0 ? chk("Εισπράχθηκε " + money(p.cod_amount_eur) + " από τον παραλήπτη") : null;
  const pcs = (p.pieces_total || 1) > 1 ? chk("Παρέδωσα και τα " + p.pieces_total + " τεμάχια") : null;
  if (pcs && (p.pieces_in ?? 1) < p.pieces_total) box.append(el("div", "msg warn wide", "⚠ Έχουν καταχωρηθεί μόνο " + (p.pieces_in ?? 1) + " από " + p.pieces_total + " τεμάχια. Έλεγξε ότι τα έχεις όλα πριν την παράδοση."));
  const sw = el("div", "f wide"); const cv = el("canvas", "sig"); cv.setAttribute("aria-label", "Πλαίσιο υπογραφής");
  const clr = el("button", "btn small", "Καθαρισμός υπογραφής"); clr.type = "button";
  sw.append(el("label", null, "Υπογραφή παραλήπτη (προαιρετική)"), cv, clr);
  if (matchMedia("(pointer:fine)").matches) sw.append(el("div", "hint", "Η υπογραφή γίνεται πιο εύκολα από το κινητό."));
  box.append(sw);
  const msg = el("div", "msg info wide"); msg.hidden = true; box.append(msg);
  const acts = el("div", "formactions"); const ok = el("button", "btn primary", "Ολοκλήρωση παράδοσης"); ok.type = "submit";
  const cancel = el("button", "btn", "Ακύρωση"); cancel.type = "button"; cancel.onclick = () => { openBox = { id: null }; render(); };
  acts.append(ok, cancel); box.append(acts);
  let drawn = false, ctx = null, last = null;
  requestAnimationFrame(() => { const r = cv.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111"; ctx.fillStyle = "#111"; });
  const pt = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.addEventListener("pointerdown", e => { if (!ctx) return; cv.setPointerCapture(e.pointerId); last = pt(e); ctx.beginPath(); ctx.arc(last[0], last[1], 1.2, 0, 7); ctx.fill(); drawn = true; e.preventDefault(); });
  cv.addEventListener("pointermove", e => { if (!last) return; const q = pt(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); last = q; e.preventDefault(); });
  ["pointerup", "pointercancel", "pointerleave"].forEach(t => cv.addEventListener(t, () => { last = null; }));
  clr.onclick = () => { ctx && ctx.clearRect(0, 0, cv.width, cv.height); drawn = false; };
  box.onsubmit = async e => {
    e.preventDefault(); if (needOperator()) return;
    const say = (t, c) => { msg.textContent = t; msg.className = "msg " + c + " wide"; msg.hidden = false; };
    const other = !!name.value.trim() && norm(name.value) !== norm(p.recipient_name || "");
    const nm = (name.value.trim() || p.recipient_name || "").toUpperCase(), pn = cleanPhone(phone.value), idNo = cleanIdDoc(idn.value);
    if (phone.value.trim() && !pn) { phone.focus(); return say("Το τηλέφωνο δεν μοιάζει σωστό (10 ψηφία, π.χ. 6941234567) — διόρθωσέ το ή άφησέ το κενό.", "warn"); }
    if (other && !pn) { phone.focus(); return say("Παραλαμβάνει άλλο πρόσωπο: γράψε το κινητό του (10 ψηφία).", "warn"); }
    if (pcs && !pcs.checked) return say("Τσέκαρε ότι παρέδωσες και τα " + p.pieces_total + " τεμάχια.", "warn");
    if (codC && !codC.checked) return say("Τσέκαρε ότι εισπράχθηκε το ποσό " + money(p.cod_amount_eur) + ".", "warn");
    ok.disabled = true; say("Αποθήκευση…", "info");
    try {
      let path = null;
      if (drawn) {
        const blob = await signatureBlob(cv); path = p.id + ".png";
        const up = await sb.storage.from("signatures").upload(path, blob, { upsert: true, contentType: "image/png" });
        if (up.error) throw up.error;
      }
      const at = when.get() || new Date().toISOString();
      await updateParcel(p.id, { status: "done", status_at: new Date().toISOString(), picked_up_at: at, picked_by_name: nm, picked_by_phone: pn || null,
        id_doc_type: idNo ? sel.value : null, id_doc_number: idNo || null, id_doc_last4: idNo ? idNo.slice(-4) : null,
        signature_path: path, home_delivery: home.checked, cod_collected: codC ? true : p.cod_collected });
      if (nm && pn && !other) linkCustomer(nm, pn).catch(() => {});
      openBox = { id: null }; show($("formMsg"), "Παραδόθηκε: " + (p.receipt_no || nm) + (other ? " — παρέλαβε " + nm : "") + ".", "ok"); render();
    } catch (err) { console.error(err); ok.disabled = false; say("Δεν αποθηκεύτηκε. Δοκίμασε ξανά.", "bad"); }
  };
  self.onclick = async () => {
    if (needOperator()) return;
    const say = (t, c) => { msg.textContent = t; msg.className = "msg " + c + " wide"; msg.hidden = false; };
    if (pcs && !pcs.checked) { pcs.closest("label").scrollIntoView({ block: "center" }); return say("Τσέκαρε πρώτα ότι παρέδωσες και τα " + p.pieces_total + " τεμάχια, μετά ξαναπάτα «Παρέλαβε ο ίδιος».", "warn"); }
    if (codC && !codC.checked) { codC.closest("label").scrollIntoView({ block: "center" }); return say("Τσέκαρε πρώτα ότι εισπράχθηκε το ποσό " + money(p.cod_amount_eur) + ", μετά ξαναπάτα «Παρέλαβε ο ίδιος».", "warn"); }
    self.disabled = true; ok.disabled = true;
    try {
      const now = new Date().toISOString();
      await updateParcel(p.id, { status: "done", status_at: now, picked_up_at: now, picked_by_name: (p.recipient_name || "").toUpperCase() || null,
        picked_by_phone: cleanPhone(p.recipient_phone) || null, home_delivery: home.checked, cod_collected: codC ? true : p.cod_collected });
      openBox = { id: null }; show($("formMsg"), "Παραδόθηκε στον ίδιο: " + (p.recipient_name || p.receipt_no) + ".", "ok"); render();
    } catch (err) { console.error(err); self.disabled = false; ok.disabled = false; say("Δεν αποθηκεύτηκε. Δοκίμασε ξανά.", "bad"); }
  };
  return box;
}
/** Φωτογραφία → συμπιεσμένο JPEG */
async function jpegBlob(file, max, q) {
  const u = URL.createObjectURL(file); const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
  URL.revokeObjectURL(u); const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = el("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return new Promise(r => c.toBlob(r, "image/jpeg", q));
}
/** Υπογραφή → ασπρόμαυρο PNG ≤ ~8KB */
function signatureBlob(cv) {
  const W = Math.min(480, cv.width), H = Math.round(cv.height * W / cv.width);
  const c = el("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.drawImage(cv, 0, 0, W, H);
  const img = x.getImageData(0, 0, W, H); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = d[i] < 160 ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  x.putImageData(img, 0, 0);
  return new Promise(r => c.toBlob(r, "image/png"));
}
async function showSignature(p, holder, btn) {
  if (holder.dataset.open) { holder.textContent = ""; delete holder.dataset.open; btn.textContent = "Υπογραφή"; return; }
  const { data } = await sb.storage.from("signatures").createSignedUrl(p.signature_path, 300);
  holder.textContent = ""; if (data) { const i = el("img", "sigimg"); i.alt = "Υπογραφή " + (p.picked_by_name || ""); i.src = data.signedUrl; holder.append(i); } else holder.textContent = "Δεν βρέθηκε υπογραφή.";
  holder.dataset.open = "1"; btn.textContent = "Απόκρυψη υπογραφής";
}

// ---------------------------------------------------------------- προώθηση μεταφόρτωσης
function retBox(p) {
  const box = el("form", "box"); box.autocomplete = "off";
  const from = field(box, "Επιστροφή στο σταθμό", inp(p.origin_city || "", { placeholder: "π.χ. ΠΑΤΡΑ" })); from.setAttribute("list", "cities");
  const when = dtFields(box, "Δρομολόγιο — ημερομηνία", "Ώρα αναχώρησης (24ωρη)", null);
  const bus = field(box, "Αριθμός λεωφορείου", inp("", { className: "mono", placeholder: "π.χ. ΑΙΑ 1234 ή 25", autocapitalize: "characters" }));
  const note = field(box, "Αιτία / σημείωση", inp("", { placeholder: "π.χ. δεν το παρέλαβε" }));
  const msg = el("div", "msg warn wide"); msg.hidden = true; box.append(msg);
  const acts = el("div", "formactions"); const ok = el("button", "btn primary", "↩ Καταχώρηση επιστροφής"); ok.type = "submit";
  const cancel = el("button", "btn", "Ακύρωση"); cancel.type = "button"; cancel.onclick = () => { openBox = { id: null }; render(); };
  acts.append(ok, cancel); box.append(acts);
  box.onsubmit = async e => { e.preventDefault(); if (needOperator()) return;
    const d = norm(from.value); if (!d) { msg.textContent = "Γράψε τον σταθμό αποστολής."; msg.hidden = false; return; }
    const at = when.get(); if (!at) { msg.textContent = "Βάλε ημερομηνία και ώρα (24ωρη, π.χ. 17:30)."; msg.hidden = false; return; }
    ok.disabled = true;
    try { const now = new Date().toISOString(); await updateParcel(p.id, { status: "returned", status_at: now, fwd_at: now, fwd_destination: d, fwd_departure_at: at, fwd_bus: bus.value.trim().toUpperCase() || null, fwd_note: note.value.trim() || null, origin_city: p.origin_city || d });
      openBox = { id: null }; show($("formMsg"), "Καταχωρήθηκε η επιστροφή προς " + d + ".", "ok"); render(); }
    catch { ok.disabled = false; msg.textContent = "Δεν αποθηκεύτηκε. Δοκίμασε ξανά."; msg.hidden = false; } };
  return box;
}
function fwdBox(p) {
  const box = el("form", "box"); box.autocomplete = "off";
  const dest = field(box, "Προορισμός", inp(p.fwd_destination || p.destination_city)); dest.setAttribute("list", "cities");
  const when = dtFields(box, away(p) ? "Δρομολόγιο — ημερομηνία" : "Αναχώρηση από Αγρίνιο — ημερομηνία", "Ώρα (24ωρη)", p.fwd_departure_at);
  const bus = field(box, "Αριθμός λεωφορείου", inp(p.fwd_bus || "", { className: "mono", placeholder: "π.χ. ΑΙΑ 1234 ή 25", autocapitalize: "characters" }));
  const note = field(box, "Σημείωση", inp(p.fwd_note || "", { placeholder: "π.χ. οδηγός" }));
  const seen = new Set(); const q = el("div", "quick wide");
  [...rows.values()].filter(x => x.fwd_departure_at && norm(x.fwd_destination) === norm(dest.value)).sort((a, b) => String(b.fwd_at).localeCompare(String(a.fwd_at)))
    .forEach(x => { const k = fmtGr(x.fwd_departure_at) + (x.fwd_bus ? " · " + x.fwd_bus : ""); if (seen.size < 3 && !seen.has(k)) { seen.add(k); const b = el("button", "btn small", "↻ " + k); b.type = "button"; b.onclick = () => { when.set(x.fwd_departure_at); if (x.fwd_bus) bus.value = x.fwd_bus; }; q.append(b); } });
  if (q.childNodes.length) box.append(el("div", "hint wide", "Ίδιο δρομολόγιο με προηγούμενα δέματα:"), q);
  const msg = el("div", "msg warn wide"); msg.hidden = true; box.append(msg);
  const acts = el("div", "formactions"); const ok = el("button", "btn primary", "Καταχώρηση αποστολής"); ok.type = "submit";
  const cancel = el("button", "btn", "Ακύρωση"); cancel.type = "button"; cancel.onclick = () => { openBox = { id: null }; render(); };
  acts.append(ok, cancel); box.append(acts);
  box.onsubmit = async e => { e.preventDefault(); if (needOperator()) return;
    const d = norm(dest.value); if (!d || d === HOME) { msg.textContent = "Γράψε τον προορισμό."; msg.hidden = false; return; }
    const at = when.get(); if (!at) { msg.textContent = "Βάλε ημερομηνία και ώρα (24ωρη, π.χ. 17:30)."; msg.hidden = false; return; }
    ok.disabled = true;
    try { const now = new Date().toISOString(); await updateParcel(p.id, { status: "forwarded", status_at: now, fwd_at: now, fwd_destination: d, fwd_departure_at: at, fwd_bus: bus.value.trim().toUpperCase() || null, fwd_note: note.value.trim() || null });
      openBox = { id: null }; show($("formMsg"), "Καταχωρήθηκε η αποστολή προς " + d + ".", "ok"); render(); }
    catch { ok.disabled = false; msg.textContent = "Δεν αποθηκεύτηκε. Δοκίμασε ξανά."; msg.hidden = false; } };
  return box;
}

// ---------------------------------------------------------------- παρατηρήσεις
const DEFAULT_TAGS = ["Παραλήφθηκε ανοιχτό", "Παραλήφθηκε με φθορά", "Έγινε εκκαθάριση", "Στο υπόγειο", "Βρεγμένο", "Εύθραυστο",
  "Ογκώδες / βαρύ", "Ευπαθές / τρόφιμα", "Λείπει τεμάχιο", "Θα το παραλάβει τρίτος", "Ειδοποιήθηκε τηλεφωνικά", "Επιστροφή στον αποστολέα"];
function tagsBox(p) {
  const box = el("form", "box"); const sel = new Set(p.tags || []);
  const wrap = el("div", "chips wide"); wrap.setAttribute("role", "group"); wrap.setAttribute("aria-label", "Παρατηρήσεις");
  const opts = [...new Set([...(settings.tag_options || DEFAULT_TAGS), ...sel])];
  opts.forEach(t => { const b = el("button", "chip", t); b.type = "button"; b.setAttribute("aria-pressed", String(sel.has(t)));
    b.onclick = () => { sel.has(t) ? sel.delete(t) : sel.add(t); b.setAttribute("aria-pressed", String(sel.has(t))); }; wrap.append(b); });
  box.append(wrap);
  // φωτογραφίες φθοράς
  const ph = el("div", "f wide"); const phLbl = el("label", "btn small", "📷 Φωτογραφία φθοράς"); const phIn = el("input"); phIn.type = "file"; phIn.accept = "image/*"; phIn.multiple = true; phIn.hidden = true; phLbl.append(phIn);
  const gal = el("div", "dgal"); const phMsg = el("div", "hint");
  ph.append(el("label", null, "Φωτογραφίες φθοράς" + ((p.damage_photo_paths || []).length ? " (" + p.damage_photo_paths.length + ")" : "")), phLbl, phMsg, gal); box.append(ph);
  (async () => { for (const path of p.damage_photo_paths || []) { const { data } = await sb.storage.from("damage").createSignedUrl(path, 600); if (data) { const a = el("a"); a.href = data.signedUrl; a.target = "_blank"; a.rel = "noopener"; const i = el("img"); i.src = data.signedUrl; i.alt = "Φθορά"; a.append(i); gal.append(a); } } })();
  phIn.onchange = async () => {
    if (needOperator()) return; const files = [...phIn.files]; if (!files.length) return; phMsg.textContent = "Ανέβασμα " + files.length + "…";
    try {
      const paths = [...(p.damage_photo_paths || [])];
      for (const f of files) { const blob = await jpegBlob(f, 1280, 0.72); const path = p.id + "/" + Date.now() + "-" + Math.round(Math.random() * 1e4) + ".jpg";
        const up = await sb.storage.from("damage").upload(path, blob, { contentType: "image/jpeg" }); if (up.error) throw up.error; paths.push(path); }
      sel.add("Παραλήφθηκε με φθορά");
      await updateParcel(p.id, { damage_photo_paths: paths, damaged: true, tags: [...sel] });
      openBox = { id: p.id, kind: "tags" }; render();
    } catch (err) { console.error(err); phMsg.textContent = "Δεν ανέβηκε η φωτογραφία. Δοκίμασε ξανά."; }
  };
  const notes = el("textarea", "wide"); notes.value = p.notes || ""; notes.placeholder = "Άλλη παρατήρηση (ελεύθερο κείμενο)"; notes.style.minHeight = "70px";
  const w = el("div", "f wide"); w.append(el("label", null, "Σημειώσεις"), notes); box.append(w);
  const acts = el("div", "formactions"); const ok = el("button", "btn primary", "Αποθήκευση"); ok.type = "submit";
  const cancel = el("button", "btn", "Κλείσιμο"); cancel.type = "button"; cancel.onclick = () => { openBox = { id: null }; render(); };
  acts.append(ok, cancel); box.append(acts);
  box.onsubmit = async e => { e.preventDefault(); if (needOperator()) return; ok.disabled = true;
    const tags = [...sel]; const patch = { tags, notes: notes.value.trim() || null };
    if (tags.includes("Παραλήφθηκε με φθορά")) patch.damaged = true;
    try { await updateParcel(p.id, patch); openBox = { id: null }; render(); }
    catch (err) { console.error(err); ok.disabled = false; ok.textContent = "Δεν αποθηκεύτηκε — ξαναδοκίμασε"; } };
  return box;
}

// ---------------------------------------------------------------- ιστορικό
const ACT = { create: "Καταχώρηση", update: "Αλλαγή", damage: "Ζημιά", "status:notified": "Ειδοποίηση", "status:done": "Παράδοση", "status:forwarded": "Προώθηση", "status:arrived": "Ήρθε", "status:transit": "Μεταφόρτωση", "status:returned": "Επιστροφή" };
async function showHistory(p) {
  const body = $("dlgBody"); body.textContent = ""; body.append(el("h2", null, "Ιστορικό · " + (p.recipient_name || p.receipt_no)));
  const { data } = await sb.from("activity_log").select("*").eq("parcel_id", p.id).order("at");
  const l = el("div", "hist");
  (data || []).forEach(a => l.append(el("div", null, fmtGr(a.at) + " · " + (a.operator || "—") + " · " + (ACT[a.action] || a.action) + (a.details && a.details.channel && a.action === "status:notified" ? " (" + a.details.channel + ")" : ""))));
  if (!l.childNodes.length) l.append(el("div", null, "Δεν υπάρχει ιστορικό."));
  body.append(l); $("dlg").showModal();
}

// ---------------------------------------------------------------- σημείωμα βάρδιας
async function loadNotes() {
  const { data } = await sb.from("shift_notes").select("*").eq("done", false).order("created_at");
  const l = $("notesList"); l.textContent = "";
  (data || []).forEach(n => { const r = el("div", "note-item"); r.append(el("span", null, n.text + (n.operator ? " — " + n.operator : "")));
    const b = el("button", "btn small", "✓"); b.type = "button"; b.setAttribute("aria-label", "Ολοκληρώθηκε");
    b.onclick = async () => { await sb.from("shift_notes").update({ done: true, operator: operator() }).eq("id", n.id); loadNotes(); }; r.append(b); l.append(r); });
}
$("noteForm").onsubmit = async e => { e.preventDefault(); const t = $("noteInput").value.trim(); if (!t) return;
  await sb.from("shift_notes").insert({ text: t, operator: operator() || null }); $("noteInput").value = ""; loadNotes(); };

// ---------------------------------------------------------------- πελάτες (προβολή)
$("manifestBtn").onclick = () => { $("manifestBtn").closest("details").open = false; openManifest({ sb, operator, needOperator, onChecked: () => loadManifests(), linkCustomer, pendingReview: pendingReviewCount, rows: () => [...rows.values()], onSaved: p => { rows.set(p.id, p); scheduleRender(); } }); };
$("customersBtn").onclick = async () => {
  $("customersBtn").closest("details").open = false;
  const body = $("dlgBody"); body.textContent = ""; body.append(el("h2", null, "Πελάτες"));
  const q = inp("", { type: "search", placeholder: "Αναζήτηση πελάτη" }); body.append(q); const l = el("div", "hist"); body.append(l);
  const load = async () => { let r = sb.from("customers").select("*").order("last_parcel_at", { ascending: false, nullsFirst: false }).limit(100);
    const s = norm(q.value); if (s) r = r.ilike("name_key", "%" + s + "%");
    const { data } = await r; l.textContent = "";
    (data || []).forEach(c => l.append(el("div", null, c.full_name + " · " + (c.phones || []).map(fmtPhone).join(", ") + " · " + c.parcels_count + " δέματα" + (c.last_parcel_at ? " · τελευταίο " + fmtGr(c.last_parcel_at, false) : ""))));
    if (!l.childNodes.length) l.append(el("div", null, "Κανένας πελάτης ακόμα.")); };
  q.oninput = () => { clearTimeout(q._t); q._t = setTimeout(load, 300); }; load(); $("dlg").showModal();
};

// ---------------------------------------------------------------- εξαγωγή
$("exportBtn").onclick = async () => {
  $("exportBtn").closest("details").open = false;
  const { data, error } = await sb.from("parcels").select("*").order("created_at", { ascending: false }).limit(20000);
  if (error) { show($("formMsg"), "Η εξαγωγή απέτυχε. Δοκίμασε ξανά.", "bad"); return; }
  const d = k => r => fmtGr(r[k]); const yes = k => r => r[k] ? "Ναι" : ""; const eur = k => r => r[k] == null ? "" : Number(r[k]).toFixed(2).replace(".", ",");
  const cols = [["receipt_no", "Αρ. Απόδειξης"], ["parcel_code", "Κωδ. Δέματος"], ["issued_at", "Ημ/νία έκδοσης", d("issued_at")], ["departure_at", "Αναχώρηση", d("departure_at")],
    ["kind", "Τύπος"], ["item", "Είδος"], ["origin_city", "Από"], ["destination_city", "Προορισμός"], ["sender_name", "Αποστολέας"], ["package_desc", "Συσκευασία"], ["recipient_name", "Παραλήπτης"],
    ["recipient_phone", "Τηλέφωνο"], ["phone_source", "Πηγή τηλεφώνου"], ["fare_eur", "Κόμιστρο €", eur("fare_eur")], ["shelf", "Ράφι"], ["status", "Κατάσταση", r => STATUS[r.status] || r.status],
    ["created_at", "Καταχώρηση", d("created_at")], ["notified_at", "Ειδοποίηση", d("notified_at")], ["picked_up_at", "Παραλαβή", d("picked_up_at")], ["picked_by_name", "Παρέλαβε"],
    ["picked_by_phone", "Τηλ. παραλαβής"], ["id_doc_type", "Έγγραφο"], ["id_doc_number", "Αριθμός εγγράφου"], ["signature_path", "Υπογραφή", r => r.signature_path ? "Ναι" : ""],
    ["home_delivery", "Delivery", yes("home_delivery")], ["cod_amount_eur", "Είσπραξη €", eur("cod_amount_eur")], ["cod_collected", "Εισπράχθηκε", yes("cod_collected")],
    ["fwd_departure_at", "Αποστολή από Αγρίνιο", d("fwd_departure_at")], ["fwd_note", "Σημ. αποστολής"], ["damaged", "Ζημιά", yes("damaged")], ["bypassed", "Δεν πέρασε από αποθήκη", yes("bypassed")], ["fwd_bus", "Λεωφορείο μεταφόρτωσης"], ["pieces_total", "Τεμάχια"], ["pieces_in", "Ήρθαν τεμάχια"], ["notes", "Σημειώσεις"], ["operator", "Τελευταίος χειριστής"]];
  const blob = new Blob([toCSV(data, cols)], { type: "text/csv;charset=utf-8" });
  const a = el("a"); a.href = URL.createObjectURL(blob); a.download = "apothiki-dematon-" + fmtGr(new Date(), false).replace(/\//g, "-") + ".csv"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

$("goSearch").onclick = () => { $("hLog").scrollIntoView({ behavior: "smooth" }); setTimeout(() => $("q").focus(), 350); };
$("goNew").onclick = () => { $("hNew").scrollIntoView({ behavior: "smooth" }); };

// ---------------------------------------------------------------- εκκίνηση
setInterval(() => { if (!openBox.id && !$("app").hidden) { render(); purgeAllClosed(); } }, 60000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") location.reload(); });
boot();


// ---------------------------------------------------------------- απογραφή αποθήκης (π.χ. κάθε Κυριακή)
const invKey = () => "inv:" + dayKey(new Date());
let invView = "todo";
const invFound = () => { try { return new Set(JSON.parse(store.get(invKey()) || "[]")); } catch { return new Set(); } };
const invSave = s => store.set(invKey(), JSON.stringify([...s]));
// στην αποθήκη = ανοιχτά δέματα που ήρθαν πράγματι (όχι «δεν ήρθαν»), μαζί με μεταφορτώσεις που περιμένουν
const invItems = () => [...rows.values()].filter(p => !isClosed(p) && !away(p) && p.status !== "not_arrived")
  .sort((a, b) => (isTransit(a) - isTransit(b)) || String(a.shelf || "~").localeCompare(String(b.shelf || "~"), "el") || String(a.recipient_name || "").localeCompare(String(b.recipient_name || ""), "el"));
function invRender() {
  const items = invItems(), found = invFound(); const ids = new Set(items.map(p => p.id));
  const nf = items.filter(p => found.has(p.id)).length;
  show($("invProg"), "Βρέθηκαν " + nf + " / " + items.length + (items.length - nf ? " · μένουν " + (items.length - nf) : " · ✓ όλα βρέθηκαν"), nf === items.length ? "ok" : "info");
  const q = norm($("invQ").value); const list = $("invList"); list.textContent = "";
  let lastG = null;
  items.filter(p => (invView === "all" || (invView === "found") === found.has(p.id)) && (!q || norm([p.recipient_name, p.receipt_no, p.shelf, p.origin_city, p.package_desc].join(" ")).includes(q)))
    .forEach(p => {
      const g = isTransit(p) ? "⇄ Μεταφορτώσεις → " + (p.destination_city || "") : "Ράφι " + (p.shelf || "—");
      if (g !== lastG) { list.append(el("h3", "invg", g)); lastG = g; }
      const r = el("label", "invrow" + (found.has(p.id) ? " ok" : "")); const c = el("input"); c.type = "checkbox"; c.checked = found.has(p.id);
      c.onchange = () => { const s = invFound(); c.checked ? s.add(p.id) : s.delete(p.id); invSave(s); invRender(); };
      const t = el("div", "invt"); t.append(el("b", null, p.recipient_name || p.receipt_no || "—"),
        el("span", "hint", [p.receipt_no, p.origin_city ? "από " + p.origin_city : "", p.package_desc, daysSince(p.created_at) >= 1 ? daysSince(p.created_at) + " μέρες" : "σήμερα"].filter(Boolean).join(" · ")));
      r.append(c, t); list.append(r);
    });
  if (!list.childNodes.length) list.append(el("div", "empty", invView === "todo" ? "Βρέθηκαν όλα ✓" : "Τίποτα εδώ."));
  [...found].forEach(id => { if (!ids.has(id)) found.delete(id); });
}
function openInventory() {
  $("invQ").value = ""; invView = "todo"; document.querySelectorAll("[data-iv]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.iv === invView)));
  invRender(); $("invDlg").showModal();
}
$("invBtn").onclick = () => { $("invBtn").closest("details").open = false; if (needOperator()) return; openInventory(); };
$("invClose").onclick = () => { $("invDlg").close(); render(); };
$("invQ").addEventListener("input", invRender);
document.querySelectorAll("[data-iv]").forEach(b => b.onclick = () => { invView = b.dataset.iv; document.querySelectorAll("[data-iv]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); invRender(); });
$("invReset").onclick = () => { if ($("invReset").dataset.sure) { invSave(new Set()); delete $("invReset").dataset.sure; $("invReset").textContent = "Από την αρχή"; invRender(); } else { $("invReset").dataset.sure = "1"; $("invReset").textContent = "Σίγουρα; Πάτα ξανά"; } };
$("invCsv").onclick = () => {
  const found = invFound();
  const csv = toCSV(invItems(), [["f", "Βρέθηκε", p => found.has(p.id) ? "ΝΑΙ" : "ΟΧΙ"], ["shelf", "Ράφι"], ["recipient_name", "Παραλήπτης"], ["receipt_no", "Απόδειξη"], ["origin_city", "Από"], ["destination_city", "Προορισμός"], ["recipient_phone", "Τηλέφωνο"], ["d", "Μέρες", p => daysSince(p.created_at)], ["package_desc", "Συσκευασία"]]);
  const a = el("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "apografi-" + dayKey(new Date()) + ".csv"; a.click();
};
$("invDone").onclick = async () => {
  const items = invItems(), found = invFound(); const miss = items.filter(p => !found.has(p.id));
  const d = new Date(); const txt = "📦 Απογραφή " + p2_(d.getDate()) + "/" + p2_(d.getMonth() + 1) + " (" + (operator() || "—") + "): " + items.length + " στην αποθήκη, βρέθηκαν " + (items.length - miss.length) +
    (miss.length ? ". ΔΕΝ ΒΡΕΘΗΚΑΝ " + miss.length + ": " + miss.slice(0, 25).map(p => (p.recipient_name || "—") + " (" + (p.receipt_no || "χωρίς απόδ.") + (p.shelf ? ", ράφι " + p.shelf : "") + ")").join(", ") + (miss.length > 25 ? " κ.ά." : "") : ". Όλα εντάξει ✓");
  $("invDone").disabled = true;
  try { await sb.from("shift_notes").insert({ text: txt, operator: operator() || null }); store.set("invDoneDay", dayKey(d)); loadNotes(); $("invDlg").close(); show($("formMsg"), "Η απογραφή καταγράφηκε στο σημείωμα βάρδιας.", "ok"); render(); }
  catch { show($("invProg"), "Δεν αποθηκεύτηκε. Δοκίμασε ξανά.", "bad"); }
  finally { $("invDone").disabled = false; }
};


// ---------------------------------------------------------------- διπλές καταχωρήσεις (κατάσταση + φωτογραφία)
let dupCache = { at: 0, list: [] };
const dupIgnored = () => { try { return new Set(JSON.parse(store.get("dupIgnore") || "[]")); } catch { return new Set(); } };
function findDuplicates(force) {
  if (!force && Date.now() - dupCache.at < 15000) return dupCache.list;
  const all = [...rows.values()]; const ign = dupIgnored();
  const man = all.filter(p => p.source === "manifest"), real = all.filter(p => p.source !== "manifest");
  const out = [], usedB = new Set();
  man.forEach(a => {
    let best = null, why = "";
    for (const b of real) { if (usedB.has(b.id) || ign.has(a.id + "|" + b.id)) continue;
      const w = likelySameParcel(a, b); if (w) { best = b; why = w === "receipt" ? "ίδιος αριθμός απόδειξης" : "σχεδόν ίδιος αριθμός + ίδιο επώνυμο"; break; }
      if (!best && sameNameTrip(a, b)) { best = b; why = "ίδιο επώνυμο, ίδια πόλη και μέρα"; } }
    if (best) { usedB.add(best.id); out.push({ a, b: best, why }); }
  });
  dupCache = { at: Date.now(), list: out }; return out;
}
async function mergeDuplicate(a, b) {
  const patch = {};
  if (a.status === "forwarded" && !isClosed(b)) Object.assign(patch, { status: "forwarded", status_at: a.status_at, fwd_at: a.fwd_at, fwd_destination: a.fwd_destination, fwd_departure_at: a.fwd_departure_at, fwd_bus: a.fwd_bus, fwd_note: a.fwd_note });
  if (!b.departure_at && a.departure_at) patch.departure_at = a.departure_at;
  if (!b.fare_eur && a.fare_eur) patch.fare_eur = a.fare_eur;
  if ((a.pieces_total || 1) > (b.pieces_total || 1)) patch.pieces_total = a.pieces_total;
  if (Object.keys(patch).length) await updateParcel(b.id, patch);
  const { error } = await sb.from("parcels").delete().eq("id", a.id);
  if (error) throw error;
  rows.delete(a.id); dupCache.at = 0; render();
}
function openDuplicates() {
  const list = findDuplicates(true); const b0 = $("dlgBody"); b0.textContent = "";
  b0.append(el("h2", null, "🔁 Πιθανές διπλές καταχωρήσεις (" + list.length + ")"),
    el("div", "hint", "Αριστερά: γραμμή που μπήκε από την ΚΑΤΑΣΤΑΣΗ. Δεξιά: το δέμα από τη ΦΩΤΟΓΡΑΦΙΑ. «Ένωση» = κρατάει της φωτογραφίας (με ό,τι χρήσιμο είχε η κατάσταση, π.χ. προώθηση) και σβήνει της κατάστασης."));
  if (!list.length) b0.append(el("div", "empty", "Δεν βρέθηκαν διπλές ✓"));
  const desc = p => [p.recipient_name || "—", p.receipt_no ? "Απόδ. " + p.receipt_no : "", p.origin_city ? "από " + p.origin_city : "", p.departure_at ? fmtGr(p.departure_at) : "", STATUS[p.status] || p.status].filter(Boolean).join(" · ");
  list.forEach(d => {
    const box = el("div", "dupbox");
    box.append(el("div", "hint", "Λόγος: " + d.why), el("div", "dupa", "📄 " + desc(d.a)), el("div", "dupb", "📷 " + desc(d.b)));
    const bar = el("div", "quick"); const ok = el("button", "btn small primary", "Ένωση"); ok.type = "button";
    const no = el("button", "btn small", "Δεν είναι ίδια"); no.type = "button";
    ok.onclick = async () => { ok.disabled = no.disabled = true; try { await mergeDuplicate(d.a, d.b); box.replaceWith(el("div", "msg ok", "✓ Ενώθηκε: " + (d.b.recipient_name || d.b.receipt_no))); } catch (e) { console.error(e); ok.disabled = no.disabled = false; box.append(el("div", "msg bad", "Δεν έγινε. Δοκίμασε ξανά.")); } };
    no.onclick = () => { const s = dupIgnored(); s.add(d.a.id + "|" + d.b.id); store.set("dupIgnore", JSON.stringify([...s])); dupCache.at = 0; box.remove(); render(); };
    bar.append(ok, no); box.append(bar); b0.append(box);
  });
  $("dlg").showModal();
}
$("dupBtn").onclick = () => { $("dupBtn").closest("details").open = false; openDuplicates(); };
