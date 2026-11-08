// 💳 Πληρωμές από απόσταση (Viva Quick Pay / IRIS).
//  • Μετά το ζύγισμα φτιάχνεις σύνδεσμο στο Viva με το τελικό ποσό, τον επικολλάς εδώ και τον στέλνεις.
//  • Ο ναύλος (fare) αποδίδεται στο ταμείο ημέρας ΚΤΕΛ· η δική μας χρέωση (service) μένει σε εμάς.
import { cleanPhone, fmtPhone, PAY_PURPOSE, paymentMessage, paymentSummary, looksLikePayLink } from "./lib.js";

const $ = id => document.getElementById(id);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const eur = n => (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace(".", ",") + " €";
const num = v => { const n = Number(String(v || "").replace(",", ".")); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN; };
let D = null, rows = [], armed = false;

export function initPayments(deps) { D = deps; }

async function load() {
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const [a, b] = await Promise.all([
    D.sb.from("payment_requests").select("*").gte("created_at", since).order("created_at", { ascending: false }),
    D.sb.from("payment_requests").select("*").eq("status", "paid").is("settled_at", null),
  ]);
  const err = a.error || b.error;
  if (err) throw new Error(/does not exist|schema cache|not find/i.test(err.message) ? "Τρέξε πρώτα το 0025_payments.sql στο Supabase." : err.message);
  const m = new Map(); for (const r of [...(a.data || []), ...(b.data || [])]) m.set(r.id, r);
  rows = [...m.values()].sort((x, y) => y.created_at.localeCompare(x.created_at));
}

export async function openPayments(prefill = {}) {
  const body = $("dlgBody"); body.textContent = "";
  body.append(el("h2", null, "💳 Πληρωμές από απόσταση"), el("div", "hint", "Φόρτωση…"));
  $("dlg").showModal();
  try { await load(); } catch (e) { body.lastChild.textContent = e.message; body.lastChild.className = "msg bad"; return; }
  render(null, null, prefill);
}

function sendBox(r) {
  const box = el("div", "hrow");
  const ta = el("textarea"); ta.rows = 5; ta.style.width = "100%"; ta.value = paymentMessage(r);
  const ph = cleanPhone(r.payer_phone);
  const bar = el("div"); bar.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:6px";
  if (ph) {
    const wa = el("a", "btn small primary", "WhatsApp"); wa.target = "_blank"; wa.rel = "noopener";
    wa.onclick = () => { wa.href = "https://wa.me/30" + ph + "?text=" + encodeURIComponent(ta.value); };
    const sms = el("a", "btn small", "SMS"); sms.onclick = () => { sms.href = "sms:+30" + ph + "?&body=" + encodeURIComponent(ta.value); };
    bar.append(wa, sms);
  }
  const cp = el("button", "btn small", "📋 Αντιγραφή"); cp.type = "button";
  cp.onclick = async () => { try { await navigator.clipboard.writeText(ta.value); cp.textContent = "✓ Αντιγράφηκε"; } catch { ta.select(); } };
  bar.append(cp);
  box.append(ta, bar);
  return box;
}

function render(msg, cls, prefill = {}) {
  const body = $("dlgBody"); body.textContent = "";
  body.append(el("h2", null, "💳 Πληρωμές από απόσταση"));
  body.append(el("div", "hint", "Για όποιον πληρώνει από μακριά (π.χ. γονιός για τον φοιτητή) και για την παράδοση στο σπίτι. Στείλε σύνδεσμο ΜΟΝΟ μετά το ζύγισμα, με το τελικό ποσό."));
  if (msg) body.append(el("div", "msg " + (cls || "ok"), msg));

  // ---- ταμείο ημέρας
  const S = paymentSummary(rows);
  const cash = el("div", "msg " + (S.fareToSettle ? "warn" : "ok"));
  cash.append(el("b", null, "Ταμείο ημέρας: "), S.fareToSettle ? `ναύλοι προς απόδοση στο ΚΤΕΛ ${eur(S.fareToSettle)} (${S.unsettledIds.length} πληρωμές)` : "τίποτα προς απόδοση", S.serviceUnsettled ? ` · δικές μας χρεώσεις ${eur(S.serviceUnsettled)}` : "");
  body.append(cash);
  if (S.unsettledIds.length) {
    const st = el("button", "btn small", armed ? "⚠ Πάτα ξανά: αποδόθηκαν" : "✓ Αποδόθηκαν στο ταμείο ημέρας"); st.type = "button";
    st.onclick = async () => {
      if (!armed) { armed = true; setTimeout(() => { armed = false; }, 8000); return render(); }
      armed = false;
      const { error } = await D.sb.from("payment_requests").update({ settled_at: new Date().toISOString() }).in("id", S.unsettledIds);
      if (error) return render("Σφάλμα: " + error.message, "bad");
      await load(); render("✓ Καταγράφηκε η απόδοση στο ταμείο ημέρας.", "ok");
    };
    body.append(st);
  }

  // ---- νέο αίτημα
  body.append(el("h3", "hsec", "Νέο αίτημα πληρωμής"));
  const purpose = el("select"); Object.entries(PAY_PURPOSE).forEach(([v, t]) => { const o = el("option", null, t); o.value = v; purpose.append(o); });
  purpose.value = prefill.purpose || "fare";
  const receipt = el("input"); receipt.placeholder = "Αρ. απόδειξης ΚΤΕΛ (αν υπάρχει)"; receipt.value = prefill.receipt || "";
  const recipient = el("input"); recipient.placeholder = "Για ποιον (π.χ. Γ. Παπαδόπουλο)"; recipient.value = prefill.recipient || "";
  const payer = el("input"); payer.placeholder = "Όνομα αυτού που πληρώνει";
  const phone = el("input"); phone.placeholder = "Κινητό αυτού που πληρώνει"; phone.inputMode = "tel";
  const fare = el("input"); fare.placeholder = "Ναύλος ΚΤΕΛ €"; fare.inputMode = "decimal"; fare.value = prefill.fare ?? "";
  const service = el("input"); service.placeholder = "Δική μας χρέωση € (σπίτι, φύλαξη)"; service.inputMode = "decimal";
  const link = el("input"); link.placeholder = "Σύνδεσμος Viva (Quick Pay)"; link.type = "url";
  const total = el("div", "hint");
  const upd = () => { const t = (num(fare.value) || 0) + (num(service.value) || 0); total.textContent = "Σύνολο για τον σύνδεσμο: " + eur(t); };
  fare.oninput = service.oninput = upd; upd();
  purpose.onchange = () => { if (purpose.value === "home" && !service.value) { service.value = "3"; upd(); } };
  const grid = el("div", "grid2"); grid.append(purpose, receipt, recipient, payer, phone, fare, service, link);
  const viva = el("a", null, "Άνοιγμα Viva για να φτιάξεις τον σύνδεσμο ↗"); viva.href = "https://app.vivapayments.com/"; viva.target = "_blank"; viva.rel = "noopener";
  const add = el("button", "btn primary", "➕ Δημιουργία και αποστολή"); add.type = "button";
  add.onclick = async () => {
    const f = num(fare.value) || 0, s = num(service.value) || 0;
    if (Number.isNaN(num(fare.value || 0)) || Number.isNaN(num(service.value || 0))) return render("Τα ποσά δεν είναι σωστά.", "bad");
    if (f + s <= 0) return render("Βάλε ποσό.", "bad");
    const ph = phone.value.trim() ? cleanPhone(phone.value) : "";
    if (phone.value.trim() && !ph) return render("Το κινητό δεν φαίνεται σωστό (10 ψηφία).", "bad");
    if (link.value.trim() && !looksLikePayLink(link.value)) return render("Ο σύνδεσμος δεν είναι του Viva. Έλεγξέ τον πριν τον στείλεις.", "bad");
    add.disabled = true;
    const rec = { purpose: purpose.value, receipt: receipt.value.trim() || null, recipient: recipient.value.trim() || null, payer_name: payer.value.trim() || null,
      payer_phone: ph || null, fare: f, service: s, link: link.value.trim() || null, operator: D.operator() || null };
    const { data, error } = await D.sb.from("payment_requests").insert(rec).select().single();
    if (error) return render("Σφάλμα: " + error.message, "bad");
    await load(); render("✓ Δημιουργήθηκε. Στείλε το μήνυμα:", "ok");
    $("dlgBody").insertBefore(sendBox(data), $("dlgBody").querySelector("h3"));
  };
  body.append(grid, total, viva, el("div"), add);

  // ---- λίστα
  const block = (title, list, actions) => {
    body.append(el("h3", "hsec", title + " (" + list.length + ")"));
    if (!list.length) body.append(el("div", "hint", "—"));
    for (const r of list) {
      const row = el("div", "hrow");
      row.append(el("b", null, eur(Number(r.fare) + Number(r.service))), " · " + (PAY_PURPOSE[r.purpose] || r.purpose)
        + (r.recipient ? " · " + r.recipient : "") + (r.receipt ? " · " + r.receipt : "") + (r.payer_phone ? " · " + fmtPhone(r.payer_phone) : "")
        + " · " + new Date(r.created_at).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
        + (r.paid_at ? " · πληρώθηκε " + ({ card: "κάρτα", iris: "IRIS", other: "άλλο" }[r.paid_method] || "") : "")
        + (r.settled_at ? " · αποδόθηκε" : ""));
      actions(r, row); body.append(row);
    }
  };
  const btn = (label, fn) => { const b = el("button", "btn small", label); b.type = "button"; b.style.marginLeft = "6px"; b.onclick = fn; return b; };
  const set = async (r, patch, okMsg) => { const { error } = await D.sb.from("payment_requests").update(patch).eq("id", r.id); if (error) return render("Σφάλμα: " + error.message, "bad"); await load(); render(okMsg, "ok"); };
  block("Σε αναμονή πληρωμής", rows.filter(r => r.status === "pending"), (r, row) => {
    row.append(btn("📤 Ξανά", () => { row.after(sendBox(r)); }),
      btn("✓ Κάρτα", () => set(r, { status: "paid", paid_method: "card", paid_at: new Date().toISOString() }, "✓ Σημειώθηκε πληρωμένο.")),
      btn("✓ IRIS", () => set(r, { status: "paid", paid_method: "iris", paid_at: new Date().toISOString() }, "✓ Σημειώθηκε πληρωμένο.")),
      btn("✕ Ακύρωση", () => set(r, { status: "cancelled" }, "Ακυρώθηκε.")));
  });
  block("Πληρωμένα (14 ημέρες)", rows.filter(r => r.status === "paid"), (r, row) => {
    if (!r.settled_at) row.append(btn("↺", () => set(r, { status: "pending", paid_method: null, paid_at: null }, "Επέστρεψε σε αναμονή.")));
  });
  body.append(el("div", "hint", "Η πληρωμή φαίνεται στο Viva (εφαρμογή ή email). Σημείωσέ την εδώ και κόψε απόδειξη όπως πάντα."));
}
