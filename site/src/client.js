// Συμπεριφορά σελίδων (ελληνικά + αγγλικά). Χρησιμοποιεί το global SITE και τις συναρτήσεις του calc.mjs.
(() => {
  const LANG = document.documentElement.lang === "en" ? "en" : "el";
  const T = (el, en) => (LANG === "en" ? en : el);           // κείμενο διεπαφής
  const L = s => (LANG === "en" && s != null ? (SITE.EN[s] ?? s) : s); // κείμενο από τα δεδομένα
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
  const eur = n => { const v = Number.isInteger(n) ? String(n) : (LANG === "en" ? n.toFixed(2) : n.toFixed(2).replace(".", ",")); return LANG === "en" ? "€" + v : v + " €"; };
  const B = SITE.BUSINESS;
  const mqRM = matchMedia("(prefers-reduced-motion: reduce)"); let REDUCED = mqRM.matches; try { mqRM.addEventListener("change", e => { REDUCED = e.matches; }); } catch {}
  const LOCALE = T("el-GR", "en-GB");
  const SMOOTH = REDUCED ? "auto" : "smooth";
  const CALC = LANG === "en" ? "send" : "apostoli";
  const telA = (n, txt) => h("a", { class: "num", href: "tel:+30" + String(n).replace(/\D/g, "") }, txt || n);
  const contactNodes = () => [T("Καλέστε μας στο ", "Call us on "), telA(B.phone, B.phoneDisplay), T(" ή γράψτε μας στο ", " or message us on "), h("a", { href: "https://wa.me/30" + B.mobile }, "WhatsApp"), "."];

  // «larisa», «thessaloniki», «patra»: τα λατινικά γράμματα γίνονται ελληνικά πριν από τη σύγκριση.
  const G2 = [["ef", "ευ"], ["ev", "ευ"], ["af", "αυ"], ["av", "αυ"], ["ng", "γγ"], ["th", "θ"], ["ch", "χ"], ["ps", "ψ"], ["ks", "ξ"], ["ou", "ου"], ["mp", "μπ"], ["nt", "ντ"], ["gk", "γκ"]];
  const G1 = { a: "α", b: "β", v: "β", g: "γ", d: "δ", e: "ε", z: "ζ", h: "η", i: "ι", y: "υ", k: "κ", c: "κ", q: "κ", l: "λ", m: "μ", n: "ν", x: "ξ", o: "ο", p: "π", r: "ρ", s: "σ", t: "τ", u: "ου", f: "φ", w: "ω", j: "τζ" };
  const toGreek = s => { s = s.toLowerCase(); for (const [a, b] of G2) s = s.split(a).join(b); return s.replace(/[a-z]/g, c => G1[c] || c); };
  // απλοποίηση για σύγκριση: ι/η/υ/ει/οι → ι, ο/ω → ο, ε/αι → ε
  // τοπικές ονομασίες πόλεων → η επίσημη (μετά την απλοποίηση): «Γιάννενα/Γιάννινα» = Ιωάννινα
  const SYN = [[/γιαν[ιε]να/g, "ιοανινα"]];
  const loose = s => SYN.reduce((x, [r, v]) => x.replace(r, v), norm(s).replace(/ει|οι|υι/g, "ι").replace(/[ηυ]/g, "ι").replace(/ω/g, "ο").replace(/αι/g, "ε").replace(/(.)\1/g, "$1"));

  // Χάρτης διαδρομών: φωτίζει τη διαδρομή της πόλης που δείχνει/εστιάζει ο επισκέπτης
  for (const svg of document.querySelectorAll(".routes-svg")) {
    const on = r => { svg.classList.toggle("hl", r != null); const set = r ? r.split(" ") : []; svg.querySelectorAll(".rt").forEach(p => p.classList.toggle("on", set.includes(p.dataset.r))); };
    svg.querySelectorAll("a[data-r]").forEach(a => {
      a.addEventListener("pointerenter", () => on(a.dataset.r)); a.addEventListener("pointerleave", () => on(null));
      a.addEventListener("focus", () => on(a.dataset.r)); a.addEventListener("blur", () => on(null));
    });
  }

  // Εναλλαγή γλώσσας: κρατά τον προορισμό του υπολογιστή και το σημείο της σελίδας
  const ls = $(".lang-switch");
  if (ls) ls.addEventListener("click", () => { try { const u = new URL(ls.href, location.href), d = $("#c-dest");
    if (d && d.value) u.searchParams.set("to", d.value); else if (location.search && !/[?&](r|n)=/.test(location.search)) u.search = location.search;
    const sec = [...document.querySelectorAll("main section[id], main [id].section, main h2[id]")].find(el => el.getBoundingClientRect().bottom > 80);
    u.hash = location.hash || (sec ? "#" + sec.id : ""); ls.href = u.href; } catch {} });

  // Μέτρηση κλικ: μόνο «πόσα» ανά μέρα, σελίδα και σημείο. Χωρίς cookies, χωρίς IP, χωρίς στοιχεία επισκέπτη.
  const PAGE = (location.pathname.replace(/^\/+|\.html$/g, "") || "index").replace(/\/$/, "/index").toLowerCase();
  const TEST = /^(localhost|127\.|\[?::1)/.test(location.hostname) ? null : /^dokimi\./.test(location.hostname) ? "dokimi/" : "";
  const SPOTS = [["[data-spot]", el => el.dataset.spot], [".quickbar", "quickbar"], [".ask-panel", "ask"], [".price-board, .next-step, [data-calc]", "calc"], [".hero, .page-head, .oil-head", "hero"],
    [".board", "board"], [".cta-band", "cta"], ["[data-track]", "track"], [".dest-hero, .dest-page", "dest"], ["footer", "footer"], ["main", "page"]];
  const spotOf = el => { for (const [sel, v] of SPOTS) { const c = el.closest(sel); if (c) return typeof v === "function" ? v(c) : v; } return ""; };
  const ping = (e, spot = "") => {
    if (TEST === null || !SITE.SUPABASE || !SITE.SUPABASE.url) return;
    try { fetch(SITE.SUPABASE.url + "/rest/v1/rpc/track_click", { method: "POST", keepalive: true, headers: { apikey: SITE.SUPABASE.key, "content-type": "application/json" },
      body: JSON.stringify({ p_e: e, p_p: (TEST + PAGE).slice(0, 60), p_s: String(spot).slice(0, 30) }) }).catch(() => {}); } catch {}
  };
  document.addEventListener("click", ev => {
    const a = ev.target.closest && ev.target.closest("a[href]"); if (!a) return;
    const u = a.getAttribute("href");
    const e = /^tel:/.test(u) ? "call" : /wa\.me|whatsapp/.test(u) ? "whatsapp" : /^viber:/.test(u) ? "viber" : /^mailto:/.test(u) ? "email"
      : /google\.[a-z.]+\/maps|maps\.app\.goo|maps\.google/.test(u) ? "directions" : null;
    if (e) ping(e, spotOf(a));
  }, { capture: true });

  // Μενού κινητού: κλείνει με Esc και όταν πατηθεί σύνδεσμος
  const mb = $(".menu-btn"), nav = $(".nav");
  if (mb && nav) {
    const setOpen = o => { nav.classList.toggle("open", o); mb.setAttribute("aria-expanded", o); };
    mb.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
    nav.addEventListener("click", e => { if (e.target.closest("a")) setOpen(false); });
    addEventListener("keydown", e => { if (e.key === "Escape" && nav.classList.contains("open")) { setOpen(false); mb.focus(); } });
  }

  // «Ανοιχτά τώρα» (αρχική)
  const openEl = $("[data-open-now]");
  if (openEl) {
    const DOWS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const mins = x => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
    const upd = () => {
      const n = athensNow(), hrs = d => (B.hours || []).find(x => x.schema && x.schema.d.includes(DOWS[d]));
      const closedDay = d => (B.closedDates || []).includes(d);
      const today = hrs(n.dow), isOpen = today && !closedDay(n.ymd) && n.minutes >= mins(today.schema.o) && n.minutes < mins(today.schema.c);
      if (isOpen) { openEl.textContent = T(`Ανοιχτά τώρα, έως ${today.schema.c}`, `Open now, until ${today.schema.c}`); openEl.classList.remove("closed"); }
      else {
        // πότε ανοίγει: σήμερα (αν δεν έχει ανοίξει ακόμα) ή η επόμενη μέρα που ΔΕΝ είναι αργία
        let k = 0, next = null;
        if (today && !closedDay(n.ymd) && n.minutes < mins(today.schema.o)) next = today;
        else for (k = 1; k <= 7; k++) { const hk = hrs((n.dow + k) % 7); if (hk && !closedDay(addDays(n.ymd, k))) { next = hk; break; } }
        const DEL = ["τη Δευτέρα", "την Τρίτη", "την Τετάρτη", "την Πέμπτη", "την Παρασκευή", "το Σάββατο", "την Κυριακή"];
        const wEl = !next || k === 0 ? "" : k === 1 ? "αύριο " : DEL[(n.dow + k) % 7] + " ", wEn = !next || k === 0 ? "" : k === 1 ? "tomorrow " : "on " + DOWS[(n.dow + k) % 7] + " ";
        openEl.textContent = T(`Κλειστά τώρα · ανοίγει ${wEl}${next ? next.schema.o : ""}`, `Closed now · opens ${wEn}${next ? next.schema.o : ""}`); openEl.classList.add("closed"); }
      openEl.hidden = false;
    };
    upd(); setInterval(upd, 60000);
  }

  // ---------- Δρομολόγια με δέματα (ζωντανά, από τη διαχείριση) ----------
  // Η λίστα ορίζεται στη σελίδα διαχείρισης (site_schedule)· αν δεν απαντήσει, μένει η λίστα της ιστοσελίδας.
  const live = new Set();
  const onSchedule = fn => { live.add(fn); };
  // Μόνο όπου τα δρομολόγια φαίνονται αμέσως (πίνακας, «ταξίδι», υπολογιστής, μετρητές)· αλλού, όταν ανοίξει το «Ρώτα μας».
  let liveAsked = false;
  const loadLive = () => { if (liveAsked) return; liveAsked = true; (async () => {
    try {
      const ctl = new AbortController(); setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(SITE.SUPABASE.url + "/rest/v1/rpc/site_departures", { method: "POST", headers: { apikey: SITE.SUPABASE.key, "content-type": "application/json" }, body: "{}", signal: ctl.signal });
      if (!r.ok) return;
      const rows = await r.json();
      const good = Array.isArray(rows) ? rows.filter(x => x && x.dest && /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time) && /^[01]{7}$/.test(x.days)) : [];
      if (good.length < 5) return;
      SITE.SCHEDULE = good.map(x => ({ dest: x.dest, time: x.time, days: x.days, express: !!x.express, conn: !!x.conn, notes: x.notes }));
      for (const el of $$("[data-daily]")) el.textContent = Math.max(...[0, 1, 2, 3, 4, 5, 6].map(i => SITE.SCHEDULE.filter(x => x.dest === el.dataset.daily && x.days[i] === "1").length));
      for (const fn of live) fn();
    } catch {}
  })(); };
  if ($("[data-board], [data-journey], [data-calc], [data-daily], [data-admin]")) loadLive();

  // ---------- Πίνακας αναχωρήσεων (αρχική) ----------
  const board = $("[data-board]");
  let boardDrawn = false, boardAt = 0;
  if (board) {
    const picks = ["ΑΘΗΝΑ", "ΠΑΤΡΑ", "ΘΕΣΣΑΛΟΝΙΚΗ", "ΙΩΑΝΝΙΝΑ", "ΛΕΥΚΑΔΑ", "ΑΡΤΑ", "ΝΑΥΠΑΚΤΟΣ", "ΜΕΣΟΛΟΓΓΙ", "ΑΜΦΙΛΟΧΙΑ", "ΛΑΡΙΣΑ", "ΒΟΛΟΣ", "ΚΑΛΑΜΑΤΑ", "ΠΥΡΓΟΣ", "ΧΑΝΙΑ", "ΗΡΑΚΛΕΙΟ", "ΚΕΡΚΥΡΑ", "ΚΟΖΑΝΗ"];
    const pretty = k => { const d = SITE.DESTINATIONS.find(x => x.sched && x.sched[0] === k); return d ? L(d.name) : k; };
    const draw = () => {
      const now = athensNow();
      const rows = [];
      // Μόνο λεωφορεία που προλαβαίνει ακόμα ένα δέμα (ίδιος κανόνας με τον υπολογιστή και το «ταξίδι»).
      for (const k of picks) { const n = nextDepartures(SITE.SCHEDULE, [k], now, 30, LANG).map(d => ({ ...d, drop: dropOff(B, d.dow, d.time) })).find(d => d.rel * 1440 + d.drop.min > now.minutes && !d.drop.early && openFor(B, now.ymd, d)); if (n) rows.push({ k, ...n }); }
      // λίγες γραμμές (π.χ. αλλαγές στη διαχείριση): συμπληρώνουμε από τους υπόλοιπους προορισμούς
      if (rows.length < 4) for (const k of [...new Set(SITE.SCHEDULE.map(x => x.dest))].filter(k => !picks.includes(k))) { if (rows.length >= 7) break; const n = nextDepartures(SITE.SCHEDULE, [k], now, 30, LANG).map(d => ({ ...d, drop: dropOff(B, d.dow, d.time) })).find(d => d.rel * 1440 + d.drop.min > now.minutes && !d.drop.early && openFor(B, now.ymd, d)); if (n) rows.push({ k, ...n }); }
      const order = r => Math.min(r.rel, 2) * 1440 + Number(r.time.slice(0, 2)) * 60 + Number(r.time.slice(3));
      rows.sort((a, b) => order(a) - order(b));
      const tb = $("tbody", board);
      // Γραμμές που άλλαξαν (ή όλες, την πρώτη φορά) «γυρίζουν» σαν πινακίδα σταθμού· η ώρα «τρέχει» πριν σταθεροποιηθεί.
      // Συγκρίνουμε ανά προορισμό: «γυρίζει» μόνο η γραμμή που άλλαξε (όχι όλες, όταν έρθουν τα ζωντανά δεδομένα).
      const prev = new Map([...tb.rows].map(tr => [tr.dataset.k, tr.textContent]));
      const quiet = boardDrawn && performance.now() - boardAt < 1500;
      const clock = () => { $("time", board).textContent = new Intl.DateTimeFormat(LOCALE, { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()); };
      const sig = rows.slice(0, 7).map(r => r.k + r.time + r.rel).join("|");
      if (boardDrawn && sig === tb.dataset.sig) return clock();   // τίποτα δεν άλλαξε: μόνο η ώρα (κρατά εστίαση/hover)
      tb.dataset.sig = sig;
      tb.textContent = ""; let fi = 0;
      const digit = (c, i) => String(Math.floor(Math.random() * (i === 0 ? 2 : i === 1 ? 10 : i === 3 ? 6 : 10)));
      rows.slice(0, 7).forEach(r => {
        const dest = SITE.DESTINATIONS.find(x => x.sched && x.sched[0] === r.k);
        const tr = h("tr", { "data-k": r.k }, h("td", { class: "t" }, r.time), h("td", { class: "d" }, dest ? h("a", { href: `${CALC}?to=${encodeURIComponent(dest.name)}#ypologismos` }, L(dest.name)) : pretty(r.k)), h("td", { class: "x" }, r.rel === 0 ? (r.express ? "Express" : "") : r.day));
        tb.append(tr);
        if (!REDUCED && !quiet && (!boardDrawn || prev.get(r.k) !== tr.textContent)) {
          const k = fi++; tr.style.setProperty("--fi", k); tr.classList.add("flip");
          const t = tr.cells[0], fin = r.time, end = performance.now() + 380 + k * 70;
          const tick = () => { if (performance.now() >= end) { t.textContent = fin; return; } t.textContent = fin.replace(/\d/g, digit); setTimeout(tick, 50); };
          tick(); tr.addEventListener("animationend", () => tr.classList.remove("flip"), { once: true });
        }
      });
      // «🚌 Επόμενο» στην κορυφή (κινητό): η πρώτη γραμμή του πίνακα, με «αύριο»/μέρα όταν δεν είναι σήμερα
      const nb = $("[data-nextbus]");
      if (nb && rows[0]) { const r = rows[0], dest = SITE.DESTINATIONS.find(x => x.sched && x.sched[0] === r.k);
        $(".nb-t", nb).textContent = r.time; $(".nb-d", nb).textContent = dest ? L(dest.name) : pretty(r.k);
        $(".nb-w", nb).textContent = r.rel === 0 ? (r.express ? "Express" : "") : r.rel === 1 ? T("αύριο", "tomorrow") : r.day || ""; }
      if (!boardDrawn) boardAt = performance.now();
      boardDrawn = true;
      $("time", board).textContent = new Intl.DateTimeFormat(LOCALE, { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    };
    draw(); setInterval(draw, 30000); onSchedule(draw);
  }

  // ---------- Υπολογιστής κόστους αποστολής ----------
  const calcEl = $("[data-calc]");
  if (calcEl) {
    const OW = SITE.OVERWEIGHT;
    const owHint = OW && OW.enabled ? T(`Πάνω από ${OW.fromKg} κιλά υπάρχει επιβάρυνση ανά κιλό, ανάλογα με τον προορισμό.`, `Over ${OW.fromKg} kg there is a per-kg surcharge that depends on the destination.`) : "";
    const KINDS = [
      { id: "fakelos", name: T("Φάκελος", "Envelope"), sub: T("Έγγραφα, έως 1 kg", "Documents, up to 1 kg") },
      { id: "box", name: T("Κούτα / δέμα", "Box / parcel"), sub: T("Βάλτε διαστάσεις και βάρος", "Enter size and weight") },
      { id: "tenekes", name: T("Τενεκές λαδιού", "Olive oil tin"), sub: T("Ελαιόλαδο", "Olive oil") },
      { id: "tsouvali", name: T("Τσουβάλι", "Sack"), sub: T("Έως 30 kg", "Up to 30 kg") },
      { id: "arni", name: T("Αρνί", "Lamb"), sub: T("Σφαγμένο, συσκευασμένο", "Slaughtered, packed") },
    ];
    const groups = [["direct", T("Απευθείας δρομολόγια", "Direct buses")], ["local", T("Εντός νομού Αιτωλοακαρνανίας", "Within Aetolia-Acarnania")], ["transfer", T("Με ανταπόκριση", "With connection")], ["ask", T("Ρωτήστε μας", "Ask us")], ["none", T("Δεν εξυπηρετούνται", "Not served")]];
    const sel = h("select", { id: "c-dest", required: true }, h("option", { value: "" }, T("Διαλέξτε προορισμό…", "Choose destination…")),
      groups.map(([t, label]) => { const list = SITE.DESTINATIONS.filter(d => d.type === t); return list.length ? h("optgroup", { label }, list.slice().sort((a, b) => L(a.name).localeCompare(L(b.name), LANG)).map(d => h("option", { value: d.name }, L(d.name)))) : null; }));
    const num = (id, label, ph, step = "1") => h("div", { class: "field" }, h("label", { for: id }, label), h("input", { id, type: "text", inputmode: "decimal", autocomplete: "off", pattern: "[0-9]*[.,]?[0-9]*", placeholder: T("π.χ. ", "e.g. ") + ph }));
    const form = h("form", { class: "form panel", novalidate: true },
      h("div", { class: "grid g2" },
        h("div", { class: "field" }, h("label", { for: "c-dest" }, T("1. Πού το στέλνετε;", "1. Where to?")), sel, h("p", { class: "hint" }, T("Δεν βρίσκετε τον προορισμό σας; ", "Can't find your destination? "), telA(B.phone, B.phoneDisplay), T(" — θα βρούμε τρόπο να σας εξυπηρετήσουμε.", " — we will find a way to help."))),
        h("div", { class: "field" }, h("label", { for: "c-n" }, T("Τεμάχια", "Items")), h("input", { id: "c-n", type: "number", inputmode: "numeric", min: "1", max: "99", value: "1" }))),
      h("fieldset", {}, h("legend", { class: "legend" }, T("2. Τι στέλνετε;", "2. What are you sending?")),
        h("div", { class: "choices", style: "margin-top:8px" }, KINDS.map((k, i) => h("label", { class: "choice" }, h("input", { type: "radio", name: "kind", value: k.id, checked: i === 1 }), h("span", {}, k.name, h("small", {}, k.sub)))))),
      h("div", { id: "c-dims-wrap", class: "field" }, h("span", { class: "legend" }, T("3. Διαστάσεις (εκ.) και βάρος", "3. Size (cm) and weight")),
        h("div", { class: "dims" }, num("c-l", T("Μήκος", "Length"), "40"), num("c-w", T("Πλάτος", "Width"), "30"), num("c-h", T("Ύψος", "Height"), "20"), num("c-kg", T("Κιλά", "Kg"), "3", "0.1")),
        h("div", { class: "hint" }, T("Μετρήστε την κούτα κλειστή, μαζί με τη συσκευασία.", "Measure the closed box, including packaging."), owHint ? " " + owHint : "")),
      h("div", { id: "c-skg-wrap", class: "field", hidden: true }, h("label", { for: "c-skg" }, T("3. Βάρος τσουβαλιού (κιλά)", "3. Sack weight (kg)")),
        h("input", { id: "c-skg", type: "text", inputmode: "decimal", autocomplete: "off", pattern: "[0-9]*[.,]?[0-9]*", placeholder: T("π.χ. 20", "e.g. 20") }), owHint ? h("div", { class: "hint" }, owHint) : null),
      h("label", { id: "c-syn-wrap", class: "check", hidden: true }, h("input", { type: "checkbox", id: "c-syn" }), h("span", {}, T("Θα ταξιδέψω κι εγώ με το ίδιο λεωφορείο (συνοδευόμενος τενεκές)", "I'm travelling on the same bus (accompanied tin)"))),
      h("div", { class: "field" }, h("label", { for: "c-desc" }, T("Περιγραφή (προαιρετικά)", "Contents (optional)")), h("input", { id: "c-desc", type: "text", placeholder: T("Π.χ. ανταλλακτικά, ρούχα, έγγραφα", "E.g. spare parts, clothes, documents"), autocomplete: "off" }),
        h("div", { class: "hint" }, T("Δεν αλλάζει την τιμή. Μας βοηθά να σας πούμε αν κάτι δεν μπορεί να ταξιδέψει.", "Does not change the price. It helps us tell you if something cannot travel."))));
    const out = h("div", { class: "result" });
    // Για αναγνώστες οθόνης: μία σύντομη πρόταση, όχι όλο το αποτέλεσμα σε κάθε πλήκτρο.
    const say = h("p", { class: "sr-only", "aria-live": "polite" });
    calcEl.append(h("div", { class: "calc" }, form, out), say);
    let sayT = 0, lastTotal = null, howOpen = true;
    const announce = txt => { clearTimeout(sayT); sayT = setTimeout(() => { say.textContent = txt; }, 700); };

    const val = id => $("#" + id).value;
    const NUMS = new Set(["c-l", "c-w", "c-h", "c-kg", "c-skg", "c-n"]);
    const nv = id => { const v = $("#" + id).value.trim().replace(",", "."); return NUMS.has(id) && !(Number(v) > 0) ? "" : v; };
    const contactLine = () => h("p", { style: "margin-top:12px" }, T("Τηλέφωνο ", "Phone "), h("a", { href: "tel:+30" + B.phone, class: "num" }, B.phoneDisplay), " · WhatsApp ", h("a", { href: "https://wa.me/30" + B.mobile, class: "num" }, B.mobileDisplay));
    const nextStep = (msg = "") => h("div", { class: "next-step" },
      h("a", { class: "btn btn-primary", href: "tel:+30" + B.phone }, T("Κλήση ", "Call ") + B.phoneDisplay),
      h("a", { class: "btn btn-wa", href: "https://wa.me/30" + B.mobile + (msg ? "?text=" + encodeURIComponent(msg) : "") }, "WhatsApp"),
      h("a", { class: "btn btn-ghost", href: B.mapsUrl, rel: "noopener" }, T("Οδηγίες για την αποθήκη", "Directions to the depot")));
    const render = () => {
      const kind = (form.querySelector("input[name=kind]:checked") || {}).value;
      const isBox = kind === "fakelos" || kind === "box";
      $("#c-dims-wrap").hidden = !isBox;
      $("#c-skg-wrap").hidden = kind !== "tsouvali";
      $("#c-syn-wrap").hidden = kind !== "tenekes";
      out.textContent = "";
      const card = h("div", { class: "panel" }); out.append(card);
      const hit = prohibitedHit(SITE.PROHIBITED, val("c-desc"));
      const warnHit = hit ? h("div", { class: "notice warn" }, h("b", {}, T("Ελέγξτε το περιεχόμενο", "Check the contents")),
        T("Εύφλεκτα, εκρηκτικά, αέρια, χημικά, όπλα, αιχμηρά και ζωντανά ζώα δεν μεταφέρονται. Αν δεν είστε σίγουροι, ρωτήστε μας πριν έρθετε.", "Flammables, explosives, gas, chemicals, weapons, sharp objects and live animals are not carried. If unsure, ask us before you come.")) : null;
      const oversize = () => { announce(T("Μεγάλο ή βαρύ δέμα: καλέστε μας για τιμή.", "Large or heavy item: call us for a price.")); card.append(h("div", { class: "notice warn" }, h("b", {}, T("Μεγάλο ή βαρύ δέμα", "Large or heavy item")), T("Ξεπερνά τα 80 × 60 × 60 εκ. ή τα 30 κιλά. Καλέστε μας για τιμή και για το αν χωράει στο λεωφορείο.", "It exceeds 80 × 60 × 60 cm or 30 kg. Call us for a price and to check it fits on the bus.")), contactLine()); if (warnHit) out.append(warnHit); };

      let catId = kind, classed = null, kg = 0, noDims = false;
      if (isBox) {
        const dims = [nv("c-l"), nv("c-w"), nv("c-h")];
        const filled = dims.filter(Number).length;
        if (filled > 0 && filled < 3) { card.append(h("p", { class: "muted" }, T("Συμπληρώστε και τις τρεις διαστάσεις.", "Fill in all three dimensions."))); announce(T("Συμπληρώστε και τις τρεις διαστάσεις.", "Fill in all three dimensions.")); return; }
        classed = classifyBox(SITE.CATEGORIES, filled === 3 ? dims : [], nv("c-kg"), kind === "fakelos" ? "fakelos" : "mikro", SITE.SIZE_RULE.weightBumpsCategory);
        if (classed.oversize) return oversize();
        catId = classed.id; kg = nv("c-kg");
        noDims = kind === "box" && filled === 0 && !kg;
      }
      if (kind === "tsouvali") { kg = nv("c-skg"); if (Number(kg) > 30) return oversize(); }
      if (kind === "tenekes" && $("#c-syn").checked) catId = "tenekes_syn";
      const dest = val("c-dest");
      const cat = SITE.CATEGORIES.find(c => c.id === catId);
      const byKg = classed && classed.by === "kg" ? h("span", { class: "muted", style: "font-weight:400" }, T(" (λόγω βάρους)", " (by weight)")) : null;
      if (!dest) { card.append(h("div", { class: "price-board" }, h("span", { class: "eyebrow" }, T("Ενδεικτική τιμή", "Estimated price")), h("div", { class: "price", style: "margin-top:6px" }, h("span", { class: "big" }, "— €")), h("p", { class: "deadline" }, T("Διαλέξτε πού το στέλνετε", "Choose where it goes"), h("small", {}, T("Θα δείτε τιμή, πότε να το φέρετε και πού το παραλαμβάνουν.", "You will see the price, when to bring it and where it is collected."))))); lastTotal = null; if (warnHit) out.append(warnHit); return; }

      const dn = L(dest);
      if (Number(nv("c-n")) > 99) { card.append(h("p", { class: "muted" }, T("Για πάνω από 99 τεμάχια, καλέστε μας για τιμή.", "For more than 99 items, call us for a price.")), contactLine()); announce(T("Για πάνω από 99 τεμάχια, καλέστε μας.", "For more than 99 items, call us.")); return; }
      const q = quote(SITE, { dest, catId, pieces: nv("c-n") || 1, kg });
      if (q.status === "none") { card.append(h("div", { class: "notice bad" }, h("b", {}, T(`${dn}: δεν στέλνουμε εκεί`, `We do not ship to ${dn}`)), T("Δεν υπάρχει δρομολόγιο ή ανταπόκριση προς τα εκεί από το Αγρίνιο.", "There is no bus or connection there from Agrinio.")), contactLine()); return; }
      if (q.status === "ask" || q.status === "noprice") { card.append(h("div", { class: "notice info" }, h("b", {}, T("Ρωτήστε μας για τιμή", "Ask us for a price")), T(`${dn}: η τιμή δίνεται στο ταμείο ή στο τηλέφωνο.`, `For ${dn} we give the price at the counter or by phone.`)), contactLine()); if (warnHit) out.append(warnHit); return; }

      const keys = q.dest.sched && q.dest.sched.length ? q.dest.sched : q.hub ? q.hub.sched : null;
      const now = athensNow();
      // Κρατάμε μόνο λεωφορεία που προλαβαίνει ακόμα ο πελάτης (μαζί με όσα θέλουν το δέμα από το προηγούμενο βράδυ).
      const deps = keys ? nextDepartures(SITE.SCHEDULE, keys, now, 30, LANG).map(d => ({ ...d, drop: dropOff(B, d.dow, d.time) }))
        .filter(d => d.rel * 1440 + d.drop.min > now.minutes && !d.drop.early && openFor(B, now.ymd, d)).slice(0, 3) : [];
      const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
      const dayTxt = d => d.rel < 2 ? d.day.toLowerCase() : T("την ", "on ") + d.day;
      const d0 = deps[0];
      const deadline = !d0 ? null : d0.drop.same ? T(`Φέρτε το ${dayTxt(d0)} έως τις ${d0.drop.by}`, `Bring it ${dayTxt(d0)} by ${d0.drop.by}`)
        : d0.rel === 1 ? T(`Φέρτε το σήμερα το βράδυ, έως τις ${d0.drop.by}`, `Bring it this evening, by ${d0.drop.by}`) : T(`Φέρτε το από το προηγούμενο βράδυ, έως τις ${d0.drop.by}`, `Bring it the evening before, by ${d0.drop.by}`);
      const big = h("span", { class: "big" }, (noDims ? T("από ", "from ") : "") + eur(q.total));
      card.append(h("div", { class: "price-board" },
        h("span", { class: "eyebrow" }, q.status === "transfer" ? T("Ενδεικτικό κόστος ΚΤΕΛ Αιτωλοακαρνανίας", "Estimated KTEL Aetolia-Acarnania cost") : T("Ενδεικτική τιμή", "Estimated price")),
        h("div", { class: "price", style: "margin-top:6px" }, big, h("span", { class: "per" }, q.pieces > 1 ? `${q.pieces} × ${eur(q.perPiece)}` : T("ανά τεμάχιο, με ΦΠΑ", "per item, VAT included"))),
        noDims ? h("p", { class: "deadline" }, T("Για μικρό κουτί", "For a small box"), h("small", {}, T("Βάλτε διαστάσεις και βάρος για ακριβέστερη τιμή.", "Enter size and weight for a closer price."))) : null,
        deadline ? h("p", { class: "deadline" }, deadline, h("small", {}, T(`Για το λεωφορείο των ${d0.time}, στο ταμείο της αποθήκης.`, `For the ${d0.time} bus, at the depot counter.`))) : null));
      card.append(nextStep(T(`Γεια σας, θέλω να στείλω δέμα. Προορισμός: ${dn}. Ο υπολογιστής δείχνει ${noDims ? "από " : ""}${eur(q.total)}.`, `Hello, I'd like to send a parcel to ${dn}. The calculator shows ${noDims ? "from " : ""}${eur(q.total)}.`)));
      if (lastTotal !== null && lastTotal !== q.total && !REDUCED) big.classList.add("bump");
      lastTotal = q.total;
      announce(T(`Ενδεικτική τιμή ${noDims ? "από " : ""}${eur(q.total)} για ${dn}.${deadline ? " " + deadline + "." : ""}`, `Estimated price ${noDims ? "from " : ""}${eur(q.total)} to ${dn}.${deadline ? " " + deadline + "." : ""}`));
      if (q.status === "transfer") card.append(h("div", { class: "notice info" }, h("b", {}, T(`Και περίπου ${eur(q.otherEstimate)} σε φάκελο πάνω στο δέμα`, `Plus about ${eur(q.otherEstimate)} in an envelope on the parcel`)),
        T(`Τα πληρώνει ο αποστολέας και τα παραλαμβάνει το πρακτορείο που συνεχίζει τη μεταφορά από ${L(q.hub.label)}. Σύνολο περίπου ${eur(q.grandEstimate)}.`, `Paid by the sender and collected by the agency that carries it on from ${L(q.hub.label)}. About ${eur(q.grandEstimate)} in total.`)));
      card.append(h("dl", { class: "kv", style: "margin-top:12px" },
        h("dt", {}, T("Κατηγορία", "Category")), h("dd", {}, L(cat.name), byKg),
        h("dt", {}, T("Προορισμός", "Destination")), h("dd", {}, L(q.dest.name)),
        q.extra ? [h("dt", {}, T("Επιβάρυνση βάρους", "Weight surcharge")), h("dd", {}, T(`+${eur(q.extra)} ανά τεμάχιο (βασική ${eur(q.base)}, ${String(q.rate.toFixed(2)).replace(".", ",")} €/kg πάνω από ${OW.fromKg} kg)`, `+${eur(q.extra)} per item (base ${eur(q.base)}, €${q.rate.toFixed(2)}/kg over ${OW.fromKg} kg)`))] : null,
        q.hub ? [h("dt", {}, T("Ανταπόκριση", "Via")), h("dd", {}, L(q.hub.label))] : null,
        q.eta ? [h("dt", {}, T("Παράδοση", "Delivery")), h("dd", {}, L(q.eta))] : null,
        // 🚏 Πού το παραλαμβάνει ο παραλήπτης, με τηλέφωνα που καλούνται με ένα πάτημα
        q.dest.terminal ? [h("dt", {}, T("Παραλαβή στον προορισμό", "Collection at destination")), h("dd", {}, [L(q.dest.terminal), L(q.dest.terminalAddr)].filter(Boolean).join(", "),
          q.dest.terminalPhone ? h("div", {}, ...String(q.dest.terminalPhone).split(/\s*[,;]\s*/).flatMap((n, i) => [i ? ", " : "", h("a", { class: "num", href: "tel:" + n.replace(/[^\d+]/g, "").replace(/^(?!\+)/, "+30") }, n)])) : null)] : null));
      if (keys) {
        const when = d => d.drop.same ? T(`φέρτε το έως τις ${d.drop.by}`, `bring it by ${d.drop.by}`)
          : T(`φέρτε το από το προηγούμενο βράδυ, έως τις ${d.drop.by}`, `bring it the evening before, by ${d.drop.by}`);
        if (deps.length) card.append(h("div", { style: "margin-top:14px" }, h("span", { class: "eyebrow" }, T("Επόμενες αναχωρήσεις από το Αγρίνιο", "Next departures from Agrinio")),
          h("div", { class: "deps", style: "margin-top:6px" }, deps.map(d => h("div", {}, h("span", { class: "num" }, d.time), h("span", {}, d.day), h("span", { class: "muted", style: "font-size:14px" }, when(d)), d.express ? h("span", { class: "tag info" }, "Express") : null)))));
      }
      if (q.dest.note) card.append(h("p", { class: "muted", style: "margin-top:10px;font-size:14px" }, L(q.dest.note)));
      card.append(breakdown({ q, cat, classed, kg, kind }));
      const P = SITE.PACKING, pk = P && P.items.find(i => i.id === cat.id);
      if (pk && pk.id === "tenekes" && (P.active || pk.active)) card.append(h("p", { class: "notice info", style: "margin-top:12px" }, h("b", {}, T("Ο τενεκές ταξιδεύει σε χαρτοκιβώτιο", "The tin travels in a cardboard box")),
        T(`Δεν έχετε; Τον συσκευάζουμε εμείς με ${eur(pk.service)} (κούτα, σακούλα, ταινία, σήμανση), ή παίρνετε μόνο την κούτα με ${eur(pk.material)}.`, `No box? We pack it for ${eur(pk.service)} (box, bag, tape, labels), or buy just the box for ${eur(pk.material)}.`)));
      else if (pk && P.active) card.append(h("p", { class: "notice info", style: "margin-top:12px" }, h("b", {}, T("Δεν έχετε κούτα; Το πακετάρουμε εμείς", "No box? We pack it for you")),
        T(`${L(cat.name)}: ${eur(pk.service)} με υλικά και εργασία, ή ${eur(pk.material)} μόνο τα υλικά.`, `${L(cat.name)}: ${eur(pk.service)} including materials, or ${eur(pk.material)} for materials only.`)));
      card.append(h("p", { class: "muted", style: "margin-top:12px;font-size:14px" }, T("Ενδεικτική τιμή. Η τελική βγαίνει στον πάγκο, μετά από ζύγισμα και μέτρηση. Τιμές ΚΤΕΛ Αιτωλοακαρνανίας με ΦΠΑ.", "Indicative price. The final price is set at the counter after weighing and measuring. KTEL Aetolia-Acarnania prices, VAT included.")));
      if (warnHit) out.append(warnHit);
    };
    // «Πώς υπολογίστηκε»: τα ίδια βήματα με το ταμείο, με τα νούμερα αυτού του δέματος
    const n2 = v => LANG === "en" ? v.toFixed(2) : v.toFixed(2).replace(".", ",");
    const kgS = v => (LANG === "en" ? String(v) : String(v).replace(".", ",")) + " kg";
    const breakdown = ({ q, cat, classed, kg, kind }) => {
      const steps = [];
      const tLabel = L(SITE.TARIFFS[tariffKey(SITE, q.dest)].label);
      const catName = L(cat.name);
      if (classed) {
        const d = classed.sorted;
        const dimsTxt = d && d.length === 3 ? `${d[0]} × ${d[1]} × ${d[2]} ${T("εκ.", "cm")}` : "";
        const dimsCat = L(SITE.CATEGORIES.find(c => c.id === classed.dimsId).name);
        steps.push(classed.by === "kg"
          ? T(`Κατηγορία: ${dimsTxt ? `οι διαστάσεις ${dimsTxt} χωράνε σε «${dimsCat}», ` : ""}αλλά με ${kgS(Number(kg))} ανεβαίνει σε «${catName}».`, `Category: ${dimsTxt ? `size ${dimsTxt} fits "${dimsCat}", ` : ""}but at ${kgS(Number(kg))} it moves up to "${catName}".`)
          : T(`Κατηγορία: ${dimsTxt ? `οι διαστάσεις ${dimsTxt} χωράνε σε ` : ""}«${catName}».`, `Category: ${dimsTxt ? `size ${dimsTxt} fits ` : ""}"${catName}".`));
      } else steps.push(T(`Είδος: «${catName}»${kind === "tenekes" || kind === "arni" ? " (σταθερή τιμή, χωρίς επιβάρυνση βάρους)" : ""}.`, `Item: "${catName}"${kind === "tenekes" || kind === "arni" ? " (fixed price, no weight surcharge)" : ""}.`));
      steps.push(T(`Βασική τιμή, στήλη «${tLabel}»${q.hub ? `, μέσω ${L(q.hub.label)}` : ""}: ${eur(q.base)}.`, `Base price, "${tLabel}" column${q.hub ? `, via ${L(q.hub.label)}` : ""}: ${eur(q.base)}.`));
      const OWc = SITE.OVERWEIGHT, w = Number(kg) || 0;
      if (OWc && OWc.enabled && OWc.cats.includes(cat.id)) {
        if (w > OWc.fromKg) {
          const over = Math.ceil(Math.round((w - OWc.fromKg) * 1000) / 1000), raw = over * q.rate;
          steps.push(T(`Βάρος ${kgS(w)}: ${over} ${over === 1 ? "κιλό" : "κιλά"} πάνω από τα ${OWc.fromKg} × ${n2(q.rate)} € (το ${Math.round(OWc.share * 100)}% της τιμής τσουβαλιού) = ${n2(raw)} € → στρογγύλεμα ${eur(q.extra)}.`,
            `Weight ${kgS(w)}: ${over} kg over ${OWc.fromKg} × €${n2(q.rate)} (${Math.round(OWc.share * 100)}% of the sack price) = €${n2(raw)} → rounded up to ${eur(q.extra)}.`));
        } else steps.push(T(`Βάρος${w ? " " + kgS(w) : ""}: έως ${OWc.fromKg} kg, χωρίς επιβάρυνση.`, `Weight${w ? " " + kgS(w) : ""}: up to ${OWc.fromKg} kg, no surcharge.`));
      }
      steps.push(T(`Ανά τεμάχιο: ${eur(q.base)}${q.extra ? ` + ${eur(q.extra)}` : ""} = ${eur(q.perPiece)}${q.pieces > 1 ? ` · × ${q.pieces} τεμάχια = ${eur(q.total)}` : ""}.`,
        `Per item: ${eur(q.base)}${q.extra ? ` + ${eur(q.extra)}` : ""} = ${eur(q.perPiece)}${q.pieces > 1 ? ` · × ${q.pieces} items = ${eur(q.total)}` : ""}.`));
      if (q.hub) steps.push(T(`Ανταπόκριση: περίπου άλλα ${eur(q.otherEstimate)} σε φάκελο πάνω στο δέμα, για το πρακτορείο που συνεχίζει.`, `Connection: about ${eur(q.otherEstimate)} more in an envelope on the parcel, for the agency that carries it on.`));
      const det = h("details", { class: "how", open: howOpen }, h("summary", {}, T("Πώς υπολογίστηκε", "How we calculated it")), h("ol", {}, steps.map(s => h("li", {}, s))));
      det.addEventListener("toggle", () => { howOpen = det.open; });
      return det;
    };

    form.addEventListener("input", render); form.addEventListener("change", render);
    // Στο κινητό, μόλις διαλέξει προορισμό ή είδος, δείχνουμε την τιμή (αλλιώς μένει κάτω από την κάτω μπάρα).
    let calcPinged = false; const calcPing = () => { if (!calcPinged) { calcPinged = true; ping("calc", "calc"); } };
    form.addEventListener("input", calcPing); form.addEventListener("change", calcPing);
    // Μετά από αλλαγή προορισμού/είδους/μεγέθους: αν η τιμή δεν φαίνεται, φέρνουμε την τιμή στην οθόνη
    form.addEventListener("change", e => {
      if (!(e.target.tagName === "SELECT" || e.target.name === "kind" || NUMS.has(e.target.id))) return;
      if (!$("#c-dest").value) return;
      requestAnimationFrame(() => { const p = $(".price-board", out); if (!p) return; const r = p.getBoundingClientRect(); const bar = matchMedia("(max-width: 900px)").matches ? 76 : 0;
        if (r.top < 70 || r.bottom > innerHeight - bar) p.scrollIntoView({ behavior: SMOOTH, block: "center" }); });
    });
    form.addEventListener("submit", e => e.preventDefault());
    const pre = new URLSearchParams(location.search).get("to");
    if (pre && findDest(SITE.DESTINATIONS, pre)) sel.value = findDest(SITE.DESTINATIONS, pre).name;
    render(); onSchedule(render);
  }

  // ---------- Αναζήτηση δέματος ----------
  const tr = $("[data-track]");
  if (tr) {
    const URL_ = SITE.SUPABASE.url, KEY = SITE.SUPABASE.key;
    const out = $("[data-track-out]");
    const fmtDT = v => !v || isNaN(new Date(v)) ? "" : new Intl.DateTimeFormat(LOCALE, { timeZone: "Europe/Athens", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(v));
    const ymd = v => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date(v));
    const show = (cls, title, ...lines) => { out.textContent = ""; out.append(h("div", { class: "notice " + cls }, h("b", {}, title), ...lines.filter(Boolean).map(l => h("div", {}, l))));
      // Στο κινητό το αποτέλεσμα μπορεί να πέσει κάτω από την κάτω μπάρα: το φέρνουμε στην οθόνη.
      out.scrollIntoView({ behavior: SMOOTH, block: "nearest" }); };
    const bad = (el, on) => { el.setAttribute("aria-invalid", on ? "true" : "false"); if (on) el.focus(); };
    const city = c => { const d = c && findDest(SITE.DESTINATIONS, c); return d ? L(d.name) : c && LANG === "el" && c === c.toUpperCase() ? c.charAt(0) + c.slice(1).toLowerCase().replace(/σ(?=\s|$)/g, "ς") : c; };
    const q = new URLSearchParams(location.search); if (q.get("r")) $("#t-rc").value = q.get("r");
    // Ο αριθμός απόδειξης και τα γράμματα του επωνύμου δεν μένουν στη γραμμή διευθύνσεων (ούτε σε link που θα κοινοποιηθεί).
    if (q.get("r") || q.get("n")) history.replaceState(null, "", location.pathname + location.hash);
    if (q.get("n")) { $("#t-nm").value = q.get("n"); if (q.get("r")) setTimeout(() => tr.requestSubmit(), 0); }
    tr.addEventListener("submit", async e => {
      e.preventDefault();
      const rc = $("#t-rc").value, nm = $("#t-nm").value.trim();
      bad($("#t-rc"), false); bad($("#t-nm"), false);
      if (rc.replace(/\D/g, "").length > 20) { setTimeout(() => bad($("#t-rc"), true), 0); return show("warn", T("Ελέγξτε τον αριθμό απόδειξης", "Check the receipt number"), T("Ο αριθμός έχει περισσότερα ψηφία από μια απόδειξη. Γράψτε τον όπως είναι στο χαρτί, π.χ. 228-336-12345.", "That has more digits than a receipt number. Type it as printed, e.g. 228-336-12345.")); }
      if (rc.replace(/\D/g, "").length < 10) { setTimeout(() => bad($("#t-rc"), true), 0); return show("warn", T("Ελέγξτε τον αριθμό απόδειξης", "Check the receipt number"), T("Γράψτε όλο τον αριθμό της απόδειξης, π.χ. 228-336-12345. Στις χειρόγραφες αποδείξεις: τον κόκκινο αριθμό.", "Enter the full receipt number, e.g. 228-336-12345. On handwritten receipts: the red number.")); }
      if (nm.replace(/\s/g, "").length < 3) { setTimeout(() => bad($("#t-nm"), true), 0); return show("warn", T("Γράψτε 3 γράμματα", "Enter 3 letters"), T("Τα 3 πρώτα γράμματα του επωνύμου του παραλήπτη.", "The first 3 letters of the recipient's surname, as written on the receipt.")); }
      const btn = $("button", tr); btn.disabled = true; show("info", T("Αναζήτηση…", "Searching…")); ping("track", "track");
      try {
        const r = await fetch(URL_ + "/rest/v1/rpc/track_parcel", { method: "POST", headers: { apikey: KEY, "content-type": "application/json" }, body: JSON.stringify({ p_receipt: rc, p_name: nm }) });
        if (r.status === 429 || r.status === 400) { const t = await r.text(); if (/locked_24h/.test(t)) return show("warn", T("Πολλές λάθος προσπάθειες για αυτή την απόδειξη", "Too many failed attempts for this receipt"), T("Για την προστασία των δεδομένων, η αναζήτηση για αυτή την απόδειξη κλείδωσε για 24 ώρες. Καλέστε μας και θα σας πούμε αμέσως αν έφτασε.", "To protect personal data, searches for this receipt are locked for 24 hours. Call us and we will tell you right away."), h("span", {}, ...contactNodes()));
          if (r.status === 429 || /too_many/.test(t)) return show("warn", T("Πολλές αναζητήσεις", "Too many searches"), T("Για την προστασία των δεδομένων, οι αναζητήσεις είναι περιορισμένες. Δοκιμάστε ξανά σε 15 λεπτά ή καλέστε μας.", "To protect personal data, searches are limited. Try again in 15 minutes or call us."), h("span", {}, ...contactNodes())); throw new Error(t); }
        if (!r.ok) throw new Error(r.status);
        const [x] = await r.json();
        if (!x) return show("warn", T("Δεν βρέθηκε ακόμα", "Not found yet"), T("Αν το δέμα στάλθηκε σήμερα, μπορεί να μην έχει φτάσει ή να μην έχει καταχωρηθεί. Ελέγξτε τον αριθμό και τα γράμματα, ή καλέστε μας.", "If it was sent today, it may not have arrived or been registered yet. Check the number and letters."), h("span", {}, ...contactNodes()));
        const pcs = x.pieces_total > 1 ? T(`Έχουν φτάσει ${x.pieces_in} από ${x.pieces_total} τεμάχια.`, `${x.pieces_in} of ${x.pieces_total} items have arrived.`) : null;
        if (x.state === "here") {
          const f = storageFee(SITE.STORAGE, ymd(x.at), ymd(new Date()));
          show("ok", T("Το δέμα σας έφτασε", "Your parcel has arrived"), T(`Έφτασε${x.at ? " " + fmtDT(x.at) : ""}${x.origin ? ", από " + city(x.origin) : ""}.`, `Arrived${x.at ? " " + fmtDT(x.at) : ""}${x.origin ? ", from " + city(x.origin) : ""}.`), pcs,
            f.fee > 0 ? T(`Χρέωση φύλαξης μέχρι σήμερα: ${eur(f.fee)} (δωρεάν φύλαξη έως ${f.freeUntil}).`, `Storage charge so far: ${eur(f.fee)} (free storage until ${f.freeUntil}).`) : T(`Δωρεάν φύλαξη έως και ${f.freeUntil}. Φέρτε ταυτότητα.`, `Free storage until ${f.freeUntil}. Bring photo ID.`));
        } else if (x.state === "done") show("info", T("Παραδόθηκε", "Collected"), T(`Το δέμα παραλήφθηκε${x.at ? " " + fmtDT(x.at) : ""}.`, `The parcel was collected${x.at ? " " + fmtDT(x.at) : ""}.`));
        else if (x.state === "transit") show("info", T("Σε μεταφόρτωση", "In transit"), T(`Πέρασε από το Αγρίνιο${x.at ? " " + fmtDT(x.at) : ""} και συνεχίζει προς ${city(x.dest) || "τον προορισμό του"}.`, `Passed through Agrinio ${fmtDT(x.at)} and continues to ${city(x.dest) || "its destination"}.`), pcs);
        else if (x.state === "forwarded") show("info", T("Στάλθηκε", "Forwarded"), T(`Έφυγε από το Αγρίνιο προς ${city(x.dest) || "τον προορισμό του"}${x.at ? " " + fmtDT(x.at) : ""}.`, `Left Agrinio for ${city(x.dest) || "its destination"}${x.at ? " " + fmtDT(x.at) : ""}.`));
        else if (x.state === "returned") show("warn", T("Επιστράφηκε", "Returned"), T("Το δέμα επιστράφηκε στον αποστολέα. Καλέστε μας για πληροφορίες.", "The parcel was returned to the sender."), h("span", {}, ...contactNodes()));
        else show("warn", T("Καλέστε μας", "Call us"), T("Δεν μπορούμε να δούμε την κατάσταση του δέματος από εδώ.", "We cannot show this parcel's status here."), h("span", {}, ...contactNodes()));
      } catch { show("bad", T("Η αναζήτηση δεν ολοκληρώθηκε", "The search did not complete"), T("Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.", "Check your connection and try again."), h("span", {}, ...contactNodes())); }
      finally { btn.disabled = false; }
    });
  }

  // ---------- Φίλτρο πίνακα προορισμών ----------
  const dq = $("[data-dest-filter]");
  if (dq) {
    const rows = $$(".dest-table tbody tr"), cnt = $("[data-dest-count]");
    dq.addEventListener("focus", () => { if (matchMedia("(max-width: 900px)").matches) setTimeout(() => dq.scrollIntoView({ behavior: SMOOTH, block: "start" }), 250); });
    const empty = h("div", { class: "notice info dest-empty", hidden: true }, h("b", {}, T("Δεν βρέθηκε", "Not found")), T("Δεν τη βρίσκουμε στη λίστα. Καλέστε μας και θα βρούμε τρόπο να σας εξυπηρετήσουμε. ", "It is not on the list. Call us and we will find a way to help. "), ...contactNodes());
    cnt.after(empty);
    const mobile = matchMedia("(max-width: 600px)").matches;
    let showAll = !mobile;
    const more = h("button", { type: "button", class: "btn btn-ghost dest-more", hidden: true }, T(`Όλοι οι προορισμοί (${rows.length})`, `All destinations (${rows.length})`));
    more.addEventListener("click", () => { showAll = true; run(); });
    cnt.after(more);
    const run = () => {
      const raw = dq.value.trim(), q = loose(/[a-z]/i.test(raw) ? toGreek(raw) : raw); let n = 0;
      for (const r of rows) { const ok = q ? loose(r.dataset.q).includes(q) || norm(r.dataset.q).includes(norm(raw)) : (showAll || r.dataset.top === "1"); r.hidden = !ok; if (ok) n++; }
      cnt.textContent = !q && !showAll ? T(`Οι πιο συχνοί προορισμοί · γράψτε για να βρείτε άλλη πόλη`, `Most common destinations · type to find another town`) : T(`${n} από ${rows.length} προορισμούς`, `${n} of ${rows.length} destinations`);
      empty.hidden = !(q && n === 0);
      more.hidden = !!q || showAll;
    };
    dq.addEventListener("input", run); run();
  }

  // ---------- Παράδοση στο σπίτι ----------
  const home = $("[data-home]");
  if (home) {
    const H = SITE.HOME;
    const sel = $("#h-zone", home), outH = $("[data-home-out]", home);
    const draw = () => {
      outH.textContent = "";
      const z = H.zones.find(z => z.id === sel.value);
      if (!sel.value) return outH.append(h("p", { class: "muted" }, T("Διαλέξτε περιοχή.", "Choose an area.")));
      if (!z) return outH.append(h("div", { class: "notice warn" }, h("b", {}, T("Δεν εξυπηρετείται ακόμα", "Not served yet")), T("Προς το παρόν μόνο εντός της πόλης του Αγρινίου.", "For now, only within the town of Agrinio.")));
      outH.append(h("div", { class: "price" }, h("span", { class: "big" }, (H.active ? "" : T("περίπου ", "about ")) + eur(z.price)), h("span", { class: "per" }, T("ανά παράδοση ή παραλαβή", "per delivery or pickup"))),
        h("p", { class: "muted", style: "margin-top:6px" }, `${H.hours} · ${L(H.vehicles)}`),
        H.active ? null : h("p", { class: "muted", style: "margin-top:6px;font-size:14px" }, T("Η τελική τιμή θα ανακοινωθεί όταν ξεκινήσει η υπηρεσία.", "The final price will be announced when the service starts.")));
    };
    sel.addEventListener("change", draw); draw();
  }

  // ---------- Φόρμες μηνυμάτων (WhatsApp / email, χωρίς αποθήκευση σε server) ----------
  for (const f of $$("form[data-msgform]")) {
    const out = $("[data-msg-out]", f.parentElement);
    f.addEventListener("submit", e => {
      e.preventDefault();
      for (const el of $$("input, textarea", f)) { el.setCustomValidity(""); if (el.validity.patternMismatch && el.title) el.setCustomValidity(el.title); }
      if (!f.reportValidity()) return;
      const lines = [f.dataset.msgform];
      for (const el of $$("input, select, textarea", f)) {
        if (el.type === "checkbox") { if (el.dataset.label) lines.push(`${el.dataset.label}: ${el.checked ? T("ΝΑΙ", "YES") : T("ΟΧΙ", "NO")}`); continue; }
        if (el.value.trim()) lines.push(`${el.dataset.label || el.name}: ${el.value.trim()}`);
      }
      const text = lines.join("\n");
      out.textContent = "";
      const pre = h("pre", { class: "panel", style: "white-space:pre-wrap;font:15px/1.5 var(--f-body);margin:0" }, text);
      const copy = h("button", { type: "button", class: "btn btn-ghost" }, T("Αντιγραφή κειμένου", "Copy text"));
      copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(text); copy.textContent = T("Αντιγράφηκε", "Copied"); copy.classList.remove("done"); void copy.offsetWidth; copy.classList.add("done"); } catch { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copy.textContent = T("Επιλέχθηκε — πατήστε Αντιγραφή", "Selected — press Copy"); } });
      out.append(h("div", { class: "notice info" }, h("b", {}, T("Το μήνυμά σας είναι έτοιμο", "Your message is ready")), T("Στείλτε το με WhatsApp ή email. Δεν αποθηκεύεται πουθενά στην ιστοσελίδα.", "Send it by WhatsApp or email. Nothing is stored on this website.")), pre,
        h("div", { style: "display:flex;flex-wrap:wrap;gap:10px" },
          h("a", { class: "btn btn-primary", href: "https://wa.me/30" + B.mobile + "?text=" + encodeURIComponent(text), target: "_blank", rel: "noopener" }, T("Αποστολή με WhatsApp", "Send by WhatsApp")),
          h("a", { class: "btn btn-ghost", href: "mailto:" + B.email + "?subject=" + encodeURIComponent(f.dataset.msgform) + "&body=" + encodeURIComponent(text) }, T("Αποστολή με email", "Send by email")), copy));
      out.scrollIntoView({ behavior: SMOOTH, block: "nearest" });
    });
  }

  // ---------- Δημοσκόπηση (ανώνυμη, αποθηκεύεται στο Supabase μέσω submit_poll) ----------
  const pollForm = $("form[data-poll]");
  if (pollForm) {
    const out = $("[data-poll-out]");
    const KEY = "poll-spiti-2026";
    const done = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
    const thanks = again => {
      out.textContent = "";
      out.append(h("div", { class: "notice ok" }, h("b", {}, again ? T("Έχετε ήδη απαντήσει — ευχαριστούμε!", "You have already answered — thank you!") : T("Ευχαριστούμε! Η απάντησή σας καταγράφηκε.", "Thank you! Your answer was recorded.")),
        T("Θέλετε να μπείτε και στην κλήρωση για δωρεάν παραδόσεις; ", "Want to enter the draw for free deliveries too? "), h("a", { href: T("spiti.html", "home-delivery.html") }, T("Δηλώστε ενδιαφέρον →", "Register your interest →"))));
    };
    if (done()) { pollForm.hidden = true; thanks(true); }
    const src = (new URLSearchParams(location.search).get("s") || "web").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20) || "web";
    pollForm.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(pollForm);
      const q1e = $("#q1-err");
      if (!fd.get("would_use")) { if (q1e) { q1e.textContent = ""; q1e.append(h("b", {}, T("Απαντήστε στην ερώτηση 1", "Please answer question 1")), T("Είναι η μόνη υποχρεωτική.", "It is the only required one.")); q1e.hidden = false; } const r1 = $("input[name=would_use]", pollForm); r1.focus({ preventScroll: true }); r1.closest("fieldset").scrollIntoView({ behavior: SMOOTH, block: "center" }); return; }
      if (q1e) q1e.hidden = true;
      const p = { would_use: fd.get("would_use"), frequency: fd.get("frequency") || "", price: fd.get("price") || "", wants: fd.getAll("wants"), who: fd.get("who") || "", area: fd.get("area") || "", comment: (fd.get("comment") || "").trim().slice(0, 500), lang: LANG, source: src };
      const btn = $("button[type=submit]", pollForm); btn.disabled = true;
      try {
        const r = await fetch(SITE.SUPABASE.url + "/rest/v1/rpc/submit_poll", { method: "POST", headers: { "Content-Type": "application/json", apikey: SITE.SUPABASE.key, Authorization: "Bearer " + SITE.SUPABASE.key }, body: JSON.stringify({ p }) });
        if (!r.ok) { const t = await r.text(); if (/too_many/.test(t)) { out.textContent = ""; out.append(h("div", { class: "notice warn" }, h("b", {}, T("Πολλές απαντήσεις από αυτή τη σύνδεση", "Too many answers from this connection")), T("Δοκιμάστε ξανά σε μία ώρα.", "Please try again in an hour."))); btn.disabled = false; return; } throw new Error(t); }
        try { localStorage.setItem(KEY, "1"); } catch {}
        pollForm.hidden = true; thanks(false); out.scrollIntoView({ behavior: SMOOTH, block: "nearest" }); const tb = $("b", out); if (tb) { tb.tabIndex = -1; tb.focus({ preventScroll: true }); }
      } catch {
        btn.disabled = false; out.textContent = "";
        out.append(h("div", { class: "notice warn" }, h("b", {}, T("Δεν στάλθηκε", "Not sent")), T("Κάτι πήγε στραβά με τη σύνδεση. Δοκιμάστε ξανά σε λίγο ή πείτε μας την απάντησή σας στην αποθήκη.", "Something went wrong with the connection. Try again shortly or tell us at the depot.")));
      }
    });
  }

  // ---------- 🗓 Διαχείριση δρομολογίων (μόνο με σύνδεση· λογαριασμός της εφαρμογής) ----------
  // @admin-start — το build.mjs αφαιρεί αυτό το κομμάτι από το app.js των δημόσιων σελίδων (μπαίνει μόνο στο app-admin.js).
  const adm = $("[data-admin]");
  if (adm) {
    const U = SITE.SUPABASE.url, K = SITE.SUPABASE.key, TK = "adm-session";
    const DAYS = ["Δε", "Τρ", "Τε", "Πε", "Πα", "Σα", "Κυ"];
    let sess = null, rows = [], dirty = new Set(), removed = new Set(), seq = -1, msg = null, openDest = new Set();
    try { sess = JSON.parse(sessionStorage.getItem(TK) || "null"); } catch {}
    const save = () => { try { sess ? sessionStorage.setItem(TK, JSON.stringify(sess)) : sessionStorage.removeItem(TK); } catch {} };
    const api = async (path, opt = {}) => {
      if (sess && sess.exp && Date.now() / 1000 > sess.exp - 60) await refresh();
      const r = await fetch(U + path, { ...opt, headers: { apikey: K, Authorization: "Bearer " + (sess ? sess.at : K), "content-type": "application/json", ...(opt.headers || {}) } });
      if (r.status === 401) { sess = null; save(); throw new Error("Η σύνδεση έληξε. Συνδεθείτε ξανά."); }
      if (!r.ok) { const t = await r.text(); throw new Error(/does not exist|schema cache|42P01|PGRST205/.test(t) ? (/site_(tariffs|destinations|settings)/.test(path) ? "Τρέξτε πρώτα το 0027_site_catalog.sql στο Supabase." : "Τρέξτε πρώτα το 0026_parcel_departures.sql στο Supabase.") : t.slice(0, 200)); }
      return r.status === 204 ? null : r.json().catch(() => null);
    };
    // Ανανέωση σάιτ: οι τιμές, οι προορισμοί και οι μέρες μπαίνουν στις σελίδες όταν χτίζεται το σάιτ.
    // Με τον σύνδεσμο «Deploy hook» του Cloudflare (αποθηκευμένο μόνο στη βάση), η αποθήκευση το ξαναχτίζει αμέσως.
    let hook = "";
    const loadHook = async () => { try { const s = await api("/rest/v1/site_settings?key=eq.deploy_hook&select=value"); hook = (s && s[0] && s[0].value) || ""; } catch { hook = ""; } };
    const publish = async () => {
      if (!hook) return " Θα φανούν στις σελίδες στην επόμενη ανανέωση του σάιτ (βάλτε τον σύνδεσμο ανανέωσης στο τέλος της σελίδας για να γίνεται μόνο του).";
      if (!/^https:\/\/api\.cloudflare\.com\/client\/v4\/(pages\/webhooks|workers\/builds)\/deploy_hooks\/[A-Za-z0-9-]+$/.test(hook)) return " Ο αποθηκευμένος σύνδεσμος ανανέωσης δεν είναι σωστός· ελέγξτε τον στην «Ανανέωση σάιτ».";
      try { await fetch(hook, { method: "POST", mode: "no-cors" }); return " Το σάιτ ανανεώνεται: οι αλλαγές φαίνονται σε 2–3 λεπτά."; }
      catch { return " Η αυτόματη ανανέωση δεν ξεκίνησε· δοκιμάστε ξανά ή ανανεώστε από το Cloudflare."; }
    };
    const MODE = adm.dataset.admin || "sched";
    const setSess = j => { sess = { at: j.access_token, rt: j.refresh_token, exp: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: j.user && j.user.email }; save(); };
    async function refresh() {
      const r = await fetch(U + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { apikey: K, "content-type": "application/json" }, body: JSON.stringify({ refresh_token: sess.rt }) });
      if (!r.ok) { sess = null; save(); throw new Error("Η σύνδεση έληξε. Συνδεθείτε ξανά."); }
      setSess(await r.json());
    }
    const say = (cls, text) => { msg = text ? h("div", { class: "notice " + cls, style: "margin-bottom:14px" }, text) : null; };

    function loginView() {
      adm.textContent = "";
      const email = h("input", { type: "email", id: "a-email", autocomplete: "username", required: true });
      const pw = h("input", { type: "password", id: "a-pw", autocomplete: "current-password", required: true });
      const btn = h("button", { class: "btn btn-primary", type: "submit" }, "Σύνδεση");
      const f = h("form", { class: "form panel", style: "max-width:460px" }, h("h2", { style: "font-size:24px" }, "Σύνδεση"),
        h("p", { class: "muted" }, "Με τον ίδιο λογαριασμό που μπαίνετε στην εφαρμογή της αποθήκης."),
        h("div", { class: "field" }, h("label", { for: "a-email" }, "Email"), email),
        h("div", { class: "field" }, h("label", { for: "a-pw" }, "Κωδικός"), pw), btn);
      f.addEventListener("submit", async e => {
        e.preventDefault(); btn.disabled = true;
        try {
          const r = await fetch(U + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: K, "content-type": "application/json" }, body: JSON.stringify({ email: email.value.trim(), password: pw.value }) });
          if (!r.ok) throw new Error("Λάθος email ή κωδικός.");
          setSess(await r.json()); await load();
        } catch (err) { btn.disabled = false; say("bad", err.message === "Failed to fetch" ? "Δεν υπάρχει σύνδεση με τον διακομιστή." : err.message); loginView(); }
      });
      if (msg) adm.append(msg); adm.append(f);
    }

    async function load() {
      if (MODE === "dest") return loadDest();
      try { rows = await api("/rest/v1/site_schedule?select=*&order=dest.asc,time.asc") || []; dirty.clear(); removed.clear(); await loadHook(); render(); }
      catch (e) { say("bad", e.message); sess ? render() : loginView(); }
    }

    function render() {
      if (MODE === "dest") return renderDest();
      adm.textContent = "";
      const dests = [...new Set(rows.map(r => r.dest))].sort((a, b) => a.localeCompare(b, "el"));
      const changes = dirty.size + removed.size;
      const saveBtn = h("button", { class: "btn btn-primary", type: "button", disabled: !changes }, changes ? `Αποθήκευση (${changes})` : "Αποθηκευμένα");
      saveBtn.addEventListener("click", saveAll);
      const out = h("button", { class: "btn btn-ghost", type: "button" }, "Αποσύνδεση");
      out.addEventListener("click", () => { sess = null; save(); say(null, ""); loginView(); });
      const shownN = rows.filter(r => r.shown).length;
      adm.append(h("div", { class: "adm-bar" }, h("div", {}, h("b", {}, sess && sess.email ? sess.email : ""), h("div", { class: "muted", style: "font-size:14px" }, `${shownN} από ${rows.length} δρομολόγια στη σελίδα`)), h("div", { style: "display:flex;gap:10px;flex-wrap:wrap" }, saveBtn, out)));
      if (msg) adm.append(msg);
      for (const d of dests) {
        const list = rows.filter(r => r.dest === d).sort((a, b) => (a.time || "99") .localeCompare(b.time || "99"));
        const on = list.filter(r => r.shown).length;
        const det = h("details", { class: "adm-dest" }); if (openDest.has(d)) det.open = true;
        det.addEventListener("toggle", () => { det.open ? openDest.add(d) : openDest.delete(d); });
        det.append(h("summary", {}, h("b", {}, d), h("span", { class: "muted" }, ` · ${on}/${list.length} στη σελίδα`)));
        const head = h("div", { class: "adm-row adm-head" }, h("span", {}, "Ώρα"), ...DAYS.map(x => h("span", {}, x)), h("span", {}, "Στη σελίδα"), h("span", {}, ""));
        det.append(head);
        for (const r of list) det.append(rowEl(r));
        const add = h("button", { class: "btn btn-ghost", type: "button", style: "min-height:40px;margin-top:8px" }, "+ Ώρα");
        add.addEventListener("click", () => { const r = { id: seq--, dest: d, time: "", days: "1111111", express: false, conn: false, notes: null, shown: true }; rows.push(r); dirty.add(r.id); openDest.add(d); render(); });
        det.append(add);
        adm.append(det);
      }
      const nd = h("input", { placeholder: "Νέος προορισμός (π.χ. ΚΑΛΑΜΑΤΑ)", style: "max-width:320px" });
      const nb = h("button", { class: "btn btn-ghost", type: "button" }, "+ Προορισμός");
      nb.addEventListener("click", () => { const d = nd.value.trim().toUpperCase(); if (d.length < 2) return; const r = { id: seq--, dest: d, time: "", days: "1111111", express: false, conn: false, notes: null, shown: true }; rows.push(r); dirty.add(r.id); openDest.add(d); render(); });
      adm.append(h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:18px" }, nd, nb));
    }

    function rowEl(r) {
      const mark = () => { dirty.add(r.id); render(); };
      const t = h("input", { value: r.time, inputmode: "numeric", placeholder: "09:30", class: "mono adm-time", "aria-label": "Ώρα" });
      t.addEventListener("change", () => { let v = t.value.replace(/[.,]/g, ":").replace(/\s/g, ""); if (/^\d{3,4}$/.test(v)) v = v.padStart(4, "0").replace(/(\d\d)(\d\d)/, "$1:$2"); if (/^\d:\d\d$/.test(v)) v = "0" + v; r.time = v; mark(); });
      const days = DAYS.map((x, i) => { const c = h("input", { type: "checkbox", "aria-label": x, checked: r.days[i] === "1" });
        c.addEventListener("change", () => { const a = r.days.split(""); a[i] = c.checked ? "1" : "0"; r.days = a.join(""); mark(); }); return h("label", { class: "adm-cb" }, c); });
      const sh = h("input", { type: "checkbox", "aria-label": "Στη σελίδα", checked: !!r.shown }); sh.addEventListener("change", () => { r.shown = sh.checked; mark(); });
      const del = h("button", { class: "adm-del", type: "button", "aria-label": "Διαγραφή", title: "Διαγραφή" }, "✕");
      del.addEventListener("click", () => { rows = rows.filter(x => x !== r); dirty.delete(r.id); if (r.id > 0) removed.add(r.id); render(); });
      return h("div", { class: "adm-row" + (r.shown ? "" : " off") + (dirty.has(r.id) ? " changed" : "") }, t, ...days, h("label", { class: "adm-cb adm-show" }, sh), del);
    }

    async function saveAll() {
      const bad = rows.filter(r => dirty.has(r.id) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time));
      if (bad.length) { say("warn", `Ελέγξτε την ώρα στο ${bad[0].dest}: γράψτε τη σαν 09:30.`); return render(); }
      const keys = new Set(); for (const r of rows) { const k = r.dest + " " + r.time; if (keys.has(k)) { say("warn", `Η ώρα ${r.time} υπάρχει δύο φορές στο ${r.dest}.`); return render(); } keys.add(k); }
      try {
        for (const id of removed) await api("/rest/v1/site_schedule?id=eq." + id, { method: "DELETE" });
        for (const r of rows.filter(x => dirty.has(x.id))) {
          const body = { dest: r.dest, time: r.time, days: r.days, express: !!r.express, conn: !!r.conn, notes: r.notes || null, shown: !!r.shown, updated_at: new Date().toISOString() };
          if (r.id > 0) await api("/rest/v1/site_schedule?id=eq." + r.id, { method: "PATCH", body: JSON.stringify(body) });
          else await api("/rest/v1/site_schedule", { method: "POST", body: JSON.stringify(body) });
        }
        say("ok", "Αποθηκεύτηκαν. Ο πίνακας «Επόμενες αναχωρήσεις» τα δείχνει ήδη." + await publish());
        await load();
      } catch (e) { say("bad", "Δεν αποθηκεύτηκαν όλα: " + e.message); render(); }
    }

    // ---------- 🗺 Προορισμοί & τιμοκατάλογος ----------
    let TF = [], DS = [], schedKeys = [], dT = new Set(), rT = new Set(), dD = new Set(), rD = new Set(), q = "", openG = new Set(), tfOpen = false;
    const CATS = SITE.CATEGORIES;
    const SHORTC = { fakelos: "Φάκελος", mikro: "Μικρό", mesaio: "Μεσαίο", megalo: "Μεγάλο", tenekes: "Τενεκές", tenekes_syn: "Συνοδ. τεν.", tsouvali: "Τσουβάλι", arni: "Αρνί" };
    const HUBT = new Set(Object.values(SITE.HUBS).map(x => x.tariff));
    const HOW = [["direct", "Απευθείας"], ["local", "Εντός νομού"], ...Object.entries(SITE.HUBS).map(([k, x]) => ["transfer:" + k, "Ανταπόκριση μέσω " + x.label]), ["ask", "Ρωτήστε μας"], ["none", "Δεν εξυπηρετείται"]];
    const GROUPS = [["direct", "Απευθείας"], ["local", "Εντός νομού"], ["transfer", "Με ανταπόκριση"], ["ask", "Ρωτήστε μας"], ["none", "Δεν εξυπηρετούνται"]];
    const howOf = d => d.type === "transfer" ? "transfer:" + d.hub : d.type;
    const price = v => { const x = String(v ?? "").replace(",", ".").trim(); return x === "" ? null : (isFinite(+x) && +x > 0 ? Math.round(+x * 100) / 100 : NaN); };

    async function loadDest() {
      try {
        TF = await api("/rest/v1/site_tariffs?select=*&order=sort.asc,key.asc") || [];
        DS = await api("/rest/v1/site_destinations?select=*&order=name.asc") || [];
        try { schedKeys = [...new Set((await api("/rest/v1/site_schedule?select=dest") || []).map(r => r.dest))].sort((a, b) => a.localeCompare(b, "el")); } catch { schedKeys = []; }
        await loadHook(); dT.clear(); rT.clear(); dD.clear(); rD.clear(); renderDest();
      } catch (e) { say("bad", e.message); sess ? renderDest() : loginView(); }
    }

    function field(label, el, wide) { return h("label", { class: "adm-f" + (wide ? " wide" : "") }, h("span", {}, label), el); }

    function renderDest() {
      adm.textContent = "";
      const changes = dT.size + rT.size + dD.size + rD.size;
      const saveBtn = h("button", { class: "btn btn-primary", type: "button", disabled: !changes }, changes ? `Αποθήκευση (${changes})` : "Αποθηκευμένα");
      saveBtn.addEventListener("click", saveDest);
      const out = h("button", { class: "btn btn-ghost", type: "button" }, "Αποσύνδεση");
      out.addEventListener("click", () => { sess = null; save(); say(null, ""); loginView(); });
      adm.append(h("div", { class: "adm-bar" }, h("div", {}, h("b", {}, sess && sess.email ? sess.email : ""), h("div", { class: "muted", style: "font-size:14px" }, `${DS.filter(d => d.shown).length} προορισμοί στη σελίδα · ${TF.length} στήλες τιμών`)), h("div", { style: "display:flex;gap:10px;flex-wrap:wrap" }, saveBtn, out)));
      if (msg) adm.append(msg);

      // Τιμοκατάλογος
      const tdet = h("details", { class: "adm-dest" }); tdet.open = tfOpen; tdet.addEventListener("toggle", () => { tfOpen = tdet.open; });
      tdet.append(h("summary", {}, h("b", {}, "Τιμοκατάλογος"), h("span", { class: "muted" }, " · € με ΦΠΑ, ανά τεμάχιο · κενό = «ρωτήστε»")));
      const tbl = h("table", { class: "adm-tf" }, h("thead", {}, h("tr", {}, h("th", {}, "Στήλη"), ...CATS.map(c => h("th", {}, SHORTC[c.id] || c.name)), h("th", {}, ""))));
      const tb = h("tbody");
      for (const t of TF) {
        const mark = () => { dT.add(t.key); renderDest(); };
        const lab = h("input", { value: t.label, "aria-label": "Όνομα στήλης" }); lab.addEventListener("change", () => { t.label = lab.value.trim(); mark(); });
        const cells = CATS.map(c => { const v = t.p ? t.p[c.id] : null; const i = h("input", { value: v == null ? "" : String(v).replace(".", ","), inputmode: "decimal", class: "num", "aria-label": `${t.label} · ${c.name}` });
          i.addEventListener("change", () => { const n = price(i.value); if (Number.isNaN(n)) { i.value = ""; say("warn", "Γράψτε την τιμή σε ευρώ, π.χ. 7 ή 7,50."); return renderDest(); } t.p = { ...(t.p || {}), [c.id]: n }; mark(); }); return h("td", {}, i); });
        const del = h("button", { class: "adm-del", type: "button", title: "Διαγραφή στήλης", "aria-label": "Διαγραφή στήλης" }, "✕");
        del.addEventListener("click", () => {
          if (HUBT.has(t.key)) { say("warn", `Η στήλη «${t.label}» χρησιμοποιείται από σταθμό ανταπόκρισης και δεν σβήνεται.`); return renderDest(); }
          const used = DS.filter(d => d.tariff === t.key); if (used.length) { say("warn", `Η στήλη «${t.label}» χρησιμοποιείται από: ${used.slice(0, 5).map(d => d.name).join(", ")}${used.length > 5 ? "…" : ""}. Αλλάξτε τους πρώτα.`); return renderDest(); }
          TF = TF.filter(x => x !== t); dT.delete(t.key); if (!t._new) rT.add(t.key); renderDest(); });
        tb.append(h("tr", { class: dT.has(t.key) ? "changed" : "" }, h("td", {}, lab), ...cells, h("td", {}, del)));
      }
      tbl.append(tb);
      const addT = h("button", { class: "btn btn-ghost", type: "button", style: "min-height:40px;margin-top:8px" }, "+ Στήλη τιμών");
      addT.addEventListener("click", () => { const t = { key: "t" + Date.now().toString(36), label: "Νέα στήλη", p: {}, sort: TF.length, _new: true }; TF.push(t); dT.add(t.key); tfOpen = true; renderDest(); });
      tdet.append(h("div", { class: "table-wrap" }, tbl), addT);
      adm.append(tdet);

      // Προορισμοί
      const sIn = h("input", { type: "search", value: q, placeholder: "Βρείτε προορισμό…", style: "max-width:360px;margin:16px 0 4px" });
      sIn.addEventListener("input", () => { q = sIn.value; const pos = sIn.selectionStart; renderDest(); const n = $("[data-admin] input[type=search]"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } });
      adm.append(sIn);
      if (schedKeys.length) adm.append(h("datalist", { id: "adm-keys" }, schedKeys.map(k => h("option", { value: k }))));
      const match = d => !q || norm(d.name + " " + d.region).includes(norm(q));
      for (const [ty, label] of GROUPS) {
        const list = DS.filter(d => d.type === ty && match(d));
        if (!list.length && q) continue;
        const det = h("details", { class: "adm-dest" }); if (openG.has(ty) || q) det.open = true;
        det.addEventListener("toggle", () => { det.open ? openG.add(ty) : openG.delete(ty); });
        det.append(h("summary", {}, h("b", {}, label), h("span", { class: "muted" }, ` · ${list.length}`)));
        for (const d of list) det.append(destCard(d));
        adm.append(det);
      }
      const nd = h("input", { placeholder: "Νέος προορισμός (π.χ. Τρίπολη)", style: "max-width:320px" });
      const nb = h("button", { class: "btn btn-ghost", type: "button" }, "+ Προορισμός");
      nb.addEventListener("click", () => { const n = nd.value.trim(); if (n.length < 2) return; if (DS.some(d => norm(d.name) === norm(n))) { say("warn", `Ο προορισμός «${n}» υπάρχει ήδη.`); return renderDest(); }
        const d = { id: seq--, name: n, region: "", type: "direct", tariff: null, hub: null, sched: [], days: null, eta: "", note: "", shown: true }; DS.push(d); dD.add(d.id); openG.add("direct"); q = ""; renderDest(); });
      adm.append(h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:18px" }, nd, nb));

      // Ανανέωση σάιτ
      const hk = h("input", { value: hook, placeholder: "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/…", style: "font-size:14px" });
      const hb = h("button", { class: "btn btn-ghost", type: "button" }, "Αποθήκευση συνδέσμου");
      hb.addEventListener("click", async () => {
        const v = hk.value.trim();
        if (v && !/^https:\/\/api\.cloudflare\.com\/client\/v4\/(pages\/webhooks|workers\/builds)\/deploy_hooks\/[A-Za-z0-9-]+$/.test(v)) { say("warn", "Ο σύνδεσμος πρέπει να είναι το «Deploy hook» του Cloudflare (ξεκινά με https://api.cloudflare.com/…/deploy_hooks/)."); return renderDest(); }
        try { await api("/rest/v1/site_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key: "deploy_hook", value: v }) }); hook = v; say("ok", v ? "Ο σύνδεσμος αποθηκεύτηκε. Από εδώ και πέρα κάθε αποθήκευση ανανεώνει το σάιτ." : "Ο σύνδεσμος σβήστηκε."); }
        catch (e) { say("bad", e.message); }
        renderDest();
      });
      const nowB = h("button", { class: "btn btn-ghost", type: "button", disabled: !hook }, "Ανανέωση τώρα");
      nowB.addEventListener("click", async () => { say("ok", (await publish()).trim()); renderDest(); });
      adm.append(h("details", { class: "adm-dest", style: "margin-top:24px" }, h("summary", {}, h("b", {}, "Ανανέωση σάιτ"), h("span", { class: "muted" }, hook ? " · ενεργή" : " · δεν έχει ρυθμιστεί")),
        h("p", { class: "muted", style: "font-size:14px" }, "Cloudflare → το project → Settings → Build → Deploy hooks → Add (όνομα «diaxeirisi», branch main) → αντιγράψτε τον σύνδεσμο εδώ."),
        h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;align-items:center" }, hk, hb, nowB)));
      adm.append(statsBlock());
    }

    // Μετρήσεις κλικ (0031): σύνολα ανά ενέργεια, σελίδα και σημείο. Φορτώνει μόνο όταν ανοίξει.
    let statDays = 30, statOpen = false;
    function statsBlock() {
      const EV = { ask: "Ερωτήσεις «Ρώτα μας»", call: "Κλήσεις", whatsapp: "WhatsApp", viber: "Viber", directions: "Οδηγίες χάρτη", calc: "Υπολογισμοί τιμής", track: "Αναζητήσεις δέματος", email: "Email" };
      const body = h("div", {}, h("p", { class: "muted" }, "Φόρτωση…"));
      const det = h("details", { class: "adm-dest", style: "margin-top:24px" }, h("summary", {}, h("b", {}, "Μετρήσεις"), h("span", { class: "muted" }, " · κλικ σε κλήση, WhatsApp, Viber, οδηγίες, υπολογισμό")), body);
      det.open = statOpen;
      const load = async () => {
        body.textContent = "";
        const from = new Date(Date.now() - (statDays - 1) * 864e5).toISOString().slice(0, 10);
        let rows, live, test;
        try {
          // 0032: τα σύνολα τα βγάζει η βάση (χωρίς όριο γραμμών). Αλλιώς, οι γραμμές του πίνακα.
          try {
            const sm = await api("/rest/v1/rpc/site_clicks_summary", { method: "POST", body: JSON.stringify({ p_days: statDays }) });
            rows = sm; live = sm.filter(r => r.n > 0).map(r => ({ ...r, n: Number(r.n) })); test = sm.reduce((a, r) => a + Number(r.test || 0), 0);
          } catch (e1) {
            if (!/site_clicks_summary|PGRST202|42883|404|Τρέξτε πρώτα/.test(e1.message)) throw e1;
            rows = await api(`/rest/v1/site_clicks?day=gte.${from}&select=day,event,page,spot,n&order=day.desc&limit=1000`);
            live = rows.filter(r => !r.page.startsWith("dokimi/")); test = rows.filter(r => r.page.startsWith("dokimi/")).reduce((a, r) => a + r.n, 0);
          }
        }
        catch (e) { body.append(h("p", { class: "notice warn" }, /0031|site_clicks|does not exist|PGRST205|42P01/.test(e.message) ? "Τρέξτε πρώτα το 0031_site_clicks.sql στο Supabase." : e.message)); return; }
        const sel = h("select", {}, [7, 30, 90, 365].map(d => h("option", { value: d, selected: d === statDays }, `Τελευταίες ${d} μέρες`)));
        sel.addEventListener("change", () => { statDays = +sel.value; load(); });

        const sum = (arr, key) => { const m = new Map(); arr.forEach(r => m.set(key(r), (m.get(key(r)) || 0) + r.n)); return [...m].sort((a, b) => b[1] - a[1]); };
        const tbl = (title, pairs) => h("div", { class: "panel", style: "padding:14px" }, h("b", {}, title),
          pairs.length ? h("table", { class: "data two", style: "margin-top:8px" }, h("tbody", {}, pairs.slice(0, 15).map(([k, n]) => h("tr", {}, h("td", {}, k), h("td", { class: "num", style: "text-align:right" }, String(n))))))
            : h("p", { class: "muted", style: "margin-top:6px" }, "Καμία μέτρηση ακόμα."));
        body.append(h("div", { style: "display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px" }, sel,
            h("span", { class: "muted", style: "font-size:14px" }, test ? `(${test} κλικ από τη δοκιμαστική έκδοση δεν μετράνε εδώ)` : "")),
          h("div", { class: "grid g3", style: "gap:12px" },
            tbl("Ανά ενέργεια", sum(live, r => EV[r.event] || r.event)),
            tbl("Ανά σελίδα", sum(live, r => r.page || "index")),
            tbl("Ανά σημείο", sum(live, r => `${EV[r.event] || r.event} · ${r.spot || "—"}`))));
      };
      det.addEventListener("toggle", () => { statOpen = det.open; if (det.open) load(); });
      if (det.open) load();
      return det;
    }

    function destCard(d) {
      const mark = () => { dD.add(d.id); renderDest(); };
      const inp = (key, ph, w) => { const i = h("input", { value: d[key] || "", placeholder: ph || "" }); if (w) i.style.maxWidth = w; i.addEventListener("change", () => { d[key] = i.value.trim(); mark(); }); return i; };
      const how = h("select", {}, HOW.map(([v, l]) => h("option", { value: v, selected: howOf(d) === v }, l)));
      how.addEventListener("change", () => { const [t, hb] = how.value.split(":"); d.type = t; d.hub = hb || null; openG.add(t); dD.add(d.id); renderDest(); const n = [...adm.querySelectorAll(".adm-card input")].find(x => x.value === d.name); if (n) n.closest(".adm-card").scrollIntoView({ block: "center" }); });
      const tsel = h("select", {}, h("option", { value: "", selected: !d.tariff }, d.type === "transfer" && SITE.HUBS[d.hub] ? `Όπως ο σταθμός (${(TF.find(t => t.key === SITE.HUBS[d.hub].tariff) || {}).label || ""})` : "— (ρωτήστε)"),
        TF.map(t => h("option", { value: t.key, selected: d.tariff === t.key }, t.label)));
      tsel.addEventListener("change", () => { d.tariff = tsel.value || null; mark(); });
      const sch = h("input", { value: (d.sched || []).join(", "), placeholder: "π.χ. ΑΘΗΝΑ", list: "adm-keys" });
      sch.addEventListener("change", () => { d.sched = sch.value.split(/[,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean); mark(); });
      const auto = h("input", { type: "checkbox", checked: !d.days });
      auto.addEventListener("change", () => { d.days = auto.checked ? null : "1111111"; mark(); });
      const days = DAYS.map((x, i) => { const c = h("input", { type: "checkbox", "aria-label": x, checked: d.days ? d.days[i] === "1" : false, disabled: !d.days });
        c.addEventListener("change", () => { const a = (d.days || "0000000").split(""); a[i] = c.checked ? "1" : "0"; d.days = a.join(""); mark(); }); return h("label", { class: "adm-cb" }, h("small", {}, x), c); });
      const sh = h("input", { type: "checkbox", checked: !!d.shown }); sh.addEventListener("change", () => { d.shown = sh.checked; mark(); });
      const del = h("button", { class: "adm-del", type: "button", title: "Διαγραφή", "aria-label": "Διαγραφή" }, "✕");
      del.addEventListener("click", () => { DS = DS.filter(x => x !== d); dD.delete(d.id); if (d.id > 0) rD.add(d.id); renderDest(); });
      const preview = d.days ? maskLabel(d.days.split("").map(x => x === "1"), "el") : (d.sched && d.sched.length ? daysLabel(SITE.SCHEDULE, d.sched) : "");
      return h("div", { class: "adm-card" + (d.shown ? "" : " off") + (dD.has(d.id) ? " changed" : "") },
        h("div", { class: "adm-card-top" }, field("Όνομα", inp("name")), field("Περιοχή", inp("region", "π.χ. Πελοπόννησος")),
          h("label", { class: "adm-cb adm-show", title: "Στη σελίδα" }, h("small", {}, "Στη σελίδα"), sh), del),
        h("div", { class: "adm-grid" }, field("Πώς πάει", how), field("Τιμοκατάλογος", tsel),
          field("Λεωφορεία (δρομολόγια)", sch),
          h("div", { class: "adm-f wide" }, h("span", {}, "Μέρες δρομολογίου" + (preview ? ` · ${preview}` : "")),
            h("div", { class: "adm-days" }, h("label", { class: "adm-auto" }, auto, " από τα δρομολόγια"), ...days)),
          field("Παράδοση", inp("eta", "π.χ. Την ίδια μέρα, με τα δρομολόγια που αναγράφονται"), true),
          field("Σταθμός παραλαβής στον προορισμό", inp("terminal", "π.χ. ΚΤΕΛ Κηφισού")), field("Διεύθυνση σταθμού", inp("terminal_addr", "π.χ. Κηφισού 100, Αθήνα")), field("Τηλέφωνο σταθμού", inp("terminal_phone", "π.χ. 210 5124910")),
          field("Σημείωση", inp("note", "προαιρετικό"), true)));
    }

    async function saveDest() {
      const names = new Set();
      for (const d of DS) { const n = norm(d.name || ""); if (n.length < 2) { say("warn", "Υπάρχει προορισμός χωρίς όνομα."); return renderDest(); } if (names.has(n)) { say("warn", `Ο προορισμός «${d.name}» υπάρχει δύο φορές.`); return renderDest(); } names.add(n); }
      const noT = DS.filter(d => dD.has(d.id) && (d.type === "direct" || d.type === "local") && !d.tariff);
      if (noT.length) { say("warn", `Διαλέξτε τιμοκατάλογο για: ${noT.map(d => d.name).join(", ")}.`); return renderDest(); }
      if (TF.some(t => !t.label)) { say("warn", "Κάθε στήλη τιμών χρειάζεται όνομα."); return renderDest(); }
      try {
        for (const t of TF.filter(x => dT.has(x.key))) await api("/rest/v1/site_tariffs", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key: t.key, label: t.label, p: t.p || {}, sort: TF.indexOf(t), updated_at: new Date().toISOString() }) });
        for (const id of rD) await api("/rest/v1/site_destinations?id=eq." + id, { method: "DELETE" });
        for (const d of DS.filter(x => dD.has(x.id))) {
          const body = { name: d.name.trim(), region: d.region || "", type: d.type, tariff: d.tariff || null, hub: d.type === "transfer" ? d.hub : null, sched: d.sched || [], days: d.days || null, eta: d.eta || null, note: d.note || null, terminal: d.terminal || null, terminal_addr: d.terminal_addr || null, terminal_phone: d.terminal_phone || null, shown: !!d.shown, updated_at: new Date().toISOString() };
          if (d.id > 0) await api("/rest/v1/site_destinations?id=eq." + d.id, { method: "PATCH", body: JSON.stringify(body) });
          else await api("/rest/v1/site_destinations", { method: "POST", body: JSON.stringify(body) });
        }
        for (const k of rT) await api("/rest/v1/site_tariffs?key=eq." + encodeURIComponent(k), { method: "DELETE" });
        say("ok", "Αποθηκεύτηκαν." + await publish());
        await loadDest();
      } catch (e) { say("bad", "Δεν αποθηκεύτηκαν όλα: " + e.message); renderDest(); }
    }
    sess ? load() : loginView();
  }
  // @admin-end


  // ---------- «Το ταξίδι του δέματος» (αρχική) ----------
  const jr = $("[data-journey]");
  if (jr) {
    const sel = $("[data-j-dest]", jr), steps = $$(".j-steps > li", jr), parcel = $(".j-parcel", jr), calcA = $("[data-j-calc]", jr);
    const set = (k, main, sub) => { const li = $(`[data-j="${k}"]`, jr); $(".j-main", li).textContent = main; const sb = $(".j-sub", li); sb.textContent = ""; sb.append(...[sub].flat().filter(x => x != null && x !== "")); };
    const fill = () => {
      const d = SITE.DESTINATIONS.find(x => x.name === sel.value); if (!d) return;
      const now = athensNow();
      const dep = nextDepartures(SITE.SCHEDULE, d.sched || [], now, 30, LANG).map(x => ({ ...x, drop: dropOff(B, x.dow, x.time) }))
        .find(x => x.rel * 1440 + x.drop.min > now.minutes && !x.drop.early && openFor(B, now.ymd, x));
      const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
      if (dep) {
        const dayTxt = dep.rel < 2 ? dep.day.toLowerCase() : T("την ", "on ") + dep.day;
        set("drop", dep.drop.same ? T(`${cap(dayTxt)}, έως τις ${dep.drop.by}`, `${cap(dayTxt)}, by ${dep.drop.by}`)
                                   : (dep.rel === 1 ? T(`Σήμερα το βράδυ, έως τις ${dep.drop.by}`, `This evening, by ${dep.drop.by}`) : T(`Το προηγούμενο βράδυ, έως τις ${dep.drop.by}`, `The evening before, by ${dep.drop.by}`)),
          T(`Στο ταμείο της αποθήκης, για το λεωφορείο των ${dep.time}.`, `At the depot counter, for the ${dep.time} bus.`));
        set("go", T(`${cap(dayTxt)} στις ${dep.time}`, `${cap(dayTxt)} at ${dep.time}`), L(d.eta || ""));
      } else {
        set("drop", T("Ρωτήστε μας για την επόμενη αναχώρηση", "Ask us about the next departure"), "");
        set("go", T("Με το επόμενο δρομολόγιο", "On the next scheduled bus"), L(d.eta || ""));
      }
      const tf = SITE.TARIFFS[tariffKey(SITE, d)] || { p: {} };
      set("pay", [tf.p.fakelos != null ? T("Φάκελος ", "Envelope ") + eur(tf.p.fakelos) : "", tf.p.mikro != null ? T("μικρό κουτί ", "small box ") + eur(tf.p.mikro) : ""].filter(Boolean).join(" · ") || T("Ρωτήστε μας", "Ask us"),
        T("Ενδεικτικά. Η τελική τιμή βγαίνει στο ταμείο.", "Indicative. The final price is set at the counter."));
      const tels = d.terminalPhone ? String(d.terminalPhone).split(/\s*[,;]\s*/).flatMap((n, i) => [i ? ", " : "", h("a", { class: "num", href: "tel:" + n.replace(/[^\d+]/g, "").replace(/^(?!\+)/, "+30") }, n)]) : [];
      set("get", L(d.terminal) || T("Στο ΚΤΕΛ του προορισμού", "At the destination bus station"),
        [d.terminalAddr ? L(d.terminalAddr) : null, d.terminalAddr && tels.length ? " · " : null, ...tels, (d.terminalAddr || tels.length) ? h("br") : null, T("Με ταυτότητα. Μπορεί να το πάρει και άλλος, με τη δική του.", "With ID. Someone else can collect it with their own ID.")]);
      if (calcA) calcA.href = calcA.href.replace(/\?to=[^#]*/, "?to=" + encodeURIComponent(d.name));
      steps.forEach((li, i) => li.style.setProperty("--n", i));
    };
    // Το δέμα «ταξιδεύει» από βήμα σε βήμα (κίνηση μόνο με transform· χωρίς κίνηση αν ο χρήστης το έχει ζητήσει).
    let timers = [], at = 0;
    // Ο κόμβος «ανάβει» όταν φτάσει το δέμα (transitionend), όχι όταν ξεκινά.
    const place = i => { if (!parcel.offsetParent) return;   // κρυμμένο (λιγότερη κίνηση / εκτύπωση): τίποτα να μετακινηθεί
      const n = $(".j-node", steps[i]), box = parcel.offsetParent.getBoundingClientRect(), r = n.getBoundingClientRect();
      parcel.style.transform = `translate(${r.left - box.left + r.width / 2 - parcel.offsetWidth / 2}px, ${r.top - box.top + r.height / 2 - parcel.offsetHeight / 2}px)`; at = i;
      if (i === 0) steps.forEach((li, j) => li.classList.toggle("on", j === 0)); };
    parcel.addEventListener("transitionend", e => { if (e.propertyName === "transform") steps.forEach((li, j) => li.classList.toggle("on", j <= at)); });
    let ran = false;
    const run = () => { timers.forEach(clearTimeout); timers = []; ran = true;
      if (REDUCED) { steps.forEach(li => li.classList.add("on")); jr.classList.add("still"); return; }
      place(0); steps.forEach((_, i) => { if (i) timers.push(setTimeout(() => place(i), 300 + i * 720)); }); };
    // Αλλαγή προορισμού: δεν ξανατρέχει η διαδρομή· τα κείμενα αλλάζουν απαλά.
    sel.addEventListener("change", () => { fill(); if (!ran) return run(); jr.classList.remove("swap"); void jr.offsetWidth; jr.classList.add("swap"); });
    addEventListener("resize", () => { parcel.style.transition = "none"; place(at); parcel.offsetWidth; parcel.style.transition = ""; }, { passive: true });
    fill(); onSchedule(fill);
    if ("IntersectionObserver" in window && !REDUCED) {
      parcel.style.transition = "none"; place(0); parcel.offsetWidth; parcel.style.transition = "";
      const jo = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { run(); jo.disconnect(); } }, { threshold: 0.4 }); jo.observe(jr);
    } else run();
  }
  // ---------- Κίνηση: εμφάνιση στο σκρολάρισμα, χάρτης διαδρομών, μετρητές ----------
  if ("IntersectionObserver" in window) {
    // Μόνο ό,τι είναι κάτω από την οθόνη όταν φορτώνει: ό,τι ήδη φαίνεται δεν κρύβεται ποτέ.
    const sel = ".section > .wrap > *:not(.signs):not(.routes-map), .section .signs > li, .cta-band .wrap > *";
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    // Με «λιγότερη κίνηση» δεν κρύβουμε τίποτα: το περιεχόμενο είναι απλώς εκεί.
    // Μετά την πρώτη ζωγραφική (rAF → setTimeout): οι θέσεις διαβάζονται από έτοιμη διάταξη, όχι με αναγκαστικό υπολογισμό μέσα στο script.
    // Κρύβονται μόνο όσα είναι κάτω από την οθόνη, άρα ο επισκέπτης δεν βλέπει διαφορά.
    const afterPaint = fn => requestAnimationFrame(() => setTimeout(fn, 0));
    if (!REDUCED) afterPaint(() => {
      // Πρώτα διαβάζουμε όλες τις θέσεις, μετά γράφουμε (χωρίς επαναλαμβανόμενους υπολογισμούς διάταξης).
      const els = $$(sel).filter(el => !el.closest(".hero")), tops = els.map(el => el.getBoundingClientRect().top);
      els.forEach((el, i) => { if (tops[i] < innerHeight) return;
        el.style.setProperty("--rv", Math.min([...el.parentElement.children].indexOf(el), 4)); el.classList.add("rv"); io.observe(el); });
      // Αν ο χρήστης πηδήξει πιο κάτω (σύνδεσμος, αναζήτηση στη σελίδα), ό,τι προσπέρασε εμφανίζεται κι αυτό.
      let raf = 0;
      const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0;
        const left = $$(".rv:not(.in)"); if (!left.length) return removeEventListener("scroll", onScroll);
        for (const el of left) if (el.getBoundingClientRect().top < innerHeight) { el.classList.add("in"); io.unobserve(el); } }); };
      addEventListener("scroll", onScroll, { passive: true });
    });
    // Χάρτης: στο κινητό η λίστα πόλεων είναι ο κύριος τρόπος επιλογής (ανοιχτή)· το «Παράλειψη χάρτη» ανοίγει τη λίστα και πάει την εστίαση εκεί.
    for (const dl of $$("details.map-list")) if (matchMedia("(max-width: 600px)").matches) dl.open = true;
    for (const sk of $$(".skip-map")) sk.addEventListener("click", e => {
      const dl = $("#map-list"); if (!dl) return; e.preventDefault(); dl.open = true;
      const first = dl.querySelector("summary"); first.focus(); first.scrollIntoView({ block: "start", behavior: REDUCED ? "auto" : "smooth" });
    });
    afterPaint(() => { for (const fig of $$("[data-routes]")) {
      if (REDUCED || fig.getBoundingClientRect().top < innerHeight * 0.8) { fig.classList.add("in"); continue; }
      fig.classList.add("armed");
      const mo = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { fig.classList.add("in"); mo.disconnect(); } }, { threshold: 0.35 });
      mo.observe(fig);
    } });
  }

  // ---------- 💬 «Ρώτα μας»: γρήγορες απαντήσεις από τα δεδομένα του σάιτ (χωρίς AI, χωρίς αποθήκευση ερωτήσεων) ----------
  // Χτίζεται όταν ο browser ησυχάσει (όχι μέσα στο πρώτο φόρτωμα): το κουμπί είναι fixed, άρα δεν μετακινεί τη σελίδα.
  const idle = fn => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 300));
  if (!/diaxeirisi|admin/.test(location.pathname)) idle(() => {
    const DAYS = T(["Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"], ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    const TRACK = LANG === "en" ? "track" : "anazitisi", OIL = LANG === "en" ? "olive-oil" : "ladi";
    const LUG = LANG === "en" ? "luggage-storage" : "fylaxi-aposkevon", HOMEP = LANG === "en" ? "home-delivery" : "spiti";
    const lz = s => loose(/[a-z]/i.test(s) ? toGreek(s) : s);
    // Λέξεις-κλειδιά προορισμών (ελληνικά + αγγλικά), χωρίς παρενθέσεις
    const DIX = SITE.DESTINATIONS.filter(d => d.name !== "Αγρίνιο").map(d => {
      const names = [d.name, SITE.EN[d.name]].filter(Boolean).flatMap(n => [n, n.replace(/\s*\(.*\)/, ""), (n.match(/\(([^)]+)\)/) || [])[1]]).filter(Boolean);
      return { d, keys: [...new Set(names.map(lz).filter(k => k.length >= 3))] };
    });
    const findCity = txt => {
      const t = lz(txt), words = t.split(/[^a-zα-ω0-9]+/).filter(w => w.length >= 4);
      let best = null, bestLen = 0;
      for (const x of DIX) for (const k of x.keys) {
        const hit = t.includes(k) || words.some(w => k.startsWith(w) || (w.length >= 5 && w.startsWith(k.slice(0, Math.max(4, k.length - 2)))));
        if (hit && k.length > bestLen) { best = x.d; bestLen = k.length; }
      }
      return best;
    };
    // μονολεκτικά κλειδιά ταιριάζουν στην ΑΡΧΗ λέξης (αλλιώς το «ώρα» βρίσκεται μέσα στο «τώρα»)
    const has = (txt, list) => { const t = lz(txt), ws = t.split(/[^a-zα-ω0-9]+/).filter(Boolean); return list.some(w => /[^a-zα-ω0-9]/.test(w) ? t.includes(w) : ws.some(x => x.startsWith(w))); };
    // Λέξεις-κλειδιά σε φυσική γραφή· περνούν από την ίδια απλοποίηση με την ερώτηση (τόνοι, ι/η/υ, greeklish).
    const KW = {
      track: ["έφτασε", "ήρθε", "δέμα μου", "δέματός μου", "αναζήτηση", "βρίσκεται", "πού είναι το", "track", "arrived", "αριθμό απόδειξης"],
      hours: ["ωράριο", "ανοιχτά", "ανοιχτοί", "κλειστά", "κλείνετε", "ανοίγετε", "κυριακή", "σάββατο", "αργία", "αργίες", "γιορτή", "hours", "opening", "closed", "close", "open", "what time do you"],
      phone: ["τηλέφωνο", "τηλέφωνό", "τηλ ", "κινητό σας", "να σας πάρω", "να σας καλέσω", "phone", "call you", "number"],
      where: ["πού είστε", "διεύθυνση", "πώς θα έρθω", "πώς έρχομαι", "χάρτη", "πάρκινγκ", "parking", "where", "address", "οδηγίες"],
      price: ["πόσο", "τιμή", "τιμές", "κοστίζει", "κόστος", "χρέωση", "price", "cost", "how much", "€", "ευρώ"],
      oil: ["λάδι", "λαδιού", "τενεκέ", "τενεκές", "ελαιόλαδο", "olive"],
      lug: ["αποσκευ", "βαλίτσα", "βαλίτσες", "luggage", "suitcase"],
      pack: ["συσκευασία", "πακετάρ", "κούτα", "κούτες", "χαρτοκιβώτιο", "packing"],
      home: ["σπίτι", "κατ' οίκον", "πόρτα μου", "delivery", "courier", "asap"],
      store: ["φύλαξη", "πόσες μέρες", "πόσο καιρό", "κρατάτε", "storage"],
      when: ["πότε", "ώρα", "ώρες", "φεύγει", "φεύγουν", "δρομολόγ", "λεωφορεί", "αναχώρ", "να στείλω", "στέλνω", "στείλω", "μπορώ", "πρέπει", "να το φέρω", "when", "departure", "next bus"],
      tomorrow: ["αύριο", "tomorrow"],
    };
    const RX = Object.fromEntries(Object.entries(KW).map(([k, words]) => [k, words.map(w => lz(w)).filter(w => w.length >= 3)]));
    const say = (...kids) => kids.flat().filter(Boolean);
    const btn = (href, txt, cls = "btn btn-ghost") => h("a", { class: cls, href }, txt);
    const waBtn = q => h("a", { class: "btn btn-wa", href: "https://wa.me/30" + B.mobile + (q ? "?text=" + encodeURIComponent(q) : ""), target: "_blank", rel: "noopener" }, "WhatsApp");
    const callBtn = () => h("a", { class: "btn btn-ghost", href: "tel:+30" + B.phone }, T("Κλήση ", "Call ") + B.phoneDisplay);
    const row = (...k) => h("div", { class: "ask-acts" }, ...k);

    const deps = (d, tomorrow) => {
      const keys = d.sched && d.sched.length ? d.sched : (d.type === "transfer" && SITE.HUBS[d.hub] ? SITE.HUBS[d.hub].sched : null);
      if (!keys) return [];
      const now = athensNow();
      return nextDepartures(SITE.SCHEDULE, keys, now, 40, LANG).map(x => ({ ...x, drop: dropOff(B, x.dow, x.time) }))
        .filter(x => x.rel * 1440 + x.drop.min > now.minutes && !x.drop.early && openFor(B, now.ymd, x) && (!tomorrow || x.rel >= 1)).slice(0, 3);
    };
    const dropTxt = x => {
      if (x.drop.same) return T(`φέρτε το έως τις ${x.drop.by}`, `bring it by ${x.drop.by}`);
      const r = x.rel + x.drop.dayOffset;
      const when = r === 0 ? T("απόψε", "tonight") : r === 1 ? T("αύριο το βράδυ", "tomorrow evening") : T(`${DAYS[(x.dow + 6) % 7]} βράδυ`, `${DAYS[(x.dow + 6) % 7]} evening`);
      return T(`φέρτε το ${when} έως τις ${x.drop.by}`, `bring it ${when} by ${x.drop.by}`);
    };
    const priceLine = d => {
      const tf = SITE.TARIFFS[tariffKey(SITE, d)]; if (!tf) return null;
      const p = tf.p, bits = [p.fakelos != null && T(`φάκελος ${eur(p.fakelos)}`, `envelope ${eur(p.fakelos)}`), p.mikro != null && T(`μικρό κουτί ${eur(p.mikro)}`, `small box ${eur(p.mikro)}`)].filter(Boolean);
      return bits.length ? T("Τιμή: ", "Price: ") + bits.join(" · ") + (d.type === "transfer" ? T(" + χρέωση ανταπόκρισης", " + connection fee") : "") + "." : null;
    };
    const calcBtn = d => btn(`${CALC}.html?to=${encodeURIComponent(d.name)}#ypologismos`, T("Ακριβής τιμή", "Exact price"), "btn btn-primary");

    const ansCity = (d, txt) => {
      const nm = L(d.name);
      if (d.type === "none") return say(h("p", {}, T(`${nm}: δυστυχώς δεν εξυπηρετείται. Ρωτήστε μας αν υπάρχει άλλος τρόπος.`, `${nm}: sorry, not served. Ask us if there's another way.`)), row(waBtn(T(`Γεια σας, θέλω να στείλω δέμα. Προορισμός: ${nm}.`, `Hello, I'd like to send a parcel to ${nm}.`)), callBtn()));
      if (d.type === "ask") return say(h("p", {}, T(`${nm}: ρωτήστε μας πρώτα, να σας πούμε πώς και πότε.`, `${nm}: ask us first and we'll tell you how and when.`)), row(callBtn(), waBtn(T(`Γεια σας, στέλνετε δέματα; Προορισμός: ${nm}.`, `Hello, do you send parcels to ${nm}?`))));
      if (has(txt, RX.price) && !has(txt, RX.when)) return ansPrice(d);
      const tom = has(txt, RX.tomorrow), list = deps(d, tom), hub = d.type === "transfer" ? SITE.HUBS[d.hub] : null;
      const out = [];
      if (hub) out.push(h("p", {}, T(`${nm}: πάει με ανταπόκριση · ${L(hub.label)}. `, `${nm}: travels via a connection · ${L(hub.label)}. `), L(hub.eta) || ""));
      if (list.length) {
        out.push(h("p", {}, hub ? T(`Επόμενα λεωφορεία · ${L(hub.label)}:`, `Next buses · ${L(hub.label)}:`) : T(`${nm} · επόμενα λεωφορεία:`, `${nm} · next buses:`)));
        out.push(h("ul", { class: "ask-deps" }, list.map(x => h("li", {}, h("b", {}, `${x.day} ${x.time}`), x.express ? h("small", {}, " Express") : null, h("span", {}, " · " + dropTxt(x))))));
      } else out.push(h("p", {}, T(`${nm}: ρωτήστε μας για την επόμενη αναχώρηση.`, `${nm}: ask us about the next departure.`)));
      if (!hub && d.eta) out.push(h("p", { class: "muted" }, L(d.eta).replace(/\.*$/, ".")));
      const pl = priceLine(d); if (pl) out.push(h("p", {}, pl));
      out.push(row(calcBtn(d), waBtn(T(`Γεια σας, θέλω να στείλω δέμα. Προορισμός: ${nm}.`, `Hello, I'd like to send a parcel to ${nm}.`))));
      return out;
    };
    const ansPrice = d => {
      const tf = SITE.TARIFFS[tariffKey(SITE, d)]; if (!tf) return ansCity(d, "ποτε");
      const rows = SITE.CATEGORIES.filter(c => tf.p[c.id] != null).map(c => h("li", {}, h("span", {}, L(c.name)), h("b", {}, eur(tf.p[c.id]))));
      return say(h("p", {}, T(`${L(d.name)} · ενδεικτικές τιμές ανά τεμάχιο, με ΦΠΑ:`, `${L(d.name)} · indicative prices per item, VAT included:`)),
        h("ul", { class: "ask-prices" }, rows), d.type === "transfer" ? h("p", { class: "muted" }, T("Συν τη χρέωση της ανταπόκρισης.", "Plus the connection fee.")) : null,
        h("p", { class: "muted" }, T("Η τελική τιμή βγαίνει στο ταμείο, μετά από ζύγισμα.", "The final price is set at the counter after weighing.")), row(calcBtn(d)));
    };
    const ansOil = d => {
      const pk = (SITE.PACKING.items || []).find(i => i.id === "tenekes");
      const tf = d && SITE.TARIFFS[tariffKey(SITE, d)];
      const ath = SITE.TARIFFS[tariffKey(SITE, findDest(SITE.DESTINATIONS, "Αθήνα") || {})];
      return say(h("p", {}, d && tf && tf.p.tenekes != null ? T(`Τενεκές λαδιού · ${L(d.name)}: ${eur(tf.p.tenekes)}.`, `Olive oil tin · ${L(d.name)}: ${eur(tf.p.tenekes)}.`)
          : ath && ath.p.tenekes != null ? T(`Ναι! Ο τενεκές για Αθήνα κοστίζει ${eur(ath.p.tenekes)}. Γράψτε μου την πόλη για άλλη τιμή.`, `Yes! A tin to Athens costs ${eur(ath.p.tenekes)}. Tell me the town for another price.`) : T("Ναι, στέλνουμε τενεκέδες λαδιού.", "Yes, we send olive oil tins.")),
        h("p", {}, T("Ταξιδεύει όρθιος, μέσα σε χαρτοκιβώτιο.", "It travels upright, inside a cardboard box."), pk && pk.service ? T(` Αν δεν έχετε κούτα, τον συσκευάζουμε εμείς με ${eur(pk.service)}.`, ` No box? We pack it for ${eur(pk.service)}.`) : ""),
        row(btn(`${OIL}.html#syskevasia`, T("Πώς τον συσκευάζω", "How to pack it")), d ? calcBtn(d) : null));
    };
    const ansHours = () => say(h("p", {}, T("Είμαστε ανοιχτά:", "We are open:")), h("ul", { class: "ask-prices" }, B.hours.map(x => h("li", {}, h("span", {}, L(x.days)), h("b", {}, x.time)))),
      B.holidaysNote ? h("p", { class: "muted" }, L(B.holidaysNote)) : null);
    const ansWhere = () => say(h("p", {}, T(`Μέσα στον υπεραστικό σταθμό ΚΤΕΛ Αγρινίου (${B.address.street}), δεξιά από την είσοδο του σταθμού.`, `Inside the KTEL intercity bus station in Agrinio (${L(B.address.street)}), to the right of the station entrance.`)),
      row(btn(B.mapsUrl, T("Οδηγίες στον χάρτη", "Get directions"), "btn btn-primary")));
    const ansTrack = () => say(h("p", {}, T("Βάλτε τον αριθμό απόδειξης και τα 3 πρώτα γράμματα του επωνύμου του παραλήπτη, και θα δείτε αν έφτασε. Θα πάρετε και SMS όταν φτάσει.", "Enter the receipt number and the first 3 letters of the recipient's surname to see if it has arrived. You also get an SMS when it does.")),
      row(btn(`${TRACK}.html`, T("Αναζήτηση δέματος", "Track a parcel"), "btn btn-primary")));
    const ansLug = () => say(h("p", {}, T(`Φυλάμε αποσκευές με ${eur(SITE.LUGGAGE.perPiecePerDay)} ανά κομμάτι την ημέρα, στις ώρες λειτουργίας.`, `We store luggage for ${eur(SITE.LUGGAGE.perPiecePerDay)} per piece per day, during opening hours.`)), row(btn(`${LUG}.html`, T("Περισσότερα", "More"))));
    const ansStore = () => say(h("p", {}, T(`Το δέμα σας περιμένει δωρεάν ${SITE.STORAGE.freeDays} μέρες. Μετά ${eur(SITE.STORAGE.perDay)} την ημέρα, έως ${eur(SITE.STORAGE.cap)} συνολικά.`, `Your parcel waits free for ${SITE.STORAGE.freeDays} days. After that ${eur(SITE.STORAGE.perDay)} a day, up to ${eur(SITE.STORAGE.cap)} in total.`)));
    const ansPack = () => say(h("p", {}, T("Ναι: το συσκευάζουμε εμείς, ή αγοράζετε μόνο την κούτα και το πακετάρετε στον πάγκο.", "Yes: we pack it for you, or buy just the box and pack it at the counter.")), row(btn(`${CALC}.html#syskevasia`, T("Τιμές συσκευασίας", "Packing prices"))));
    const ansHome = () => say(h("p", {}, T("Η παράδοση στο σπίτι ξεκινά σύντομα στο Αγρίνιο, και στην Αθήνα με την ASAP Courier. Μέχρι τότε, το δέμα παραλαμβάνεται από τον σταθμό.", "Home delivery starts soon in Agrinio, and in Athens with ASAP Courier. Until then, parcels are collected at the station.")), row(btn(`${HOMEP}.html`, T("Δηλώστε ενδιαφέρον", "Register interest"))));
    const ansPhone = () => say(h("p", {}, T("Τηλέφωνο ", "Phone "), h("a", { href: "tel:+30" + B.phone, class: "num" }, B.phoneDisplay), " · WhatsApp / Viber ", h("a", { href: "https://wa.me/30" + B.mobile, class: "num" }, B.mobileDisplay)), row(callBtn(), waBtn("")));
    const ansBanned = w => say(h("p", {}, h("b", {}, T("Αυτό μάλλον δεν μεταφέρεται. ", "This probably can't be sent. ")), T("Εύφλεκτα, εκρηκτικά, αέρια, χημικά, όπλα, αιχμηρά και ζωντανά ζώα δεν μεταφέρονται με το ΚΤΕΛ. Αν δεν είστε σίγουροι, ρωτήστε μας πριν έρθετε.", "Flammables, explosives, gas, chemicals, weapons, sharp objects and live animals are not carried. If unsure, ask us before you come.")), row(callBtn()));
    const ansUnknown = q => say(h("p", {}, T("Δεν είμαι σίγουρος ότι κατάλαβα. Γράψτε μου μια πόλη (π.χ. «Αθήνα») ή ρωτήστε μας απευθείας:", "I'm not sure I understood. Type a town (e.g. \"Athens\") or ask us directly:")), row(waBtn(q), callBtn()));

    let lastCity = null, want = null;
    const answer = q => {
      const d = findCity(q) || null;
      const digs = q.replace(/\D/g, ""), isPhone = /^(69|2)\d{8}$/.test(digs); // κινητό/σταθερό ≠ αριθμός απόδειξης
      const banned = prohibitedHit(SITE.PROHIBITED, q); if (banned) return ansBanned(banned);
      if ((digs.length >= 8 && !isPhone) || has(q, RX.track)) return ansTrack();
      if (has(q, RX.phone) || isPhone) return ansPhone();
      if (has(q, RX.oil)) { if (d) lastCity = d; return ansOil(d); }
      if (d) { lastCity = d; const w = want; want = null; return w === "price" ? ansPrice(d) : ansCity(d, q); }
      if (has(q, RX.hours)) return ansHours();
      if (has(q, RX.where)) return ansWhere();
      if (has(q, RX.store)) return ansStore();
      if (has(q, RX.lug)) return ansLug();
      if (has(q, RX.pack)) return ansPack();
      if (has(q, RX.home)) return ansHome();
      const short = lz(q).split(/\s+/).filter(Boolean).length <= 3;
      if (has(q, RX.price)) { if (lastCity && short) return ansPrice(lastCity); want = "price"; return say(h("p", {}, T("Για ποια πόλη; Γράψτε μου τον προορισμό.", "Which town? Type the destination."))); }
      if (has(q, RX.when) && (short || !lastCity)) { if (lastCity) return ansCity(lastCity, q); want = "when"; return say(h("p", {}, T("Για ποια πόλη; Γράψτε μου τον προορισμό.", "Which town? Type the destination."))); }
      return ansUnknown(q);
    };

    // Διεπαφή
    const fab = h("button", { type: "button", class: "ask-fab", "aria-expanded": "false", "aria-controls": "ask-panel" }, h("span", { class: "ask-ico", "aria-hidden": "true" }, "?"), h("span", {}, T("Ρωτήστε μας", "Ask us")));
    const log = h("div", { class: "ask-log", "aria-live": "polite" });
    const inp = h("input", { type: "text", id: "ask-q", autocomplete: "off", enterkeyhint: "send", maxlength: "120", placeholder: T("π.χ. Πότε φεύγει για Αθήνα;", "e.g. When is the next bus to Athens?") });
    const form = h("form", { class: "ask-form" }, h("label", { for: "ask-q", class: "sr-only" }, T("Η ερώτησή σας", "Your question")), inp, h("button", { type: "submit", class: "btn btn-primary" }, T("Ρωτήστε", "Ask")));
    const CHIPS = [[T("Πότε φεύγει για Αθήνα;", "Next bus to Athens?")], [T("Πόσο κοστίζει;", "How much is it?")], [T("Έφτασε το δέμα μου;", "Has my parcel arrived?")], [T("Ωράριο", "Opening hours")], [T("Πού είστε;", "Where are you?")], [T("Στέλνετε λάδι;", "Do you send olive oil?")]];
    const chips = h("div", { class: "ask-chips" }, CHIPS.map(([c]) => h("button", { type: "button", class: "ask-chip", onclick: () => ask(c) }, c)));
    const close = h("button", { type: "button", class: "ask-close", "aria-label": T("Κλείσιμο", "Close") }, "×");
    const panel = h("div", { class: "ask-panel", id: "ask-panel", role: "dialog", "aria-modal": "false", "aria-labelledby": "ask-h", hidden: true },
      h("div", { class: "ask-head" }, h("b", { id: "ask-h" }, T("Ρωτήστε μας", "Ask us")), h("small", {}, T("Άμεσες απαντήσεις από τα δρομολόγια και τις τιμές μας", "Instant answers from our schedules and prices")), close),
      log, chips, form, h("p", { class: "ask-foot" }, T("Απαντά αυτόματο σύστημα, όχι άνθρωπος. Δεν κρατάμε τις ερωτήσεις.", "Automatic answers, not a person. We don't keep your questions.")));
    const bubble = (who, kids) => { const b = h("div", { class: "ask-msg " + who }, kids); log.append(b); log.scrollTop = who === "bot" ? Math.max(0, b.offsetTop - 8) : log.scrollHeight; return b; };
    const ask = q => {
      q = String(q || "").trim().slice(0, 120); if (!q) return;
      bubble("me", [h("p", {}, q)]);
      bubble("bot", answer(q));
      ping("ask", "ask");
      inp.value = "";
    };
    let greeted = false, opener = null;
    const open = (on, from) => {
      if (on) opener = from || fab;
      panel.hidden = !on; [fab, ...document.querySelectorAll("[data-ask-open]")].forEach(b => b.setAttribute("aria-expanded", on ? "true" : "false")); document.body.classList.toggle("ask-open", on);
      if (on) { loadLive(); if (!greeted) { greeted = true; bubble("bot", [h("p", {}, T("Γεια σας! Γράψτε μου πού στέλνετε ή τι θέλετε να μάθετε.", "Hello! Tell me where you're sending to, or what you'd like to know."))]); } setTimeout(() => inp.focus({ preventScroll: true }), 50); }
      else { const vis = x => x && x.getClientRects().length > 0, o = vis(opener) ? opener : fab; if (vis(o)) o.focus({ preventScroll: true }); }
    };
    fab.addEventListener("click", () => open(panel.hidden, fab));
    // 5η επιλογή της κάτω μπάρας στο κινητό (το αιωρούμενο «?» κρύβεται εκεί)
    document.querySelectorAll("[data-ask-open]").forEach(b => b.addEventListener("click", () => open(panel.hidden, b)));
    // Πληκτρολόγιο: το Esc κλείνει από οπουδήποτε, και το Tab μένει μέσα στο παράθυρο όσο είναι ανοιχτό.
    addEventListener("keydown", e => {
      if (panel.hidden) return;
      if (e.key === "Escape") { e.preventDefault(); open(false); return; }
      if (e.key !== "Tab") return;
      const f = [...panel.querySelectorAll("button, input, a[href]")].filter(x => !x.disabled && x.getClientRects().length);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (!panel.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    });
    close.addEventListener("click", () => open(false));
    form.addEventListener("submit", e => { e.preventDefault(); ask(inp.value); });
    document.body.append(fab, panel);
  });
})();
