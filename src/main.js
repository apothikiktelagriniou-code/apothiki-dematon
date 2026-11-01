import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import {
  HOME, norm, shelfFor, cleanPhone, fmtPhone, parseGrDate, fmtGr, toLocalInput, money, hoursSince, daysSince,
  tripsOf, tripLabel, sortTrips, isClosed, isTransit, parseLabel, fillTemplate, toCSV, cleanIdDoc, sameReceipt,
} from "./lib.js";
import { initCapture } from "./capture.js";
import { openManifest } from "./manifest.js";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const show = (node, text, cls) => { node.textContent = text; node.className = "msg " + cls; node.hidden = !text; };
const store = { get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

const STATUS = { arrived: "Ήρθε", notified: "Ειδοποιήθηκε", done: "Παραδόθηκε", transit: "Μεταφόρτωση", forwarded: "Προωθήθηκε", returned: "Επεστράφη" };
let settings = { reminder_days: 3, transit_alert_hours: 3, old_parcel_days: 5, max_reasonable_fare_eur: 40, city_colors: {}, notification_template: "{αρ}", reminder_template: "{αρ}" };
let rows = new Map();       // id → parcel
let filter = "all", cityFilter = "", tripFilter = "", editingId = null;
let openBox = { id: null, kind: null }; // ειδοποίηση/παράδοση/προώθηση/ζημιά
let bulk = false, shelfManual = false, customerChoice = null;

// ---------------------------------------------------------------- χειριστής
const operator = () => store.get("operator");
function renderOperator() {
  $("opName").textContent = operator() || "όνομα;";
  $("opForm").hidden = !!operator();
}
$("opBtn").onclick = () => { $("opForm").hidden = false; $("opInput").value = operator(); $("opInput").focus(); };
$("opForm").onsubmit = e => { e.preventDefault(); const v = $("opInput").value.trim(); if (!v) return; store.set("operator", v); renderOperator(); };
function needOperator() {
  if (operator()) return false;
  $("opForm").hidden = false; $("opInput").focus();
  show($("formMsg"), "Γράψε πρώτα ποιος δουλεύει (πάνω).", "warn");
  return true;
}

// ---------------------------------------------------------------- σύνδεση
async function boot() {
  const { data } = await sb.auth.getSession();
  if (!data.session) { $("login").hidden = false; $("app").hidden = true; return; }
  $("login").hidden = true; $("app").hidden = false;
  renderOperator();
  await loadSettings();
  await loadParcels();
  subscribe();
  loadNotes();
  initCapture({ sb, operator, needOperator, findCustomers, linkCustomer, lastTrip, settings: () => settings,
    receiptExists: rn => [...rows.values()].some(p => sameReceipt(p.receipt_no, rn)),
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
  render();
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

async function updateParcel(id, patch) {
  const { data, error } = await sb.from("parcels").update({ ...patch, operator: operator() }).eq("id", id).select().single();
  if (error) throw error;
  rows.set(id, data); render(); return data;
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
const FIELDS = ["receipt_no", "parcel_code", "kind", "origin_city", "destination_city", "issued", "departure", "fare_eur", "recipient_name", "recipient_phone", "shelf", "sender_name", "item", "cod_amount_eur", "notes"];
function clearForm() {
  for (const f of FIELDS) { const e = $(f); e.classList.remove("ai"); if (e.tagName === "SELECT") e.selectedIndex = 0; else e.value = ""; delete e.dataset.src; }
  editingId = null; shelfManual = false; customerChoice = null; $("custHint").textContent = ""; $("destHint").textContent = "";
  $("saveBtn").textContent = "Αποθήκευση"; $("scanText").value = "";
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
$("clearBtn").onclick = () => { clearForm(); show($("formMsg"), "", "info"); };

$("scanBtn").onclick = () => {
  const raw = $("scanText").value.trim();
  if (!raw) { show($("formMsg"), "Σάρωσε ή επικόλλησε πρώτα το κείμενο της ετικέτας.", "warn"); return; }
  const o = parseLabel(raw);
  if (!o.receipt_no && !o.recipient_name) { show($("formMsg"), "Δεν βρέθηκε αριθμός απόδειξης ή παραλήπτης. Σάρωσε ξανά πιο κοντά ή συμπλήρωσε με το χέρι.", "warn"); return; }
  clearForm(); fillForm({ ...o, issued: o.issued, departure: o.departure }, true);
  if (o.recipient_phone) $("recipient_phone").dataset.src = "label";
  const miss = [["receipt_no", "απόδειξη"], ["recipient_name", "παραλήπτης"], ["fare_eur", "κόμιστρο"], ["origin_city", "από"], ["departure", "αναχώρηση"]].filter(([k]) => o[k] == null || o[k] === "").map(x => x[1]);
  show($("formMsg"), miss.length ? "Λείπουν: " + miss.join(", ") + ". Έλεγξε και πάτα Αποθήκευση." : "Συμπληρώθηκε. Έλεγξε τα γαλάζια πεδία και πάτα Αποθήκευση.", miss.length ? "warn" : "ok");
};

function readForm() {
  const v = f => $(f).value.trim();
  const fare = v("fare_eur") ? Number(v("fare_eur").replace(",", ".")) : null;
  const cod = v("cod_amount_eur") ? Number(v("cod_amount_eur").replace(",", ".")) : null;
  const dest = norm(v("destination_city")) || HOME;
  const phone = cleanPhone(v("recipient_phone"));
  const o = {
    receipt_no: v("receipt_no").replace(/\s/g, "") || null, parcel_code: v("parcel_code").toUpperCase() || null, kind: v("kind"),
    origin_city: norm(v("origin_city")) || null, destination_city: dest,
    issued_at: parseGrDate(v("issued"))?.toISOString() || null, departure_at: parseGrDate(v("departure"))?.toISOString() || null,
    fare_eur: fare, recipient_name: v("recipient_name"), recipient_phone: phone || null,
    phone_source: phone ? ($("recipient_phone").dataset.src || "manual") : null,
    shelf: dest === HOME ? (v("shelf").toUpperCase() || shelfFor(v("recipient_name")) || null) : null, shelf_manual: shelfManual,
    sender_name: v("sender_name") || null, item: v("item") || null, cod_amount_eur: cod, notes: v("notes") || null,
  };
  o.phone_confirmed = o.phone_source !== "handwritten";
  return o;
}
$("form").addEventListener("submit", async e => {
  e.preventDefault(); if (needOperator()) return;
  const o = readForm();
  if (!o.receipt_no && !o.recipient_name) { show($("formMsg"), "Γράψε τουλάχιστον αριθμό απόδειξης ή παραλήπτη.", "warn"); return; }
  if ($("recipient_phone").value.trim() && !o.recipient_phone) { show($("formMsg"), "Το τηλέφωνο δεν μοιάζει σωστό (10 ψηφία, κινητό από 69). Διόρθωσέ το ή άφησέ το κενό.", "warn"); return; }
  if (o.fare_eur != null && (isNaN(o.fare_eur) || o.fare_eur < 0)) { show($("formMsg"), "Το κόμιστρο δεν είναι σωστό ποσό.", "warn"); return; }
  if (o.fare_eur > Number(settings.max_reasonable_fare_eur || 40) && !confirmInline("Κόμιστρο " + money(o.fare_eur) + " — σίγουρα σωστό; Πάτα ξανά Αποθήκευση για επιβεβαίωση.")) return;
  const btn = $("saveBtn"); btn.disabled = true;
  try {
    o.customer_id = customerChoice || (o.recipient_name ? await linkCustomer(o.recipient_name, o.recipient_phone) : null);
    if (editingId) {
      await updateParcel(editingId, o);
      clearForm(); show($("formMsg"), "Ενημερώθηκε.", "ok");
    } else {
      o.status = o.destination_city === HOME ? "arrived" : "transit"; o.source = "manual"; o.operator = operator();
      const { data, error } = await sb.from("parcels").insert(o).select().single();
      if (error) {
        if (error.code === "23505") { const ex = [...rows.values()].find(r => r.receipt_no === o.receipt_no); show($("formMsg"), "Αυτή η απόδειξη έχει ήδη καταχωρηθεί" + (ex ? " (" + ex.recipient_name + ", " + fmtGr(ex.created_at) + ")" : "") + ".", "warn"); return; }
        throw error;
      }
      rows.set(data.id, data); render();
      clearForm(); show($("formMsg"), "Αποθηκεύτηκε" + (data.shelf ? " — Ράφι " + data.shelf : data.status === "transit" ? " — Μεταφόρτωση" : "") + ".", "ok");
    }
  } catch (err) { console.error(err); show($("formMsg"), "Δεν αποθηκεύτηκε. Δοκίμασε ξανά.", "bad"); }
  finally { btn.disabled = false; }
});
let pendingConfirm = "";
function confirmInline(text) { if (pendingConfirm === text) { pendingConfirm = ""; return true; } pendingConfirm = text; show($("formMsg"), text, "warn"); return false; }

function lastTrip() {
  return [...rows.values()].filter(p => p.departure_at && p.origin_city).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
}
$("sameTripBtn").onclick = () => {
  const t = lastTrip(); if (!t) return;
  $("origin_city").value = t.origin_city; $("departure").value = fmtGr(t.departure_at);
  if (!$("issued").value) $("issued").value = fmtGr(t.departure_at, false);
  ["origin_city", "departure"].forEach(f => $(f).classList.add("ai"));
  show($("formMsg"), "Μπήκε το δρομολόγιο. Γράψε παραλήπτη, τηλέφωνο, κόμιστρο.", "info"); $("recipient_name").focus();
};
function startEdit(p) {
  clearForm(); editingId = p.id;
  fillForm({ ...p, issued: fmtGr(p.issued_at), departure: fmtGr(p.departure_at), fare_eur: p.fare_eur ?? "", cod_amount_eur: p.cod_amount_eur ?? "" }, false);
  shelfManual = !!p.shelf_manual; if (p.phone_source) $("recipient_phone").dataset.src = p.phone_source;
  $("saveBtn").textContent = "Ενημέρωση"; show($("formMsg"), "Επεξεργασία: " + (p.receipt_no || p.recipient_name), "info");
  window.scrollTo({ top: $("hNew").offsetTop - 10, behavior: "smooth" }); $("receipt_no").focus();
}

// ---------------------------------------------------------------- λίστα
const cityColor = c => (settings.city_colors || {})[norm(c)] || "#57534e";
const needsRemind = p => p.status === "notified" && daysSince(p.notified_at || p.status_at) >= (settings.reminder_days || 3);
const lateTransit = p => p.status === "transit" && (hoursSince(p.created_at) >= (settings.transit_alert_hours || 3) || new Date(p.created_at).toDateString() !== new Date().toDateString());
const sameDay = (iso, d) => iso && new Date(iso).toDateString() === d;
const phoneOk = p => !!p.recipient_phone;

function matches(p) {
  if (cityFilter && p.origin_city !== cityFilter) return false;
  if (tripFilter && !tripsOf(p).includes(tripFilter)) return false;
  switch (filter) {
    case "waiting": if (isClosed(p)) return false; break;
    case "tonotify": if (p.status !== "arrived") return false; break;
    case "remind": if (!needsRemind(p)) return false; break;
    case "nophone": if (isClosed(p) || isTransit(p) || phoneOk(p)) return false; break;
    case "transit": if (p.status !== "transit") return false; break;
    case "cod": if (!(p.cod_amount_eur > 0 && !p.cod_collected)) return false; break;
    case "today": if (!sameDay(p.created_at, new Date().toDateString())) return false; break;
    case "done": if (!isClosed(p)) return false; break;
    case "tags": if (!(p.tags || []).length && !p.notes) return false; break;
  }
  const q = norm($("q").value); if (!q) return true;
  if (p.id_doc_number && p.id_doc_number.includes(cleanIdDoc(q)) && cleanIdDoc(q).length >= 3) return true;
  return norm([p.receipt_no, p.parcel_code, p.recipient_name, p.sender_name, p.recipient_phone, p.origin_city, p.destination_city, p.shelf, (p.tags || []).join(" "), p.notes, p.pickup_code, p.picked_by_name, p.picked_by_phone, p.id_doc_number].join(" ")).includes(q);
}

function render() {
  const all = [...rows.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const td = new Date().toDateString();
  const open = all.filter(p => !isClosed(p));
  $("stToday").textContent = all.filter(p => sameDay(p.created_at, td)).length;
  $("stWaiting").textContent = open.filter(p => !isTransit(p)).length;
  $("stOld").textContent = open.filter(p => daysSince(p.created_at) >= (settings.old_parcel_days || 5)).length;
  $("stTr").textContent = all.filter(p => p.status === "transit").length;
  const doneToday = all.filter(p => p.status === "done" && sameDay(p.picked_up_at || p.status_at, td));
  $("stDone").textContent = doneToday.length; $("stHome").textContent = doneToday.filter(p => p.home_delivery).length;

  // ειδοποιήσεις κορυφής
  const al = $("alerts"); al.textContent = "";
  const addAlert = (text, cls, f) => { const b = el("button", "msg " + cls + " alert", text); b.type = "button";
    b.onclick = () => { setFilter(f); cityFilter = ""; tripFilter = ""; render(); $("list").scrollIntoView({ behavior: "smooth" }); }; al.append(b); };
  const pendTr = all.filter(p => p.status === "transit");
  if (pendTr.length) { const late = pendTr.filter(lateTransit); const dests = [...new Set(pendTr.map(p => p.destination_city))].join(", ");
    addAlert((late.length ? "⚠ " : "⇄ ") + pendTr.length + " μεταφορτώσεις περιμένουν προώθηση (" + dests + ")" + (late.length ? " · " + late.length + " καθυστερούν" : "") + ".", late.length ? "bad" : "warn", "transit"); }
  const rem = all.filter(needsRemind).length; if (rem) addAlert("🔔 " + rem + " δέματα θέλουν υπενθύμιση.", "info", "remind");
  const hw = all.filter(p => !isClosed(p) && p.phone_source === "handwritten" && !p.phone_confirmed).length; if (hw) addAlert("✍ " + hw + " τηλέφωνα από χειρόγραφο θέλουν επιβεβαίωση.", "warn", "tonotify");
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
  const sel = $("tripSel"); sel.textContent = ""; sel.append(new Option("Όλα τα δρομολόγια", ""));
  sortTrips(Object.keys(trips)).slice(0, 200).forEach(t => sel.append(new Option(tripLabel(t) + " (" + trips[t].length + ")", t)));
  if (tripFilter && !trips[tripFilter]) tripFilter = ""; sel.value = tripFilter;
  if (tripFilter) { const g = trips[tripFilter]; const dn = g.filter(isClosed).length; const tr = g.filter(isTransit).length;
    show($("tripSum"), tripLabel(tripFilter) + ": " + g.length + " δέματα" + (tr ? " (μεταφόρτωση " + tr + ")" : "") + " · έκλεισαν " + dn + " · εκκρεμούν " + (g.length - dn) + " · κόμιστρα " + money(g.reduce((s, p) => s + (Number(p.fare_eur) || 0), 0)), "info"); }
  else show($("tripSum"), "", "info");

  // μαζική ειδοποίηση
  const toN = all.filter(p => p.status === "arrived" && phoneOk(p)).length;
  $("bulkBar").hidden = !toN && !bulk; $("bulkBtn").textContent = bulk ? "Σταμάτημα" : "Ειδοποίηση όλων (" + toN + ")";
  $("bulkHint").textContent = bulk ? "Πάτα κανάλι και ανοίγει το επόμενο." : "Δέματα με τηλέφωνο που δεν έχουν ειδοποιηθεί.";

  const lt = lastTrip(); $("sameTripBtn").hidden = !lt || !!editingId;
  if (lt) $("sameTripBtn").textContent = "↻ Ίδιο δρομολόγιο: " + lt.origin_city + " · " + fmtGr(lt.departure_at);

  const list = $("list"); list.textContent = "";
  const vis = all.filter(matches);
  if (!vis.length) { list.append(el("div", "empty", rows.size ? "Κανένα δέμα με αυτό το φίλτρο." : "Ακόμα κανένα δέμα. Κάνε την πρώτη καταχώρηση αριστερά.")); return; }
  vis.slice(0, 300).forEach(p => list.append(card(p)));
  if (vis.length > 300) list.append(el("div", "empty", "Εμφανίζονται τα 300 πιο πρόσφατα από " + vis.length + ". Χρησιμοποίησε αναζήτηση ή φίλτρο."));
}

function card(p) {
  const tr = isTransit(p);
  const row = el("article", "row" + (p.origin_city ? " has-city" : "") + (tr ? " is-transit" : "")); row.id = "row-" + p.id;
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
  if (p.damaged) top.append(el("span", "codb", "⚠ ΖΗΜΙΑ"));
  tags.filter(t => t !== "Στο υπόγειο" && t !== "Παραλήφθηκε με φθορά").forEach(t => top.append(el("span", "tag", t)));
  const meta = el("div", "meta"); const add = t => t && meta.append(el("span", null, t));
  add(p.departure_at ? "Αναχ. " + fmtGr(p.departure_at) : ""); add("Καταχ. " + fmtGr(p.created_at));
  add(p.receipt_no ? "Απόδ. " + p.receipt_no : "");
  if (p.recipient_phone) { const s = el("span", null, fmtPhone(p.recipient_phone)); if (p.phone_source === "handwritten") s.append(" ", el("span", "badge", p.phone_confirmed ? "✍ ✓" : "✍ χειρόγραφο")); if (p.phone_source === "customer_db") s.append(" ", el("span", "badge", "📇")); meta.append(s); }
  add(p.kind); add(money(p.fare_eur));
  if (p.notified_at && !isClosed(p)) add("Ειδοπ. " + fmtGr(p.notified_at) + (p.notify_count > 1 ? " (" + p.notify_count + "×)" : ""));
  if (p.operator) add("👤 " + p.operator);
  left.append(top, meta);
  const acts = el("div", "acts");
  const mk = (t, fn, cls) => { const b = el("button", "btn small" + (cls ? " " + cls : ""), t); b.type = "button"; b.onclick = fn; acts.append(b); return b; };
  const toggle = kind => () => { openBox = openBox.id === p.id && openBox.kind === kind ? { id: null } : { id: p.id, kind }; render(); const r = $("row-" + p.id); r && r.scrollIntoView({ behavior: "smooth", block: "nearest" }); };
  if (p.status === "transit") mk("Προώθηση", toggle("fwd"), "primary");
  else if (!isClosed(p)) { mk(p.status === "notified" ? "Υπενθύμιση" : "Ειδοποίηση", toggle("notify")); mk("Παράδοση", toggle("pickup"), "primary"); }
  mk("Επεξεργασία", () => startEdit(p));
  mk("Παρατηρήσεις" + (tags.length || p.notes ? " (" + (tags.length + (p.notes ? 1 : 0)) + ")" : ""), toggle("tags"));
  mk("Ιστορικό", () => showHistory(p));
  row.append(left, acts);
  if (p.status === "done") {
    row.append(el("div", "meta note", ["Παρέλαβε: " + (p.picked_by_name || "—"), p.id_doc_number ? (p.id_doc_type || "Έγγραφο") + " " + p.id_doc_number : p.id_doc_last4 ? (p.id_doc_type || "Έγγραφο") + " ••••" + p.id_doc_last4 : "", p.picked_by_phone ? fmtPhone(p.picked_by_phone) : "", fmtGr(p.picked_up_at), p.home_delivery ? "🏠 Delivery" : "", p.cod_collected ? "💶 Εισπράχθηκε " + money(p.cod_amount_eur) : ""].filter(Boolean).join(" · ")));
    if (p.signature_path) { const holder = el("div", "note"); const b = mk("Υπογραφή", () => showSignature(p, holder, b)); row.append(holder); }
  }
  if (p.status === "forwarded") row.append(el("div", "meta note", ["Προωθήθηκε → " + (p.fwd_destination || p.destination_city), p.fwd_departure_at ? "με δρομολόγιο " + fmtGr(p.fwd_departure_at) : "", p.fwd_note || ""].filter(Boolean).join(" · ")));
  if (p.notes) row.append(el("div", "meta note", p.notes));
  if (openBox.id === p.id) row.append(openBox.kind === "notify" ? notifyBox(p) : openBox.kind === "pickup" ? pickupBox(p) : openBox.kind === "tags" ? tagsBox(p) : fwdBox(p));
  return row;
}

function setFilter(f) { filter = f; document.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.f === f))); }
document.querySelectorAll(".chip").forEach(c => c.onclick = () => { setFilter(c.dataset.f); render(); });
$("q").addEventListener("input", scheduleRender);
$("tripSel").addEventListener("change", e => { tripFilter = e.target.value; render(); });

// αναζήτηση και σε παλιότερα (εκτός των 45 ημερών)
let qT = null;
$("q").addEventListener("input", () => { clearTimeout(qT); const q = $("q").value.trim(); if (q.length < 3) return;
  qT = setTimeout(async () => { const s = q.replace(/[%,()]/g, " ");
    const { data } = await sb.from("parcels").select("*").or(`recipient_name.ilike.%${s}%,receipt_no.ilike.%${s}%,recipient_phone.ilike.%${s}%,picked_by_phone.ilike.%${s}%,id_doc_number.ilike.%${s}%,picked_by_name.ilike.%${s}%,pickup_code.eq.${s}`).limit(50);
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
  const ta = el("textarea", "wide"); ta.value = fillTemplate(remind ? settings.reminder_template : settings.notification_template, p); ta.setAttribute("aria-label", "Μήνυμα");
  const bar = el("div", "toolbar wide"); const ph = p.recipient_phone;
  const mark = async ch => {
    try { await updateParcel(p.id, { status: "notified", status_at: new Date().toISOString(), notified_at: new Date().toISOString(), notify_count: (p.notify_count || 0) + 1, notify_channel: ch }); } catch {}
    openBox = bulk ? { id: nextToNotify(p.id), kind: "notify" } : { id: null }; if (!openBox.id) bulk = false; render();
  };
  const link = (label, href, ch, cls, pre) => { const a = el("a", "btn small" + (cls ? " " + cls : ""), label); a.target = "_blank"; a.rel = "noopener";
    a.onclick = async () => { a.href = href(); if (pre) await pre(); setTimeout(() => mark(ch), 400); }; a.href = href(); bar.append(a); };
  if (ph) {
    link("WhatsApp", () => "https://wa.me/30" + ph + "?text=" + encodeURIComponent(ta.value), "whatsapp", "primary");
    link("Viber", () => "viber://chat?number=%2B30" + ph + "&draft=" + encodeURIComponent(ta.value), "viber", "", async () => { try { await navigator.clipboard.writeText(ta.value); } catch {} });
    link("SMS", () => "sms:+30" + ph + "?&body=" + encodeURIComponent(ta.value), "sms");
  }
  const copy = el("button", "btn small", "Αντιγραφή"); copy.type = "button";
  copy.onclick = async () => { try { await navigator.clipboard.writeText(ta.value); copy.textContent = "Αντιγράφηκε"; } catch { ta.select(); } }; bar.append(copy);
  const close = el("button", "btn small", bulk ? "Επόμενο" : "Κλείσιμο"); close.type = "button";
  close.onclick = () => { openBox = bulk ? { id: nextToNotify(p.id), kind: "notify" } : { id: null }; if (!openBox.id) bulk = false; render(); }; bar.append(close);
  box.append(ta, bar, el("div", "hint wide", ph ? "Viber: αν δεν εμφανιστεί το μήνυμα, έχει αντιγραφεί — κράτα πατημένο → Επικόλληση. Μόλις πατήσεις κανάλι, σημειώνεται «Ειδοποιήθηκε»." : "Δεν υπάρχει τηλέφωνο. Πάτα «Επεξεργασία» για να το προσθέσεις."));
  return box;
}
$("bulkBtn").onclick = () => { if (bulk) { bulk = false; openBox = { id: null }; render(); return; }
  bulk = true; setFilter("tonotify"); openBox = { id: nextToNotify(null), kind: "notify" }; if (!openBox.id) bulk = false; render(); };

// ---------------------------------------------------------------- παράδοση
function field(box, label, input, wide) { const w = el("div", "f" + (wide ? " wide" : "")); w.append(el("label", null, label), input); box.append(w); return input; }
function inp(v, attrs) { const i = el("input"); i.value = v || ""; Object.assign(i, attrs || {}); return i; }
function pickupBox(p) {
  const box = el("form", "box"); box.autocomplete = "off";
  const phone = field(box, "Τηλέφωνο παραλήπτη (υποχρεωτικό)", inp(p.recipient_phone, { inputMode: "tel", className: "mono", autocomplete: "off" }), true);
  const name = field(box, "Ονοματεπώνυμο (προαιρετικό)", inp(p.recipient_name), true);
  const when = field(box, "Ημέρα & ώρα παραλαβής", inp(toLocalInput(), { type: "datetime-local" }));
  const sel = el("select"); ["Ταυτότητα", "Δίπλωμα", "Διαβατήριο"].forEach(t => sel.append(new Option(t))); field(box, "Έγγραφο", sel);
  const idn = field(box, "Αριθμός εγγράφου (προαιρετικό)", inp("", { className: "mono", autocapitalize: "characters" }));
  const chk = (text) => { const l = el("label", "check wide"); const c = el("input"); c.type = "checkbox"; l.append(c, document.createTextNode(text)); box.append(l); return c; };
  const home = chk("Παράδοση στο σπίτι (delivery 3,50 €)");
  const codC = p.cod_amount_eur > 0 ? chk("Εισπράχθηκε " + money(p.cod_amount_eur) + " από τον παραλήπτη") : null;
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
    const nm = name.value.trim() || p.recipient_name || "", pn = cleanPhone(phone.value), idNo = cleanIdDoc(idn.value);
    if (!pn) { phone.focus(); return say("Γράψε το κινητό του παραλήπτη (10 ψηφία, π.χ. 6941234567).", "warn"); }
    if (codC && !codC.checked) return say("Τσέκαρε ότι εισπράχθηκε το ποσό " + money(p.cod_amount_eur) + ".", "warn");
    ok.disabled = true; say("Αποθήκευση…", "info");
    try {
      let path = null;
      if (drawn) {
        const blob = await signatureBlob(cv); path = p.id + ".png";
        const up = await sb.storage.from("signatures").upload(path, blob, { upsert: true, contentType: "image/png" });
        if (up.error) throw up.error;
      }
      const at = when.value ? new Date(when.value).toISOString() : new Date().toISOString();
      await updateParcel(p.id, { status: "done", status_at: new Date().toISOString(), picked_up_at: at, picked_by_name: nm, picked_by_phone: pn || null,
        id_doc_type: idNo ? sel.value : null, id_doc_number: idNo || null, id_doc_last4: idNo ? idNo.slice(-4) : null,
        signature_path: path, home_delivery: home.checked, cod_collected: codC ? true : p.cod_collected });
      if (nm) linkCustomer(nm, pn).catch(() => {});
      openBox = { id: null }; show($("formMsg"), "Παραδόθηκε: " + (p.receipt_no || nm) + ".", "ok"); render();
    } catch (err) { console.error(err); ok.disabled = false; say("Δεν αποθηκεύτηκε. Δοκίμασε ξανά.", "bad"); }
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
function fwdBox(p) {
  const box = el("form", "box"); box.autocomplete = "off";
  const dest = field(box, "Προορισμός", inp(p.fwd_destination || p.destination_city)); dest.setAttribute("list", "cities");
  const when = field(box, "Αναχώρηση από Αγρίνιο", inp(toLocalInput(), { type: "datetime-local" }));
  const note = field(box, "Σημείωση", inp("", { placeholder: "π.χ. λεωφορείο / οδηγός" }), true);
  const seen = new Set(); const q = el("div", "quick wide");
  [...rows.values()].filter(x => x.fwd_departure_at && norm(x.fwd_destination) === norm(dest.value)).sort((a, b) => String(b.fwd_at).localeCompare(String(a.fwd_at)))
    .forEach(x => { const k = fmtGr(x.fwd_departure_at); if (seen.size < 3 && !seen.has(k)) { seen.add(k); const b = el("button", "btn small", "↻ " + k); b.type = "button"; b.onclick = () => { when.value = toLocalInput(x.fwd_departure_at); }; q.append(b); } });
  if (q.childNodes.length) box.append(el("div", "hint wide", "Ίδιο δρομολόγιο με προηγούμενα δέματα:"), q);
  const msg = el("div", "msg warn wide"); msg.hidden = true; box.append(msg);
  const acts = el("div", "formactions"); const ok = el("button", "btn primary", "Καταχώρηση αποστολής"); ok.type = "submit";
  const cancel = el("button", "btn", "Ακύρωση"); cancel.type = "button"; cancel.onclick = () => { openBox = { id: null }; render(); };
  acts.append(ok, cancel); box.append(acts);
  box.onsubmit = async e => { e.preventDefault(); if (needOperator()) return;
    const d = norm(dest.value); if (!d || d === HOME) { msg.textContent = "Γράψε τον προορισμό."; msg.hidden = false; return; }
    if (!when.value) { msg.textContent = "Διάλεξε ημέρα και ώρα."; msg.hidden = false; return; }
    ok.disabled = true;
    try { const now = new Date().toISOString(); await updateParcel(p.id, { status: "forwarded", status_at: now, fwd_at: now, fwd_destination: d, fwd_departure_at: new Date(when.value).toISOString(), fwd_note: note.value.trim() || null });
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
$("manifestBtn").onclick = () => { $("manifestBtn").closest("details").open = false; openManifest({ sb, operator, needOperator, linkCustomer, rows: () => [...rows.values()], onSaved: p => { rows.set(p.id, p); scheduleRender(); } }); };
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
    ["kind", "Τύπος"], ["item", "Είδος"], ["origin_city", "Από"], ["destination_city", "Προορισμός"], ["sender_name", "Αποστολέας"], ["recipient_name", "Παραλήπτης"],
    ["recipient_phone", "Τηλέφωνο"], ["phone_source", "Πηγή τηλεφώνου"], ["fare_eur", "Κόμιστρο €", eur("fare_eur")], ["shelf", "Ράφι"], ["status", "Κατάσταση", r => STATUS[r.status] || r.status],
    ["created_at", "Καταχώρηση", d("created_at")], ["notified_at", "Ειδοποίηση", d("notified_at")], ["picked_up_at", "Παραλαβή", d("picked_up_at")], ["picked_by_name", "Παρέλαβε"],
    ["picked_by_phone", "Τηλ. παραλαβής"], ["id_doc_type", "Έγγραφο"], ["id_doc_number", "Αριθμός εγγράφου"], ["signature_path", "Υπογραφή", r => r.signature_path ? "Ναι" : ""],
    ["home_delivery", "Delivery", yes("home_delivery")], ["cod_amount_eur", "Είσπραξη €", eur("cod_amount_eur")], ["cod_collected", "Εισπράχθηκε", yes("cod_collected")],
    ["fwd_departure_at", "Αποστολή από Αγρίνιο", d("fwd_departure_at")], ["fwd_note", "Σημ. αποστολής"], ["damaged", "Ζημιά", yes("damaged")], ["notes", "Σημειώσεις"], ["operator", "Τελευταίος χειριστής"]];
  const blob = new Blob([toCSV(data, cols)], { type: "text/csv;charset=utf-8" });
  const a = el("a"); a.href = URL.createObjectURL(blob); a.download = "apothiki-dematon-" + fmtGr(new Date(), false).replace(/\//g, "-") + ".csv"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

$("goSearch").onclick = () => { $("hLog").scrollIntoView({ behavior: "smooth" }); setTimeout(() => $("q").focus(), 350); };
$("goNew").onclick = () => { $("hNew").scrollIntoView({ behavior: "smooth" }); };

// ---------------------------------------------------------------- εκκίνηση
setInterval(() => { if (!openBox.id && !$("app").hidden) render(); }, 60000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") location.reload(); });
boot();
