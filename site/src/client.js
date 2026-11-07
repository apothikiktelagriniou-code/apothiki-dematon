// Συμπεριφορά σελίδων. Χρησιμοποιεί το global SITE (δεδομένα + δρομολόγια) και τις συναρτήσεις του calc.mjs.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v; else if (k === "text") el.textContent = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  const eur = n => (Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")) + " €";
  const B = SITE.BUSINESS;

  // Μενού κινητού
  const mb = $(".menu-btn"), nav = $(".nav");
  if (mb && nav) mb.addEventListener("click", () => { const o = nav.classList.toggle("open"); mb.setAttribute("aria-expanded", o); });

  // ---------- Πίνακας αναχωρήσεων (αρχική) ----------
  const board = $("[data-board]");
  if (board) {
    const picks = ["ΑΘΗΝΑ", "ΠΑΤΡΑ", "ΘΕΣΣΑΛΟΝΙΚΗ", "ΙΩΑΝΝΙΝΑ", "ΛΕΥΚΑΔΑ", "ΑΡΤΑ", "ΝΑΥΠΑΚΤΟΣ", "ΜΕΣΟΛΟΓΓΙ", "ΑΜΦΙΛΟΧΙΑ", "ΛΑΡΙΣΑ", "ΒΟΛΟΣ", "ΚΑΛΑΜΑΤΑ", "ΠΥΡΓΟΣ", "ΧΑΝΙΑ", "ΗΡΑΚΛΕΙΟ", "ΚΕΡΚΥΡΑ", "ΚΟΖΑΝΗ"];
    const pretty = k => { const d = SITE.DESTINATIONS.find(x => x.sched && x.sched[0] === k); return d ? d.name : k.charAt(0) + k.slice(1).toLowerCase(); };
    const draw = () => {
      const now = athensNow();
      const rows = [];
      for (const k of picks) { const [n] = nextDepartures(SITE.SCHEDULE, [k], now, 1); if (n) rows.push({ k, ...n }); }
      const order = r => (r.day === "Σήμερα" ? 0 : r.day === "Αύριο" ? 1 : 2) * 1440 + Number(r.time.slice(0, 2)) * 60 + Number(r.time.slice(3));
      rows.sort((a, b) => order(a) - order(b));
      const tb = $("tbody", board); tb.textContent = "";
      for (const r of rows.slice(0, 7)) tb.append(h("tr", {}, h("td", { class: "t" }, r.time), h("td", { class: "d" }, pretty(r.k)), h("td", { class: "x" }, r.day === "Σήμερα" ? (r.express ? "Express" : "") : r.day)));
      const t = new Intl.DateTimeFormat("el-GR", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
      $("time", board).textContent = t;
    };
    draw(); setInterval(draw, 30000);
  }

  // ---------- Υπολογιστής κόστους αποστολής ----------
  const calcEl = $("[data-calc]");
  if (calcEl) {
    const KINDS = [
      { id: "fakelos", name: "Φάκελος", sub: "έγγραφα, έως 1 kg", dims: true },
      { id: "box", name: "Κούτα / δέμα", sub: "βάλτε διαστάσεις και βάρος", dims: true },
      { id: "tenekes", name: "Τενεκές λαδιού", sub: "ελαιόλαδο" },
      { id: "tsouvali", name: "Τσουβάλι", sub: "έως 30 kg" },
      { id: "arni", name: "Αρνί", sub: "σφαγμένο, συσκευασμένο" },
    ];
    const groups = [["direct", "Απευθείας δρομολόγια"], ["local", "Εντός Νομού Αιτωλοακαρνανίας"], ["transfer", "Με ανταπόκριση"], ["ask", "Ρωτήστε μας"], ["none", "Δεν εξυπηρετούνται"]];
    const sel = h("select", { id: "c-dest", required: true }, h("option", { value: "" }, "Διαλέξτε προορισμό…"),
      groups.map(([t, label]) => h("optgroup", { label }, SITE.DESTINATIONS.filter(d => d.type === t).slice().sort((a, b) => a.name.localeCompare(b.name, "el")).map(d => h("option", { value: d.name }, d.name)))));
    const num = (id, label, ph, step = "1") => h("div", { class: "field" }, h("label", { for: id }, label), h("input", { id, type: "number", inputmode: "decimal", min: "0", step, placeholder: ph }));
    const form = h("form", { class: "form panel", novalidate: true },
      h("fieldset", {}, h("legend", { class: "legend" }, "1. Τι στέλνετε;"),
        h("div", { class: "choices", style: "margin-top:8px" }, KINDS.map((k, i) => h("label", { class: "choice" }, h("input", { type: "radio", name: "kind", value: k.id, checked: i === 1 }), h("span", {}, k.name, h("small", {}, k.sub)))))),
      h("div", { id: "c-dims-wrap", class: "field" }, h("span", { class: "legend" }, "2. Διαστάσεις (εκ.) και βάρος"),
        h("div", { class: "dims" }, num("c-l", "Μήκος", "40"), num("c-w", "Πλάτος", "30"), num("c-h", "Ύψος", "20"), num("c-kg", "Κιλά", "3", "0.1")),
        h("div", { class: "hint" }, "Μετρήστε την κούτα κλειστή, μαζί με τη συσκευασία. Αν δεν ξέρετε ακριβώς, γράψτε στρογγυλά νούμερα.")),
      h("label", { id: "c-syn-wrap", class: "check", hidden: true }, h("input", { type: "checkbox", id: "c-syn" }), h("span", {}, "Θα ταξιδέψω κι εγώ με το ίδιο λεωφορείο (συνοδευόμενος τενεκές)")),
      h("div", { class: "grid g2" },
        h("div", { class: "field" }, h("label", { for: "c-dest" }, "3. Προορισμός"), sel),
        h("div", { class: "field" }, h("label", { for: "c-n" }, "Τεμάχια"), h("input", { id: "c-n", type: "number", inputmode: "numeric", min: "1", max: "99", value: "1" }))),
      h("div", { class: "field" }, h("label", { for: "c-desc" }, "Περιγραφή (προαιρετικά)"), h("input", { id: "c-desc", type: "text", placeholder: "π.χ. ανταλλακτικά, ρούχα, έγγραφα", autocomplete: "off" }),
        h("div", { class: "hint" }, "Δεν αλλάζει την τιμή. Μας βοηθά να σας πούμε αν κάτι δεν μπορεί να ταξιδέψει.")));
    const out = h("div", { class: "result", "aria-live": "polite" });
    calcEl.append(h("div", { class: "calc" }, form, out));

    const val = id => $("#" + id).value;
    const render = () => {
      const kind = (form.querySelector("input[name=kind]:checked") || {}).value;
      const isBox = kind === "fakelos" || kind === "box";
      $("#c-dims-wrap").hidden = !isBox;
      $("#c-syn-wrap").hidden = kind !== "tenekes";
      out.textContent = "";
      const card = h("div", { class: "panel" }); out.append(card);
      const hit = prohibitedHit(SITE.PROHIBITED, val("c-desc"));
      const warnHit = hit ? h("div", { class: "notice warn" }, h("b", {}, "Ελέγξτε το περιεχόμενο"),
        "Εύφλεκτα, εκρηκτικά, αέρια, χημικά, όπλα, αιχμηρά και ζωντανά ζώα δεν μεταφέρονται. Αν δεν είστε σίγουροι, ρωτήστε μας πριν έρθετε.") : null;

      let catId = kind, classed = null;
      if (isBox) {
        const dims = [val("c-l"), val("c-w"), val("c-h")];
        const filled = dims.filter(Number).length;
        if (filled > 0 && filled < 3) { card.append(h("p", { class: "muted" }, "Συμπληρώστε και τις τρεις διαστάσεις.")); return; }
        classed = classifyBox(SITE.CATEGORIES, filled === 3 ? dims : [], val("c-kg"), kind === "fakelos" ? "fakelos" : "mikro");
        if (classed.oversize) {
          card.append(h("div", { class: "notice warn" }, h("b", {}, "Μεγάλο ή βαρύ δέμα"), "Ξεπερνά τα 80 × 60 × 60 εκ. ή τα 30 κιλά. Καλέστε μας για τιμή και για το αν χωράει στο λεωφορείο."), contactLine());
          if (warnHit) out.append(warnHit); return;
        }
        catId = classed.id;
      }
      if (kind === "tenekes" && $("#c-syn").checked) catId = "tenekes_syn";
      const dest = val("c-dest");
      const cat = SITE.CATEGORIES.find(c => c.id === catId);
      const catLine = h("dl", { class: "kv" }, h("dt", {}, "Κατηγορία"), h("dd", {}, cat ? cat.name : "—",
        classed && classed.by === "kg" ? h("span", { class: "muted", style: "font-weight:400" }, " (λόγω βάρους)") : null));
      if (!dest) { card.append(h("span", { class: "eyebrow" }, "Ενδεικτική τιμή"), h("p", { class: "muted", style: "margin-top:8px" }, "Διαλέξτε προορισμό για να δείτε τιμή και επόμενες αναχωρήσεις."), catLine); if (warnHit) out.append(warnHit); return; }

      const q = quote(SITE, { dest, catId, pieces: val("c-n"), kg: isBox ? val("c-kg") : 0 });
      if (q.status === "none") { card.append(h("div", { class: "notice bad" }, h("b", {}, `Δεν στέλνουμε σε ${dest}`), "Δεν υπάρχει δρομολόγιο ή ανταπόκριση προς τα εκεί από το Αγρίνιο."), contactLine()); return; }
      if (q.status === "ask" || q.status === "noprice") { card.append(h("div", { class: "notice info" }, h("b", {}, "Ρωτήστε μας για τιμή"), `Για ${dest}${q.status === "noprice" && cat ? " και " + cat.name.toLowerCase() : ""} η τιμή δίνεται στο ταμείο ή στο τηλέφωνο.`), contactLine()); if (warnHit) out.append(warnHit); return; }

      card.append(h("span", { class: "eyebrow" }, q.status === "transfer" ? "Ενδεικτικό κόστος ΚΤΕΛ Αιτωλοακαρνανίας" : "Ενδεικτική τιμή"),
        h("div", { class: "price", style: "margin-top:6px" }, h("span", { class: "big" }, eur(q.total)), h("span", { class: "per" }, q.pieces > 1 ? `${q.pieces} × ${eur(q.perPiece)}` : "ανά τεμάχιο, με ΦΠΑ")));
      if (q.status === "transfer") card.append(h("div", { class: "notice info" }, h("b", {}, `Και περίπου ${eur(q.otherEstimate)} σε φάκελο πάνω στο δέμα`),
        `Τα πληρώνει ο αποστολέας και τα παραλαμβάνει το πρακτορείο που συνεχίζει τη μεταφορά από ${q.hub.label}. Σύνολο περίπου ${eur(q.grandEstimate)}.`));
      const dl = h("dl", { class: "kv", style: "margin-top:12px" },
        h("dt", {}, "Κατηγορία"), h("dd", {}, cat.name, classed && classed.by === "kg" ? h("span", { class: "muted", style: "font-weight:400" }, " (λόγω βάρους)") : null),
        h("dt", {}, "Προορισμός"), h("dd", {}, q.dest.name),
        q.extra ? [h("dt", {}, "Επιβάρυνση βάρους"), h("dd", {}, `+${eur(q.extra)} ανά τεμάχιο`)] : null,
        q.hub ? [h("dt", {}, "Μέσω"), h("dd", {}, q.hub.label)] : null,
        h("dt", {}, "Παράδοση"), h("dd", {}, q.eta || ""));
      card.append(dl);
      const keys = q.hub ? q.hub.sched : q.dest.sched;
      if (keys) {
        const cut = B.cutoffMin || 0, now = athensNow();
        const deps = nextDepartures(SITE.SCHEDULE, keys, { ...now, minutes: now.minutes + cut }, 3);
        const before = t => { const m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) - cut; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
        if (deps.length) card.append(h("div", { style: "margin-top:14px" }, h("span", { class: "eyebrow" }, "Επόμενες αναχωρήσεις από Αγρίνιο"),
          h("div", { class: "deps", style: "margin-top:6px" }, deps.map(d => h("div", {}, h("span", { class: "num" }, d.time), h("span", {}, d.day), h("span", { class: "muted", style: "font-size:13px" }, `φέρτε το έως ${before(d.time)}`), d.express ? h("span", { class: "tag info" }, "Express") : null)))));
      }
      if (q.dest.note) card.append(h("p", { class: "muted", style: "margin-top:10px;font-size:14px" }, q.dest.note));
      card.append(h("p", { class: "muted", style: "margin-top:12px;font-size:13px" }, "Η τελική τιμή ορίζεται στο ταμείο, μετά από ζύγισμα και μέτρηση. Τιμές ΚΤΕΛ Αιτωλοακαρνανίας με ΦΠΑ."));
      if (warnHit) out.append(warnHit);
    };
    const contactLine = () => h("p", { style: "margin-top:12px" }, "Τηλέφωνο ", h("a", { href: "tel:+30" + B.phone, class: "num" }, B.phoneDisplay), " · WhatsApp ", h("a", { href: "https://wa.me/30" + B.mobile, class: "num" }, B.mobileDisplay));
    form.addEventListener("input", render); form.addEventListener("change", render);
    form.addEventListener("submit", e => e.preventDefault());
    const pre = new URLSearchParams(location.search).get("to");
    if (pre && findDest(SITE.DESTINATIONS, pre)) sel.value = findDest(SITE.DESTINATIONS, pre).name;
    render();
  }

  // ---------- Αναζήτηση δέματος ----------
  const tr = $("[data-track]");
  if (tr) {
    const URL_ = SITE.SUPABASE.url, KEY = SITE.SUPABASE.key;
    const out = $("[data-track-out]");
    const fmtDT = v => new Intl.DateTimeFormat("el-GR", { timeZone: "Europe/Athens", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(v));
    const ymd = v => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date(v));
    const show = (cls, title, ...lines) => { out.textContent = ""; out.append(h("div", { class: "notice " + cls }, h("b", {}, title), ...lines.map(l => h("div", {}, l)))); };
    const q = new URLSearchParams(location.search); if (q.get("r")) $("#t-rc").value = q.get("r");
    tr.addEventListener("submit", async e => {
      e.preventDefault();
      const rc = $("#t-rc").value, nm = $("#t-nm").value.trim();
      if (rc.replace(/\D/g, "").length < 10) return show("warn", "Ελέγξτε τον αριθμό απόδειξης", "Γράψτε όλο τον αριθμό της απόδειξης, π.χ. 228-336-12345. Στις χειρόγραφες αποδείξεις: τον κόκκινο αριθμό.");
      if (nm.replace(/\s/g, "").length < 3) return show("warn", "Γράψτε 3 γράμματα", "Τα 3 πρώτα γράμματα του επωνύμου του παραλήπτη.");
      const btn = $("button", tr); btn.disabled = true; show("info", "Αναζήτηση…");
      try {
        const r = await fetch(URL_ + "/rest/v1/rpc/track_parcel", { method: "POST", headers: { apikey: KEY, "content-type": "application/json" }, body: JSON.stringify({ p_receipt: rc, p_name: nm }) });
        if (r.status === 429 || r.status === 400) { const t = await r.text(); if (r.status === 429 || /too_many/.test(t)) return show("warn", "Πολλές αναζητήσεις", "Για την προστασία των δεδομένων, οι αναζητήσεις είναι περιορισμένες. Δοκιμάστε ξανά σε 15 λεπτά ή καλέστε μας."); throw new Error(t); }
        if (!r.ok) throw new Error(r.status);
        const [x] = await r.json();
        if (!x) return show("warn", "Δεν βρέθηκε ακόμα", "Αν το δέμα στάλθηκε σήμερα, μπορεί να μην έχει φτάσει ή να μην έχει καταχωρηθεί. Ελέγξτε τον αριθμό και τα γράμματα, ή καλέστε μας.");
        const pcs = x.pieces_total > 1 ? `Έχουν φτάσει ${x.pieces_in} από ${x.pieces_total} τεμάχια.` : null;
        if (x.state === "here") {
          const f = storageFee(SITE.STORAGE, ymd(x.at), ymd(new Date()));
          show("ok", "Το δέμα σας έφτασε", `Έφτασε ${fmtDT(x.at)}${x.origin ? ", από " + x.origin : ""}.`, pcs,
            f.fee > 0 ? `Χρέωση φύλαξης μέχρι σήμερα: ${eur(f.fee)} (δωρεάν φύλαξη έως ${f.freeUntil}).` : `Δωρεάν φύλαξη έως και ${f.freeUntil}. Φέρτε ταυτότητα.`);
        } else if (x.state === "done") show("info", "Παραδόθηκε", `Το δέμα παραλήφθηκε ${fmtDT(x.at)}.`);
        else if (x.state === "transit") show("info", "Σε μεταφόρτωση", `Πέρασε από το Αγρίνιο ${fmtDT(x.at)} και συνεχίζει προς ${x.dest || "τον προορισμό του"}.`, pcs);
        else if (x.state === "forwarded") show("info", "Στάλθηκε", `Έφυγε από το Αγρίνιο προς ${x.dest || "τον προορισμό του"}${x.at ? " " + fmtDT(x.at) : ""}.`);
        else if (x.state === "returned") show("warn", "Επεστράφη", "Το δέμα επιστράφηκε στον αποστολέα. Καλέστε μας για πληροφορίες.");
        else show("warn", "Καλέστε μας", "Δεν μπορούμε να δούμε την κατάσταση του δέματος από εδώ.");
      } catch { show("bad", "Η αναζήτηση δεν ολοκληρώθηκε", "Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά, ή καλέστε μας στο " + B.phoneDisplay + "."); }
      finally { btn.disabled = false; }
    });
  }

  // ---------- Παράδοση στο σπίτι ----------
  const home = $("[data-home]");
  if (home) {
    const H = SITE.HOME;
    const sel = $("#h-zone", home), outH = $("[data-home-out]", home);
    const draw = () => {
      outH.textContent = "";
      const z = H.zones.find(z => z.id === sel.value);
      if (!sel.value) return outH.append(h("p", { class: "muted" }, "Διαλέξτε περιοχή."));
      if (!z) return outH.append(h("div", { class: "notice warn" }, h("b", {}, "Δεν εξυπηρετείται ακόμα"), "Προς το παρόν μόνο εντός της πόλης του Αγρινίου."));
      outH.append(h("div", { class: "price" }, h("span", { class: "big" }, eur(z.price)), h("span", { class: "per" }, "ανά παράδοση ή παραλαβή")),
        h("p", { class: "muted", style: "margin-top:6px" }, `${H.hours} · ${H.vehicles}`));
    };
    sel.addEventListener("change", draw); draw();
  }

  // ---------- Φόρμες μηνυμάτων (WhatsApp / email, χωρίς αποθήκευση σε server) ----------
  for (const f of $$("form[data-msgform]")) {
    const out = $("[data-msg-out]", f.parentElement);
    f.addEventListener("submit", e => {
      e.preventDefault();
      if (!f.reportValidity()) return;
      const lines = [f.dataset.msgform];
      for (const el of $$("input, select, textarea", f)) {
        if (el.type === "checkbox") { if (el.dataset.label) lines.push(`${el.dataset.label}: ${el.checked ? "ΝΑΙ" : "ΟΧΙ"}`); continue; }
        if (el.value.trim()) lines.push(`${el.dataset.label || el.name}: ${el.value.trim()}`);
      }
      const text = lines.join("\n");
      out.textContent = "";
      const pre = h("pre", { class: "panel", style: "white-space:pre-wrap;font:15px/1.5 var(--f-body);margin:0" }, text);
      const copy = h("button", { type: "button", class: "btn btn-ghost" }, "Αντιγραφή κειμένου");
      copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(text); copy.textContent = "Αντιγράφηκε"; } catch { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copy.textContent = "Επιλέχθηκε — πατήστε Αντιγραφή"; } });
      out.append(h("div", { class: "notice info" }, h("b", {}, "Το μήνυμά σας είναι έτοιμο"), "Στείλτε το με WhatsApp ή email. Δεν αποθηκεύεται πουθενά στην ιστοσελίδα."), pre,
        h("div", { style: "display:flex;flex-wrap:wrap;gap:10px" },
          h("a", { class: "btn btn-primary", href: "https://wa.me/30" + B.mobile + "?text=" + encodeURIComponent(text), target: "_blank", rel: "noopener" }, "Αποστολή με WhatsApp"),
          h("a", { class: "btn btn-ghost", href: "mailto:" + B.email + "?subject=" + encodeURIComponent(f.dataset.msgform) + "&body=" + encodeURIComponent(text) }, "Αποστολή με email"), copy));
      out.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
})();
