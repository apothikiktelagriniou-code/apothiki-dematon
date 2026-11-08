// 🎁 Κλήρωση λίστας αναμονής «Παράδοση στο σπίτι».
//  • Συμμετοχές: επικόλληση του μηνύματος της φόρμας της ιστοσελίδας, ή χειροκίνητα από τον πάγκο.
//  • Μία συμμετοχή ανά κινητό. Η κλήρωση (τυχαία, κρυπτογραφικά) γίνεται μία φορά, μετά τη λήξη.
//  • Αποτελέσματα: νικητές + αναπληρωματικοί, κουμπί κλήσης, κείμενο ανακοίνωσης μόνο με αρχικά.
import { cleanPhone, fmtPhone, parseContestMessage, initials, drawOrder, cryptoRnd, pollSummary } from "./lib.js";

export const CONTEST = { id: "spiti-2026", title: "Παράδοση στο σπίτι", end: "2026-12-31", draw: "2027-01-08", winners: 5, keepMonths: 6 };

const $ = id => document.getElementById(id);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const fmtDate = ymd => new Date(ymd + "T12:00:00").toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
let D = null, entries = [], armed = null, poll = null, pollErr = null;

export function initContest(deps) { D = deps; }

async function load() {
  const { data, error } = await D.sb.from("contest_entries").select("*").eq("contest", CONTEST.id).order("created_at", { ascending: false });
  if (error) throw new Error(/does not exist|schema cache|not find/i.test(error.message) ? "Τρέξε πρώτα το 0023_contest.sql στο Supabase." : error.message);
  entries = data || [];
  const r = await D.sb.from("poll_responses").select("*").eq("poll", CONTEST.id).order("created_at", { ascending: false }).limit(5000);
  if (r.error) { poll = null; pollErr = /does not exist|schema cache|not find/i.test(r.error.message) ? "Τρέξε το 0024_poll.sql στο Supabase για να ενεργοποιηθεί η δημοσκόπηση." : r.error.message; }
  else { poll = r.data || []; pollErr = null; }
}

export async function openContest() {
  const body = $("dlgBody"); body.textContent = "";
  body.append(el("h2", null, "🎁 Κλήρωση · " + CONTEST.title), el("div", "hint", "Φόρτωση…"));
  $("dlg").showModal();
  try { await load(); } catch (e) { body.lastChild.textContent = e.message; body.lastChild.className = "msg bad"; return; }
  render();
}

function render(msg, cls) {
  const body = $("dlgBody"); body.textContent = "";
  const drawn = entries.some(e => e.rank);
  const ended = today() > CONTEST.end;
  body.append(el("h2", null, "🎁 Κλήρωση · " + CONTEST.title));
  body.append(el("div", "hint", `${entries.length} συμμετοχές · δεκτές έως ${fmtDate(CONTEST.end)} · κλήρωση ${fmtDate(CONTEST.draw)} · ${CONTEST.winners} νικητές + ${CONTEST.winners} αναπληρωματικοί`));
  if (msg) { const m = el("div", "msg " + (cls || "ok"), msg); body.append(m); }

  renderPoll(body);
  if (drawn) renderResults(body);
  else {
    // ---- νέα συμμετοχή
    body.append(el("h3", "hsec", "Νέα συμμετοχή"));
    const ta = el("textarea"); ta.rows = 4; ta.placeholder = "Επικόλλησε εδώ το μήνυμα της φόρμας από το WhatsApp ή το email…"; ta.style.width = "100%";
    const name = el("input"); name.placeholder = "Ονοματεπώνυμο"; name.autocomplete = "off";
    const phone = el("input"); phone.placeholder = "Κινητό"; phone.inputMode = "tel";
    const addr = el("input"); addr.placeholder = "Διεύθυνση στο Αγρίνιο";
    const src = el("select"); [["website", "Ιστοσελίδα"], ["counter", "Πάγκος"], ["phone", "Τηλέφωνο"]].forEach(([v, t]) => { const o = el("option", null, t); o.value = v; src.append(o); });
    const warn = el("div", "msg warn"); warn.hidden = true;
    ta.oninput = () => {
      const p = parseContestMessage(ta.value);
      if (p.name) name.value = p.name; if (p.phone || p.phoneRaw) phone.value = p.phone || p.phoneRaw; if (p.address) addr.value = p.address;
      if (ta.value.trim()) src.value = "website";
      warn.hidden = p.optIn !== false; warn.textContent = "Το μήνυμα λέει ότι ΔΕΝ θέλει να συμμετέχει στην κλήρωση.";
    };
    const add = el("button", "btn", "➕ Καταχώρηση συμμετοχής"); add.type = "button";
    add.onclick = async () => {
      const ph = cleanPhone(phone.value);
      if (!name.value.trim()) return render("Γράψε ονοματεπώνυμο.", "bad");
      if (!ph) return render("Το κινητό δεν φαίνεται σωστό (10 ψηφία, 69…).", "bad");
      if (entries.some(e => e.phone === ph)) return render("Το κινητό " + fmtPhone(ph) + " έχει ήδη συμμετοχή.", "warn");
      add.disabled = true;
      const { error } = await D.sb.from("contest_entries").insert({ contest: CONTEST.id, name: name.value.trim(), phone: ph, address: addr.value.trim() || null, source: src.value, operator: D.operator() || null });
      if (error) return render(/duplicate|unique/i.test(error.message) ? "Το κινητό έχει ήδη συμμετοχή." : "Σφάλμα: " + error.message, "bad");
      await load(); render("✓ Καταχωρήθηκε: " + name.value.trim(), "ok");
    };
    const grid = el("div", "grid2"); grid.append(name, phone, addr, src);
    body.append(ta, warn, grid, add);
    if (ended) body.append(el("div", "msg warn", "Η περίοδος συμμετοχών έληξε. Συμμετοχές μετά τις " + fmtDate(CONTEST.end) + " δεν είναι έγκυρες."));

    // ---- κλήρωση
    body.append(el("h3", "hsec", "Κλήρωση"));
    const go = el("button", "btn primary", armed ? "⚠ Πάτα ξανά για ΟΡΙΣΤΙΚΗ κλήρωση" : "🎲 Κλήρωση τώρα"); go.type = "button";
    go.disabled = entries.length === 0;
    if (!ended) body.append(el("div", "hint", "Κανονικά η κλήρωση γίνεται μετά τις " + fmtDate(CONTEST.end) + ". Αν πατηθεί νωρίτερα, όσοι δηλώσουν μετά δεν θα έχουν συμμετάσχει."));
    go.onclick = async () => {
      if (!armed) { armed = setTimeout(() => { armed = null; render(); }, 8000); return render(); }
      clearTimeout(armed); armed = null; go.disabled = true;
      const order = drawOrder(entries.map(e => e.id), cryptoRnd).slice(0, CONTEST.winners * 2);
      const at = new Date().toISOString(), by = D.operator() || null;
      for (let i = 0; i < order.length; i++) {
        const { error } = await D.sb.from("contest_entries").update({ rank: i + 1, drawn_at: at, drawn_by: by }).eq("id", order[i]);
        if (error) return render("Σφάλμα στην κλήρωση: " + error.message, "bad");
      }
      await load(); render("✓ Η κλήρωση έγινε " + new Date(at).toLocaleString("el-GR") + (by ? " από " + by : "") + ".", "ok");
    };
    body.append(go);
  }

  // ---- λίστα
  body.append(el("h3", "hsec", "Συμμετοχές (" + entries.length + ")"));
  if (!entries.length) body.append(el("div", "hint", "Καμία συμμετοχή ακόμα."));
  for (const e of entries) {
    const row = el("div", "hrow");
    row.append(el("b", null, e.name), " · " + fmtPhone(e.phone) + (e.address ? " · " + e.address : "") + " · " + ({ website: "ιστοσελίδα", counter: "πάγκος", phone: "τηλέφωνο" }[e.source] || e.source) + " · " + new Date(e.created_at).toLocaleDateString("el-GR"));
    if (!drawn) {
      const del = el("button", "btn small", "✕"); del.type = "button"; del.title = "Διαγραφή συμμετοχής"; del.style.marginLeft = "8px";
      del.onclick = async () => { if (del.dataset.armed) { await D.sb.from("contest_entries").delete().eq("id", e.id); await load(); render("Διαγράφηκε.", "ok"); } else { del.dataset.armed = "1"; del.textContent = "Σίγουρα;"; } };
      row.append(del);
    }
    body.append(row);
  }
}

function renderResults(body) {
  const ranked = entries.filter(e => e.rank).sort((a, b) => a.rank - b.rank);
  const first = ranked[0];
  body.append(el("div", "hint", "Κλήρωση: " + new Date(first.drawn_at).toLocaleString("el-GR") + (first.drawn_by ? " · " + first.drawn_by : "")));
  const block = (title, list) => {
    body.append(el("h3", "hsec ok", title));
    for (const e of list) {
      const row = el("div", "hrow");
      row.append(el("b", null, e.rank + ". " + e.name), " · ");
      const tel = el("a", null, fmtPhone(e.phone)); tel.href = "tel:" + e.phone; row.append(tel);
      const st = e.claimed_at ? " · ✓ πήρε το δώρο" : e.contacted_at ? " · 📞 ειδοποιήθηκε " + new Date(e.contacted_at).toLocaleDateString("el-GR") : " · δεν έχει ειδοποιηθεί";
      row.append(st);
      const mk = (label, field) => { const b = el("button", "btn small", label); b.type = "button"; b.style.marginLeft = "8px";
        b.onclick = async () => { await D.sb.from("contest_entries").update({ [field]: e[field] ? null : new Date().toISOString() }).eq("id", e.id); await load(); render(); }; return b; };
      row.append(mk(e.contacted_at ? "↺ ειδοπ." : "📞 Ειδοποιήθηκε", "contacted_at"), mk(e.claimed_at ? "↺ δώρο" : "🎁 Πήρε το δώρο", "claimed_at"));
      body.append(row);
    }
  };
  block("🏆 Νικητές", ranked.filter(e => e.rank <= CONTEST.winners));
  block("Αναπληρωματικοί (με τη σειρά)", ranked.filter(e => e.rank > CONTEST.winners));
  body.append(el("div", "hint", "Αν νικητής δεν απαντήσει σε 5 εργάσιμες, το δώρο πάει στον πρώτο αναπληρωματικό."));

  const text = "🎁 Αποτελέσματα κλήρωσης «" + CONTEST.title + "»\nΝικητές: " + ranked.filter(e => e.rank <= CONTEST.winners).map(e => initials(e.name)).join(", ") + "\nΣυγχαρητήρια! Θα επικοινωνήσουμε μαζί σας τηλεφωνικά.";
  const pre = el("pre", "hrow", text); pre.style.whiteSpace = "pre-wrap";
  const copy = el("button", "btn small", "📋 Αντιγραφή ανακοίνωσης (μόνο αρχικά)"); copy.type = "button";
  copy.onclick = async () => { try { await navigator.clipboard.writeText(text); copy.textContent = "✓ Αντιγράφηκε"; } catch { copy.textContent = "Επίλεξε το κείμενο και αντέγραψέ το"; } };
  body.append(el("h3", "hsec", "Ανακοίνωση"), pre, copy);

  // διαγραφή μετά από keepMonths
  const until = new Date(first.drawn_at); until.setMonth(until.getMonth() + CONTEST.keepMonths);
  const wipe = el("button", "btn small", "🗑 Διαγραφή όλων των συμμετοχών"); wipe.type = "button";
  const due = new Date() >= until;
  body.append(el("div", "hint", "Τα στοιχεία πρέπει να διαγραφούν έως " + until.toLocaleDateString("el-GR") + " (όροι κλήρωσης)." + (due ? " ⚠ Η προθεσμία πέρασε." : "")));
  wipe.onclick = async () => {
    if (!wipe.dataset.armed) { wipe.dataset.armed = "1"; wipe.textContent = "⚠ Πάτα ξανά: διαγράφονται ΟΛΑ"; return; }
    const { error } = await D.sb.from("contest_entries").delete().eq("contest", CONTEST.id);
    if (error) return render("Σφάλμα: " + error.message, "bad");
    await load(); render("✓ Διαγράφηκαν όλες οι συμμετοχές.", "ok");
  };
  body.append(wipe);
}

// ---- 📊 Δημοσκόπηση (ανώνυμες απαντήσεις από apothikiktelagriniou.gr/poll)
const LBL = {
  would_use: { yes: "Ναι, σίγουρα", maybe: "Ίσως", no: "Όχι" },
  frequency: { weekly: "Κάθε εβδομάδα", monthly: "Κάθε μήνα", yearly: "Λίγες φορές/χρόνο", rarely: "Σπάνια/ποτέ" },
  price: { "2": "Έως 2 €", "3": "3 €", "4": "4 €", "5plus": "5 €+", none: "Τίποτα" },
  wants: { home: "Στο σπίτι", work: "Σε δουλειά/κατάστημα", pickup: "Παραλαβή για αποστολή" },
  who: { private: "Ιδιώτης", business: "Επιχείρηση" },
  area: { center: "Κέντρο", town: "Αλλού στην πόλη", outside: "Εκτός πόλης" },
};
function renderPoll(body) {
  const det = el("details", "hrow"); det.style.margin = "10px 0";
  const sum = el("summary"); sum.style.cursor = "pointer"; sum.style.fontWeight = "700";
  det.append(sum);
  if (pollErr) { sum.textContent = "📊 Δημοσκόπηση"; det.append(el("div", "msg warn", pollErr)); body.append(det); return; }
  const S = pollSummary(poll);
  sum.textContent = `📊 Δημοσκόπηση · ${S.total} απαντήσεις · ${S.key} «σίγουρα + πληρώνει ≥3 €»`;
  if (!S.total) { det.append(el("div", "hint", "Καμία απάντηση ακόμα. Σύνδεσμος για SMS: apothikiktelagriniou.gr/poll?s=sms · για QR στον πάγκο: ?s=qr · για Facebook: ?s=fb")); body.append(det); return; }
  const key = el("div", "msg ok");
  key.append(el("b", null, `Βασικός αριθμός: ${S.key} (${S.pct(S.key)}%)`), ` απάντησαν «Ναι, σίγουρα» ΚΑΙ θα πλήρωναν 3 € ή παραπάνω · από αυτούς ${S.keyFrequent} στέλνουν/παραλαμβάνουν κάθε εβδομάδα ή μήνα.`);
  det.append(key, el("div", "hint", "Οι δημοσκοπήσεις υπερεκτιμούν: λογάριασε ότι στην πράξη θα το χρησιμοποιήσει περίπου το 1/3 με 1/2 όσων λένε «σίγουρα»."));
  const block = (title, field, counts) => {
    det.append(el("h3", "hsec", title));
    const entries = Object.entries(LBL[field] || {}).map(([k, t]) => [t, counts[k] || 0]);
    for (const [t, n] of entries) {
      const row = el("div", "hrow"); const pct = S.pct(n);
      const bar = el("span"); bar.style.cssText = `display:inline-block;height:10px;border-radius:5px;background:currentColor;opacity:.35;margin-left:8px;vertical-align:middle;width:${Math.max(pct, 1) * 1.6}px`;
      row.append(el("b", null, t), ` · ${n} (${pct}%)`, bar); det.append(row);
    }
  };
  block("Θα τη χρησιμοποιούσαν", "would_use", S.would_use);
  block("Πόσα θα πλήρωναν", "price", S.price);
  block("Συχνότητα δεμάτων ΚΤΕΛ", "frequency", S.frequency);
  block("Τι θέλουν (πολλαπλή επιλογή)", "wants", S.wants);
  block("Ποιοι", "who", S.who);
  block("Περιοχή", "area", S.area);
  det.append(el("h3", "hsec", "Από πού ήρθαν"), el("div", "hrow", Object.entries(S.source).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join(" · ") || "—"));
  if (S.comments.length) {
    det.append(el("h3", "hsec", "Σχόλια (τελευταία " + S.comments.length + ")"));
    for (const c of S.comments) det.append(el("div", "hrow", new Date(c.at).toLocaleDateString("el-GR") + " · " + c.text));
  }
  body.append(det);
}
