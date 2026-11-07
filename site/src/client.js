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
  const LOCALE = T("el-GR", "en-GB");

  // Μενού κινητού
  const mb = $(".menu-btn"), nav = $(".nav");
  if (mb && nav) mb.addEventListener("click", () => { const o = nav.classList.toggle("open"); mb.setAttribute("aria-expanded", o); });

  // ---------- Πίνακας αναχωρήσεων (αρχική) ----------
  const board = $("[data-board]");
  if (board) {
    const picks = ["ΑΘΗΝΑ", "ΠΑΤΡΑ", "ΘΕΣΣΑΛΟΝΙΚΗ", "ΙΩΑΝΝΙΝΑ", "ΛΕΥΚΑΔΑ", "ΑΡΤΑ", "ΝΑΥΠΑΚΤΟΣ", "ΜΕΣΟΛΟΓΓΙ", "ΑΜΦΙΛΟΧΙΑ", "ΛΑΡΙΣΑ", "ΒΟΛΟΣ", "ΚΑΛΑΜΑΤΑ", "ΠΥΡΓΟΣ", "ΧΑΝΙΑ", "ΗΡΑΚΛΕΙΟ", "ΚΕΡΚΥΡΑ", "ΚΟΖΑΝΗ"];
    const pretty = k => { const d = SITE.DESTINATIONS.find(x => x.sched && x.sched[0] === k); return d ? L(d.name) : k; };
    const draw = () => {
      const now = athensNow();
      const rows = [];
      for (const k of picks) { const [n] = nextDepartures(SITE.SCHEDULE, [k], now, 1, LANG); if (n) rows.push({ k, ...n }); }
      const order = r => Math.min(r.rel, 2) * 1440 + Number(r.time.slice(0, 2)) * 60 + Number(r.time.slice(3));
      rows.sort((a, b) => order(a) - order(b));
      const tb = $("tbody", board); tb.textContent = "";
      for (const r of rows.slice(0, 7)) tb.append(h("tr", {}, h("td", { class: "t" }, r.time), h("td", { class: "d" }, pretty(r.k)), h("td", { class: "x" }, r.rel === 0 ? (r.express ? "Express" : "") : r.day)));
      $("time", board).textContent = new Intl.DateTimeFormat(LOCALE, { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    };
    draw(); setInterval(draw, 30000);
  }

  // ---------- Υπολογιστής κόστους αποστολής ----------
  const calcEl = $("[data-calc]");
  if (calcEl) {
    const OW = SITE.OVERWEIGHT;
    const owHint = OW && OW.enabled ? T(`Πάνω από ${OW.fromKg} κιλά υπάρχει επιβάρυνση ανά κιλό, ανάλογα με τον προορισμό.`, `Over ${OW.fromKg} kg there is a per-kg surcharge that depends on the destination.`) : "";
    const KINDS = [
      { id: "fakelos", name: T("Φάκελος", "Envelope"), sub: T("έγγραφα, έως 1 kg", "documents, up to 1 kg") },
      { id: "box", name: T("Κούτα / δέμα", "Box / parcel"), sub: T("βάλτε διαστάσεις και βάρος", "enter size and weight") },
      { id: "tenekes", name: T("Τενεκές λαδιού", "Olive oil tin"), sub: T("ελαιόλαδο", "olive oil") },
      { id: "tsouvali", name: T("Τσουβάλι", "Sack"), sub: T("έως 30 kg", "up to 30 kg") },
      { id: "arni", name: T("Αρνί", "Lamb"), sub: T("σφαγμένο, συσκευασμένο", "slaughtered, packed") },
    ];
    const groups = [["direct", T("Απευθείας δρομολόγια", "Direct buses")], ["local", T("Εντός Νομού Αιτωλοακαρνανίας", "Within Aetolia-Acarnania")], ["transfer", T("Με ανταπόκριση", "With connection")], ["ask", T("Ρωτήστε μας", "Ask us")], ["none", T("Δεν εξυπηρετούνται", "Not served")]];
    const sel = h("select", { id: "c-dest", required: true }, h("option", { value: "" }, T("Διαλέξτε προορισμό…", "Choose destination…")),
      groups.map(([t, label]) => { const list = SITE.DESTINATIONS.filter(d => d.type === t); return list.length ? h("optgroup", { label }, list.slice().sort((a, b) => L(a.name).localeCompare(L(b.name), LANG)).map(d => h("option", { value: d.name }, L(d.name)))) : null; }));
    const num = (id, label, ph, step = "1") => h("div", { class: "field" }, h("label", { for: id }, label), h("input", { id, type: "number", inputmode: "decimal", min: "0", step, placeholder: ph }));
    const form = h("form", { class: "form panel", novalidate: true },
      h("fieldset", {}, h("legend", { class: "legend" }, T("1. Τι στέλνετε;", "1. What are you sending?")),
        h("div", { class: "choices", style: "margin-top:8px" }, KINDS.map((k, i) => h("label", { class: "choice" }, h("input", { type: "radio", name: "kind", value: k.id, checked: i === 1 }), h("span", {}, k.name, h("small", {}, k.sub)))))),
      h("div", { id: "c-dims-wrap", class: "field" }, h("span", { class: "legend" }, T("2. Διαστάσεις (εκ.) και βάρος", "2. Size (cm) and weight")),
        h("div", { class: "dims" }, num("c-l", T("Μήκος", "Length"), "40"), num("c-w", T("Πλάτος", "Width"), "30"), num("c-h", T("Ύψος", "Height"), "20"), num("c-kg", T("Κιλά", "Kg"), "3", "0.1")),
        h("div", { class: "hint" }, T("Μετρήστε την κούτα κλειστή, μαζί με τη συσκευασία.", "Measure the closed box, including packaging."), owHint ? " " + owHint : "")),
      h("div", { id: "c-skg-wrap", class: "field", hidden: true }, h("label", { for: "c-skg" }, T("2. Βάρος τσουβαλιού (κιλά)", "2. Sack weight (kg)")),
        h("input", { id: "c-skg", type: "number", inputmode: "decimal", min: "0", max: "30", step: "0.1", placeholder: "20" }), owHint ? h("div", { class: "hint" }, owHint) : null),
      h("label", { id: "c-syn-wrap", class: "check", hidden: true }, h("input", { type: "checkbox", id: "c-syn" }), h("span", {}, T("Θα ταξιδέψω κι εγώ με το ίδιο λεωφορείο (συνοδευόμενος τενεκές)", "I will travel on the same bus (accompanied tin)"))),
      h("div", { class: "grid g2" },
        h("div", { class: "field" }, h("label", { for: "c-dest" }, T("3. Προορισμός", "3. Destination")), sel),
        h("div", { class: "field" }, h("label", { for: "c-n" }, T("Τεμάχια", "Items")), h("input", { id: "c-n", type: "number", inputmode: "numeric", min: "1", max: "99", value: "1" }))),
      h("div", { class: "field" }, h("label", { for: "c-desc" }, T("Περιγραφή (προαιρετικά)", "Contents (optional)")), h("input", { id: "c-desc", type: "text", placeholder: T("π.χ. ανταλλακτικά, ρούχα, έγγραφα", "e.g. spare parts, clothes, documents"), autocomplete: "off" }),
        h("div", { class: "hint" }, T("Δεν αλλάζει την τιμή. Μας βοηθά να σας πούμε αν κάτι δεν μπορεί να ταξιδέψει.", "Does not change the price. It helps us tell you if something cannot travel."))));
    const out = h("div", { class: "result", "aria-live": "polite" });
    calcEl.append(h("div", { class: "calc" }, form, out));

    const val = id => $("#" + id).value;
    const contactLine = () => h("p", { style: "margin-top:12px" }, T("Τηλέφωνο ", "Phone "), h("a", { href: "tel:+30" + B.phone, class: "num" }, B.phoneDisplay), " · WhatsApp ", h("a", { href: "https://wa.me/30" + B.mobile, class: "num" }, B.mobileDisplay));
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
      const oversize = () => { card.append(h("div", { class: "notice warn" }, h("b", {}, T("Μεγάλο ή βαρύ δέμα", "Large or heavy item")), T("Ξεπερνά τα 80 × 60 × 60 εκ. ή τα 30 κιλά. Καλέστε μας για τιμή και για το αν χωράει στο λεωφορείο.", "It exceeds 80 × 60 × 60 cm or 30 kg. Call us for a price and to check it fits on the bus.")), contactLine()); if (warnHit) out.append(warnHit); };

      let catId = kind, classed = null, kg = 0;
      if (isBox) {
        const dims = [val("c-l"), val("c-w"), val("c-h")];
        const filled = dims.filter(Number).length;
        if (filled > 0 && filled < 3) { card.append(h("p", { class: "muted" }, T("Συμπληρώστε και τις τρεις διαστάσεις.", "Fill in all three dimensions."))); return; }
        classed = classifyBox(SITE.CATEGORIES, filled === 3 ? dims : [], val("c-kg"), kind === "fakelos" ? "fakelos" : "mikro", SITE.SIZE_RULE.weightBumpsCategory);
        if (classed.oversize) return oversize();
        catId = classed.id; kg = val("c-kg");
      }
      if (kind === "tsouvali") { kg = val("c-skg"); if (Number(kg) > 30) return oversize(); }
      if (kind === "tenekes" && $("#c-syn").checked) catId = "tenekes_syn";
      const dest = val("c-dest");
      const cat = SITE.CATEGORIES.find(c => c.id === catId);
      const byKg = classed && classed.by === "kg" ? h("span", { class: "muted", style: "font-weight:400" }, T(" (λόγω βάρους)", " (by weight)")) : null;
      if (!dest) { card.append(h("span", { class: "eyebrow" }, T("Ενδεικτική τιμή", "Estimated price")), h("p", { class: "muted", style: "margin-top:8px" }, T("Διαλέξτε προορισμό για να δείτε τιμή και επόμενες αναχωρήσεις.", "Choose a destination to see the price and next departures.")), h("dl", { class: "kv" }, h("dt", {}, T("Κατηγορία", "Category")), h("dd", {}, cat ? L(cat.name) : "—", byKg))); if (warnHit) out.append(warnHit); return; }

      const dn = L(dest);
      const q = quote(SITE, { dest, catId, pieces: val("c-n"), kg });
      if (q.status === "none") { card.append(h("div", { class: "notice bad" }, h("b", {}, T(`Δεν στέλνουμε σε ${dn}`, `We do not ship to ${dn}`)), T("Δεν υπάρχει δρομολόγιο ή ανταπόκριση προς τα εκεί από το Αγρίνιο.", "There is no bus or connection there from Agrinio.")), contactLine()); return; }
      if (q.status === "ask" || q.status === "noprice") { card.append(h("div", { class: "notice info" }, h("b", {}, T("Ρωτήστε μας για τιμή", "Ask us for a price")), T(`Για ${dn} η τιμή δίνεται στο ταμείο ή στο τηλέφωνο.`, `For ${dn} we give the price at the counter or by phone.`)), contactLine()); if (warnHit) out.append(warnHit); return; }

      card.append(h("span", { class: "eyebrow" }, q.status === "transfer" ? T("Ενδεικτικό κόστος ΚΤΕΛ Αιτωλοακαρνανίας", "Estimated KTEL Aetolia-Acarnania cost") : T("Ενδεικτική τιμή", "Estimated price")),
        h("div", { class: "price", style: "margin-top:6px" }, h("span", { class: "big" }, eur(q.total)), h("span", { class: "per" }, q.pieces > 1 ? `${q.pieces} × ${eur(q.perPiece)}` : T("ανά τεμάχιο, με ΦΠΑ", "per item, VAT included"))));
      if (q.status === "transfer") card.append(h("div", { class: "notice info" }, h("b", {}, T(`Και περίπου ${eur(q.otherEstimate)} σε φάκελο πάνω στο δέμα`, `Plus about ${eur(q.otherEstimate)} in an envelope on the parcel`)),
        T(`Τα πληρώνει ο αποστολέας και τα παραλαμβάνει το πρακτορείο που συνεχίζει τη μεταφορά από ${L(q.hub.label)}. Σύνολο περίπου ${eur(q.grandEstimate)}.`, `Paid by the sender and collected by the agency that carries it on from ${L(q.hub.label)}. About ${eur(q.grandEstimate)} in total.`)));
      card.append(h("dl", { class: "kv", style: "margin-top:12px" },
        h("dt", {}, T("Κατηγορία", "Category")), h("dd", {}, L(cat.name), byKg),
        h("dt", {}, T("Προορισμός", "Destination")), h("dd", {}, L(q.dest.name)),
        q.extra ? [h("dt", {}, T("Επιβάρυνση βάρους", "Weight surcharge")), h("dd", {}, T(`+${eur(q.extra)} ανά τεμάχιο (βασική ${eur(q.base)}, ${String(q.rate.toFixed(2)).replace(".", ",")} €/kg πάνω από ${OW.fromKg} kg)`, `+${eur(q.extra)} per item (base ${eur(q.base)}, €${q.rate.toFixed(2)}/kg over ${OW.fromKg} kg)`))] : null,
        q.hub ? [h("dt", {}, T("Μέσω", "Via")), h("dd", {}, L(q.hub.label))] : null,
        h("dt", {}, T("Παράδοση", "Delivery")), h("dd", {}, L(q.eta) || "")));
      const keys = q.hub ? q.hub.sched : q.dest.sched;
      if (keys) {
        const cut = B.cutoffMin || 0, now = athensNow();
        const deps = nextDepartures(SITE.SCHEDULE, keys, { ...now, minutes: now.minutes + cut }, 3, LANG);
        const before = t => { const m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) - cut; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
        if (deps.length) card.append(h("div", { style: "margin-top:14px" }, h("span", { class: "eyebrow" }, T("Επόμενες αναχωρήσεις από Αγρίνιο", "Next departures from Agrinio")),
          h("div", { class: "deps", style: "margin-top:6px" }, deps.map(d => h("div", {}, h("span", { class: "num" }, d.time), h("span", {}, d.day), h("span", { class: "muted", style: "font-size:13px" }, T(`φέρτε το έως ${before(d.time)}`, `bring it by ${before(d.time)}`)), d.express ? h("span", { class: "tag info" }, "Express") : null)))));
      }
      if (q.dest.note) card.append(h("p", { class: "muted", style: "margin-top:10px;font-size:14px" }, L(q.dest.note)));
      card.append(breakdown({ q, cat, classed, kg, kind }));
      card.append(h("p", { class: "muted", style: "margin-top:12px;font-size:13px" }, T("Η τελική τιμή ορίζεται στο ταμείο, μετά από ζύγισμα και μέτρηση. Τιμές ΚΤΕΛ Αιτωλοακαρνανίας με ΦΠΑ.", "The final price is set at the counter after weighing and measuring. KTEL Aetolia-Acarnania prices, VAT included.")));
      if (warnHit) out.append(warnHit);
    };
    // «Πώς υπολογίστηκε»: τα ίδια βήματα με το ταμείο, με τα νούμερα αυτού του δέματος
    const n2 = v => LANG === "en" ? v.toFixed(2) : v.toFixed(2).replace(".", ",");
    const kgS = v => (LANG === "en" ? String(v) : String(v).replace(".", ",")) + " kg";
    const breakdown = ({ q, cat, classed, kg, kind }) => {
      const steps = [];
      const tLabel = L(SITE.TARIFFS[q.hub ? q.hub.tariff : q.dest.tariff].label);
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
      return h("details", { class: "how", open: true }, h("summary", {}, T("Πώς υπολογίστηκε", "How we calculated it")), h("ol", {}, steps.map(s => h("li", {}, s))));
    };

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
    const fmtDT = v => new Intl.DateTimeFormat(LOCALE, { timeZone: "Europe/Athens", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(v));
    const ymd = v => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date(v));
    const show = (cls, title, ...lines) => { out.textContent = ""; out.append(h("div", { class: "notice " + cls }, h("b", {}, title), ...lines.filter(Boolean).map(l => h("div", {}, l)))); };
    const city = c => { const d = c && findDest(SITE.DESTINATIONS, c); return d ? L(d.name) : c; };
    const q = new URLSearchParams(location.search); if (q.get("r")) $("#t-rc").value = q.get("r");
    tr.addEventListener("submit", async e => {
      e.preventDefault();
      const rc = $("#t-rc").value, nm = $("#t-nm").value.trim();
      if (rc.replace(/\D/g, "").length < 10) return show("warn", T("Ελέγξτε τον αριθμό απόδειξης", "Check the receipt number"), T("Γράψτε όλο τον αριθμό της απόδειξης, π.χ. 228-336-12345. Στις χειρόγραφες αποδείξεις: τον κόκκινο αριθμό.", "Enter the full receipt number, e.g. 228-336-12345. On handwritten receipts: the red number."));
      if (nm.replace(/\s/g, "").length < 3) return show("warn", T("Γράψτε 3 γράμματα", "Enter 3 letters"), T("Τα 3 πρώτα γράμματα του επωνύμου του παραλήπτη.", "The first 3 letters of the recipient's surname, as written on the receipt."));
      const btn = $("button", tr); btn.disabled = true; show("info", T("Αναζήτηση…", "Searching…"));
      try {
        const r = await fetch(URL_ + "/rest/v1/rpc/track_parcel", { method: "POST", headers: { apikey: KEY, "content-type": "application/json" }, body: JSON.stringify({ p_receipt: rc, p_name: nm }) });
        if (r.status === 429 || r.status === 400) { const t = await r.text(); if (r.status === 429 || /too_many/.test(t)) return show("warn", T("Πολλές αναζητήσεις", "Too many searches"), T("Για την προστασία των δεδομένων, οι αναζητήσεις είναι περιορισμένες. Δοκιμάστε ξανά σε 15 λεπτά ή καλέστε μας.", "To protect personal data, searches are limited. Try again in 15 minutes or call us.")); throw new Error(t); }
        if (!r.ok) throw new Error(r.status);
        const [x] = await r.json();
        if (!x) return show("warn", T("Δεν βρέθηκε ακόμα", "Not found yet"), T("Αν το δέμα στάλθηκε σήμερα, μπορεί να μην έχει φτάσει ή να μην έχει καταχωρηθεί. Ελέγξτε τον αριθμό και τα γράμματα, ή καλέστε μας.", "If it was sent today, it may not have arrived or been registered yet. Check the number and letters, or call us."));
        const pcs = x.pieces_total > 1 ? T(`Έχουν φτάσει ${x.pieces_in} από ${x.pieces_total} τεμάχια.`, `${x.pieces_in} of ${x.pieces_total} items have arrived.`) : null;
        if (x.state === "here") {
          const f = storageFee(SITE.STORAGE, ymd(x.at), ymd(new Date()));
          show("ok", T("Το δέμα σας έφτασε", "Your parcel has arrived"), T(`Έφτασε ${fmtDT(x.at)}${x.origin ? ", από " + x.origin : ""}.`, `Arrived ${fmtDT(x.at)}${x.origin ? ", from " + city(x.origin) : ""}.`), pcs,
            f.fee > 0 ? T(`Χρέωση φύλαξης μέχρι σήμερα: ${eur(f.fee)} (δωρεάν φύλαξη έως ${f.freeUntil}).`, `Storage charge so far: ${eur(f.fee)} (free storage until ${f.freeUntil}).`) : T(`Δωρεάν φύλαξη έως και ${f.freeUntil}. Φέρτε ταυτότητα.`, `Free storage until ${f.freeUntil}. Bring photo ID.`));
        } else if (x.state === "done") show("info", T("Παραδόθηκε", "Collected"), T(`Το δέμα παραλήφθηκε ${fmtDT(x.at)}.`, `The parcel was collected ${fmtDT(x.at)}.`));
        else if (x.state === "transit") show("info", T("Σε μεταφόρτωση", "In transit"), T(`Πέρασε από το Αγρίνιο ${fmtDT(x.at)} και συνεχίζει προς ${x.dest || "τον προορισμό του"}.`, `Passed through Agrinio ${fmtDT(x.at)} and continues to ${city(x.dest) || "its destination"}.`), pcs);
        else if (x.state === "forwarded") show("info", T("Στάλθηκε", "Sent on"), T(`Έφυγε από το Αγρίνιο προς ${x.dest || "τον προορισμό του"}${x.at ? " " + fmtDT(x.at) : ""}.`, `Left Agrinio for ${city(x.dest) || "its destination"}${x.at ? " " + fmtDT(x.at) : ""}.`));
        else if (x.state === "returned") show("warn", T("Επεστράφη", "Returned"), T("Το δέμα επιστράφηκε στον αποστολέα. Καλέστε μας για πληροφορίες.", "The parcel was returned to the sender. Call us for details."));
        else show("warn", T("Καλέστε μας", "Call us"), T("Δεν μπορούμε να δούμε την κατάσταση του δέματος από εδώ.", "We cannot show this parcel's status here."));
      } catch { show("bad", T("Η αναζήτηση δεν ολοκληρώθηκε", "The search did not complete"), T("Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά, ή καλέστε μας στο ", "Check your connection and try again, or call us on +30 ") + B.phoneDisplay + "."); }
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
      if (!sel.value) return outH.append(h("p", { class: "muted" }, T("Διαλέξτε περιοχή.", "Choose an area.")));
      if (!z) return outH.append(h("div", { class: "notice warn" }, h("b", {}, T("Δεν εξυπηρετείται ακόμα", "Not served yet")), T("Προς το παρόν μόνο εντός της πόλης του Αγρινίου.", "For now, only within the town of Agrinio.")));
      outH.append(h("div", { class: "price" }, h("span", { class: "big" }, eur(z.price)), h("span", { class: "per" }, T("ανά παράδοση ή παραλαβή", "per delivery or pickup"))),
        h("p", { class: "muted", style: "margin-top:6px" }, `${H.hours} · ${L(H.vehicles)}`));
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
        if (el.type === "checkbox") { if (el.dataset.label) lines.push(`${el.dataset.label}: ${el.checked ? T("ΝΑΙ", "YES") : T("ΟΧΙ", "NO")}`); continue; }
        if (el.value.trim()) lines.push(`${el.dataset.label || el.name}: ${el.value.trim()}`);
      }
      const text = lines.join("\n");
      out.textContent = "";
      const pre = h("pre", { class: "panel", style: "white-space:pre-wrap;font:15px/1.5 var(--f-body);margin:0" }, text);
      const copy = h("button", { type: "button", class: "btn btn-ghost" }, T("Αντιγραφή κειμένου", "Copy text"));
      copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(text); copy.textContent = T("Αντιγράφηκε", "Copied"); } catch { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copy.textContent = T("Επιλέχθηκε — πατήστε Αντιγραφή", "Selected — press Copy"); } });
      out.append(h("div", { class: "notice info" }, h("b", {}, T("Το μήνυμά σας είναι έτοιμο", "Your message is ready")), T("Στείλτε το με WhatsApp ή email. Δεν αποθηκεύεται πουθενά στην ιστοσελίδα.", "Send it by WhatsApp or email. Nothing is stored on this website.")), pre,
        h("div", { style: "display:flex;flex-wrap:wrap;gap:10px" },
          h("a", { class: "btn btn-primary", href: "https://wa.me/30" + B.mobile + "?text=" + encodeURIComponent(text), target: "_blank", rel: "noopener" }, T("Αποστολή με WhatsApp", "Send by WhatsApp")),
          h("a", { class: "btn btn-ghost", href: "mailto:" + B.email + "?subject=" + encodeURIComponent(f.dataset.msgform) + "&body=" + encodeURIComponent(text) }, T("Αποστολή με email", "Send by email")), copy));
      out.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
})();
