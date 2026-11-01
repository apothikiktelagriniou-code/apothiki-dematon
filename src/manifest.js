// Έλεγχος κατάστασης πρακτορείου: φωτογραφίες λίστας → AI → σύγκριση με τα καταχωρημένα δέματα.
import { norm, parseGrDate, fmtGr, tripsOf, reconcile, fmtPhone, cityFromStation, shelfFor, HOME, money } from "./lib.js";

const $ = id => document.getElementById(id);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };

async function toB64(file, max = 2000, q = 0.82) {
  const u = URL.createObjectURL(file); const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
  URL.revokeObjectURL(u); const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", q).split(",")[1];
}

export function openManifest(D) {
  const body = $("dlgBody"); body.textContent = "";
  body.append(el("h2", null, "Έλεγχος κατάστασης πρακτορείου"),
    el("div", "hint", "Φωτογράφισε την κατάσταση (έως 4 σελίδες). Θα σου δείξω ποια δέματα της λίστας έχουν καταχωρηθεί, ποια λείπουν, και ποια καταχωρήθηκαν χωρίς να είναι στη λίστα."));
  const lbl = el("label", "btn primary big", "📄 Φωτογραφίες κατάστασης"); const inp = el("input"); inp.type = "file"; inp.accept = "image/*"; inp.multiple = true; inp.hidden = true; lbl.append(inp);
  const info = el("div", "hint"); const go = el("button", "btn primary", "Έλεγχος"); go.type = "button"; go.hidden = true;
  const msg = el("div", "msg info"); msg.hidden = true; const out = el("div", "mres");
  let files = [];
  inp.onchange = () => { files = [...inp.files].slice(0, 4); info.textContent = files.length + " σελίδες επιλέχθηκαν" + (inp.files.length > 4 ? " (κρατήθηκαν οι 4 πρώτες)" : ""); go.hidden = !files.length; };
  go.onclick = async () => {
    go.disabled = true; msg.hidden = false; msg.className = "msg info"; msg.textContent = "Διαβάζω την κατάσταση… (μπορεί να πάρει έως 1 λεπτό)"; out.textContent = "";
    try {
      const images = await Promise.all(files.map(f => toB64(f).then(d => ({ data: d, media_type: "image/jpeg" }))));
      const { data, error } = await D.sb.functions.invoke("extract-receipt", { body: { mode: "manifest", images } });
      if (error) { let b = {}; try { b = await error.context.json(); } catch {} throw new Error(b.detail || b.error || error.message); }
      msg.hidden = true; show(data.data);
    } catch (e) { msg.className = "msg bad"; msg.textContent = "Δεν διαβάστηκε η κατάσταση: " + (e.message || e); }
    finally { go.disabled = false; }
  };
  body.append(lbl, info, go, msg, out);
  $("dlg").showModal();

  function show(m) {
    out.textContent = "";
    const dep = parseGrDate(m.departure);
    let origin = cityFromStation(m.origin_city);
    (m.items || []).forEach(it => { it.destination_city = cityFromStation(it.destination_city) || HOME; });
    // υποψήφια δέματα: τελευταίες 7 μέρες (και ίδια πόλη αν είναι γνωστή)
    const since = Date.now() - 7 * 864e5;
    const all = D.rows().filter(p => new Date(p.created_at).getTime() >= since);
    const cand = origin ? all.filter(p => p.origin_city === origin) : all;
    const trip = dep && origin ? { origin, key: tripsOf({ origin_city: origin, departure_at: dep.toISOString() })[0] } : origin ? { origin } : null;
    const r = reconcile(m.items || [], cand.length ? cand : all, trip);

    if (D.pendingReview && D.pendingReview() > 0) out.append(el("div", "msg warn", "⚠ Υπάρχουν " + D.pendingReview() + " φωτογραφίες στο «Για έλεγχο» που δεν έχουν καταχωρηθεί. Μέχρι να τις αποθηκεύσεις, μπορεί να εμφανίζονται εδώ ως «λείπουν»."));
    const head = el("div", "msg info");
    head.textContent = "Κατάσταση: " + (origin || "πόλη;") + (dep ? " · " + fmtGr(dep) : "") + (m.agency ? " · " + m.agency : "") + " · " + (m.items || []).length + " γραμμές" +
      (m.total_declared != null ? " (γράφει σύνολο " + m.total_declared + ")" : "");
    out.append(head);
    if (m.total_declared != null && m.total_declared !== (m.items || []).length) out.append(el("div", "msg warn", "⚠ Η κατάσταση γράφει σύνολο " + m.total_declared + " αλλά διάβασα " + (m.items || []).length + " γραμμές. Έλεγξε μήπως λείπει σελίδα ή κάποια γραμμή δεν διαβάστηκε."));
    if (!origin) out.append(el("div", "msg warn", "Δεν διαβάστηκε η πόλη αναχώρησης — η σύγκριση έγινε με όλα τα δέματα των τελευταίων 7 ημερών."));
    const byDest = {}; (m.items || []).forEach(it => { byDest[it.destination_city] = (byDest[it.destination_city] || 0) + 1; });
    out.append(el("div", "hint", "Ανά προορισμό: " + Object.entries(byDest).map(([d, n]) => (d === HOME ? "Αγρίνιο" : d + " (μεταφόρτωση)") + " " + n).join(" · ") +
      ((m.items || []).some(i => i.fare_eur != null) ? " · Κόμιστρα " + money((m.items || []).reduce((s, i) => s + (Number(i.fare_eur) || 0), 0)) : "")));

    const sec = (title, cls, rowsEls) => { const s = el("section", "msec"); s.append(el("h3", cls, title)); rowsEls.forEach(x => s.append(x)); if (!rowsEls.length) s.append(el("div", "hint", "—")); out.append(s); };
    const line = (t, sub) => { const d = el("div", "mline"); d.append(el("b", null, t)); if (sub) d.append(el("span", "hint", " " + sub)); return d; };

    const missHome = r.missing.filter(it => (it.destination_city || HOME) === HOME);
    const direct = r.missing.filter(it => (it.destination_city || HOME) !== HOME);
    const itemLine = it => line(it.recipient || "(χωρίς όνομα)", [it.receipt_no && "Φορτ. " + it.receipt_no, it.destination_city && it.destination_city !== HOME && "→ " + it.destination_city, it.pieces > 1 && it.pieces + " τεμ.", it.fare_eur != null && money(it.fare_eur), it.unsure && "⚠ αβέβαιη ανάγνωση"].filter(Boolean).join(" · "));
    const addRows = async (items, kind, msgEl) => {
      let ok = 0;
      for (const it of items) {
        const dest = it.destination_city || HOME;
        const row = { receipt_no: it.receipt_no || null, recipient_name: (it.recipient || "").trim(), origin_city: origin || null, destination_city: dest,
          departure_at: dep ? dep.toISOString() : null, fare_eur: it.fare_eur ?? null, kind: "Ασυνόδευτο", item: "Απλό δέμα", shelf: null,
          status: "not_arrived", bypassed: true, source: "manifest", operator: D.operator(),
          notes: (kind === "home" ? "Στην κατάσταση " : "Απευθείας μεταφόρτωση — κατάσταση ") + (origin || "") + (dep ? " " + fmtGr(dep) : "") + (kind === "home" ? " — δεν ήρθε στην αποθήκη Αγρινίου" : "") + (it.unsure ? " (αβέβαιη ανάγνωση)" : "") };
        const res = await D.sb.from("parcels").insert(row).select().single();
        if (!res.error) { ok++; D.onSaved && D.onSaved(res.data); }
      }
      msgEl.textContent = kind === "home" ? "🚫 " + ok + " μπήκαν στη λίστα «Δεν ήρθαν στην αποθήκη»." : "⇄ " + ok + " μπήκαν στη λίστα «Απευθείας μεταφορτώσεις» — εκεί σημειώνεις λεωφορείο και δρομολόγιο.";
    };
    const pending = D.pendingReview && D.pendingReview() > 0;
    const autoOrAsk = (items, kind, label) => {
      const m = el("div", "hint"); out.lastChild.append(m); if (!items.length) return;
      if (pending && kind === "home") {
        m.textContent = "Δεν τα πέρασα αυτόματα επειδή υπάρχουν φωτογραφίες στο «Για έλεγχο». Αν είσαι σίγουρος, πάτα:";
        const b = el("button", "btn small primary", label + " (" + items.length + ")"); b.type = "button";
        b.onclick = async () => { b.disabled = true; await addRows(items, kind, m); b.remove(); }; out.lastChild.append(b);
      } else addRows(items, kind, m);
    };

    sec("✗ Λείπουν — για ΑΓΡΙΝΙΟ, στην κατάσταση αλλά ΔΕΝ καταχωρήθηκαν (" + missHome.length + ")", "bad", missHome.map(itemLine));
    if (missHome.length) {
      const txt = "Κατάσταση " + (origin || "") + (dep ? " " + fmtGr(dep) : "") + " — ΔΕΝ παραλήφθηκαν στο Αγρίνιο:\n" +
        missHome.map((it, i) => (i + 1) + ". " + (it.recipient || "—") + (it.receipt_no ? " (φορτ. " + it.receipt_no + ")" : "")).join("\n") + "\nΑποθήκη Ασυνοδεύτων ΚΤΕΛ Αγρινίου · 26410 24446";
      const cp = el("button", "btn small", "Αντιγραφή λίστας που λείπουν (για το πρακτορείο)"); cp.type = "button";
      cp.onclick = async () => { try { await navigator.clipboard.writeText(txt); cp.textContent = "Αντιγράφηκε ✓"; } catch { cp.textContent = "Δεν αντιγράφηκε"; } };
      out.lastChild.append(cp);
    }
    autoOrAsk(missHome, "home", "Καταχώρηση στη λίστα «Δεν ήρθαν»");

    sec("⇄ Απευθείας μεταφορτώσεις — για άλλη πόλη, δεν περνούν από την αποθήκη (" + direct.length + ")", "warn", direct.map(itemLine));
    autoOrAsk(direct, "direct", "Καταχώρηση στις «Απευθείας μεταφορτώσεις»");

    const weak = r.found.filter(f => f.how === "name");
    sec("✓ Βρέθηκαν (" + r.found.length + ")" + (weak.length ? " — " + weak.length + " μόνο με το όνομα, έλεγξέ τα" : ""), "ok", r.found.map(f =>
      line((f.how === "name" ? "⚠ " : "") + (f.parcel.recipient_name || "—"), [f.parcel.shelf && "Ράφι " + f.parcel.shelf, f.parcel.receipt_no && "Απόδ. " + f.parcel.receipt_no,
        f.how === "name" ? "ταίριαξε μόνο με όνομα (κατάσταση: " + (f.item.recipient || "") + ")" : "", f.parcel.status === "done" ? "ήδη παραδόθηκε" : "", f.parcel.bypassed ? ((f.parcel.destination_city || HOME) === HOME ? "🚫 ήδη στη λίστα «Δεν ήρθαν»" : "⇄ ήδη στις «Απευθείας μεταφορτώσεις»") : ""].filter(Boolean).join(" · "))));
    if (trip && trip.key) sec("⚠ Καταχωρημένα σε αυτό το δρομολόγιο αλλά ΟΧΙ στην κατάσταση (" + r.extra.length + ")", "warn", r.extra.map(p =>
      line(p.recipient_name || "—", [p.receipt_no && "Απόδ. " + p.receipt_no, p.recipient_phone && fmtPhone(p.recipient_phone)].filter(Boolean).join(" · "))));

    D.sb.from("manifests").insert({ origin_city: origin || null, departure_at: dep ? dep.toISOString() : null, agency: m.agency || null, items: m.items || [],
      total_declared: m.total_declared, found: r.found.length, missing: r.missing.length, extra: r.extra.length, operator: D.operator() }).then(() => {});
  }
}
