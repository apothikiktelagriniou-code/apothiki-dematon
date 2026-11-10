// Χτίσιμο ιστοσελίδας: node site/build.mjs            → site/dist (για δημοσίευση)
//                         node site/build.mjs --artifact → site/artifact (πρωτότυπο για προβολή στο Claude)
// Χωρίς εξαρτήσεις. Σελίδες: site/src/pages/*.html (ελληνικά) και site/src/pages-en/*.html (αγγλικά, στο /en/).
// Η πρώτη γραμμή κάθε σελίδας είναι <!--meta {...}-->.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as DATA0 from "./src/data.mjs";
import { FAQ, FAQ_EN } from "./src/faq.mjs";
import { EN, tr } from "./src/en.mjs";
import { SCHEDULE_TIMES } from "../src/schedule-seed.js";
import { SUPABASE_URL, SUPABASE_KEY } from "../src/config.js";
import { daysLabel, destDays, tariffKey, kgRate } from "./src/calc.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = process.argv.includes("--artifact");
const PROTOTYPE = true; // false όταν εγκριθεί και δημοσιευτεί
const EXT = ARTIFACT ? ".html" : "";   // κατάληξη στους συνδέσμους (στο Cloudflare χωρίς .html)
const OUT = join(ROOT, ARTIFACT ? "artifact" : "dist");

// ---------- δεδομένα: από τη διαχείριση (Supabase) αν υπάρχουν, αλλιώς από data.mjs / schedule-seed ----------
// Προορισμοί, τιμοκατάλογος και δρομολόγια αλλάζουν από τις σελίδες διαχείρισης· εδώ τα διαβάζουμε την ώρα του χτισίματος.
// Αν η βάση δεν απαντήσει (ή --offline / --artifact), το σάιτ χτίζεται με τα αρχικά δεδομένα και ΔΕΝ αποτυγχάνει.
const DATA = { ...DATA0 };
// Σταθμοί παραλαβής από τα αρχικά δεδομένα (αν η διαχείριση δεν έχει δικά της, κρατάμε αυτά).
const withTerminals = list => list.map(d => { const tm = (DATA0.TERMINALS || {})[d.name];
  return tm && !d.terminal ? { ...d, terminal: tm.terminal, terminalAddr: tm.addr, terminalPhone: tm.phone } : d; });
DATA.DESTINATIONS = withTerminals(DATA0.DESTINATIONS);
let SCHED = SCHEDULE_TIMES;
async function rpc(name) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
}
if (!ARTIFACT && !process.argv.includes("--offline")) {
  try {
    const cat = await rpc("site_catalog");
    const cats = new Set(DATA0.CATEGORIES.map(c => c.id));
    const T = {};
    for (const t of cat.tariffs || []) {
      if (!t || !/^[a-z0-9_]{1,24}$/.test(t.key) || !t.label) continue;
      const p = {}; for (const id of cats) { const v = t.p && t.p[id]; p[id] = v == null || v === "" || !isFinite(+v) ? null : +v; }
      T[t.key] = { label: t.label, p };
    }
    const TYPES = new Set(["direct", "local", "transfer", "ask", "none"]);
    const dests = (cat.destinations || []).filter(d => d && d.name && TYPES.has(d.type)).map(d => {
      const o = { name: d.name, region: d.region || "", type: d.type, tariff: d.tariff && T[d.tariff] ? d.tariff : null };
      if (d.type === "transfer") { if (!DATA0.HUBS[d.hub]) return null; o.hub = d.hub; }
      if ((d.type === "direct" || d.type === "local") && !o.tariff) { console.warn(`⚠ ${d.name}: χωρίς τιμοκατάλογο → «ρωτήστε»`); o.type = "ask"; }
      if (d.sched && d.sched.length) o.sched = d.sched;
      if (d.days && /^[01]{7}$/.test(d.days)) o.days = d.days;
      if (d.eta) o.eta = d.eta;
      if (d.note) o.note = d.note;
      if (d.terminal) o.terminal = d.terminal;
      if (d.terminal_addr) o.terminalAddr = d.terminal_addr;
      if (d.terminal_phone) o.terminalPhone = d.terminal_phone;
      return o;
    }).filter(Boolean);
    const hubsOk = Object.values(DATA0.HUBS).every(h => T[h.tariff]);
    if (Object.keys(T).length && dests.length && hubsOk) { DATA.TARIFFS = T; DATA.DESTINATIONS = withTerminals(dests); console.log(`Προορισμοί/τιμές από τη διαχείριση: ${dests.length} προορισμοί, ${Object.keys(T).length} στήλες τιμών.`); }
    else console.warn("⚠ Η διαχείριση προορισμών είναι κενή ή ελλιπής — χρησιμοποιούνται τα αρχικά δεδομένα.");
  } catch (e) { console.warn("⚠ Προορισμοί/τιμές: αρχικά δεδομένα (" + e.message + ")"); }
  try {
    const rows = await rpc("site_departures");
    const ok = (rows || []).filter(r => r && r.dest && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) && /^[01]{7}$/.test(r.days));
    if (ok.length) { SCHED = ok.map(r => ({ dest: r.dest, time: r.time, days: r.days, express: !!r.express, conn: !!r.conn, notes: r.notes || null })); console.log(`Δρομολόγια από τη διαχείριση: ${ok.length}.`); }
  } catch (e) { console.warn("⚠ Δρομολόγια: αρχικά δεδομένα (" + e.message + ")"); }
}
const B = DATA.BUSINESS;
if (B.geo) B.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${B.geo.lat},${B.geo.lng}`;
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const eur = n => n == null ? "—" : `${n} €`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "assets"), { recursive: true });

// ---------- assets ----------
for (const f of readdirSync(join(ROOT, "src/assets"))) {
  const src = join(ROOT, "src/assets", f);
  if (statSync(src).isDirectory()) { mkdirSync(join(OUT, "assets", f), { recursive: true }); for (const g of readdirSync(src).filter(g => !g.endsWith(".txt"))) copyFileSync(join(src, g), join(OUT, "assets", f, g)); }
  else copyFileSync(src, join(OUT, "assets", f));
}
// Φωτογραφίες: {{photo:όνομα|λεζάντα ελ|λεζάντα en}} → μπαίνει μόνο αν υπάρχει src/assets/photos/όνομα.jpg (αλλιώς τίποτα).
const PHOTO_DIR = join(ROOT, "src/assets/photos");
const calcSrc = readFileSync(join(ROOT, "src/calc.mjs"), "utf8").replace(/^export /gm, "");
const site = { ...DATA, EN, SCHEDULE: SCHED.map(({ dest, time, days, express, conn, notes }) => ({ dest, time, days, express, conn, notes })), SUPABASE: { url: SUPABASE_URL, key: SUPABASE_KEY } };
writeFileSync(join(OUT, "assets/app.js"),
  `// Παράγεται από site/build.mjs — μην το αλλάζετε με το χέρι.\n"use strict";\nconst SITE = ${JSON.stringify(site)};\n${calcSrc}\n${readFileSync(join(ROOT, "src/client.js"), "utf8")}`);

// ---------- εικονίδια (SVG, inline) ----------
const I = {
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>',
  receive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16v13H4z"/><path d="M9 11h6M12 3v8m-3-3 3 3 3-3"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="7" width="14" height="13" rx="2"/><path d="M9 7V4h6v3M9 20v1M15 20v1"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10M10 20v-6h4v6"/></svg>',
  shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h18l-1-5H4zM5 9v11h14V9M9 20v-6h6v6"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
};

// Επίσημα λογότυπα (WhatsApp, Viber, ASAP): μόνο αν υπάρχει το αρχείο στο assets/brands/, αλλιώς τίποτα.
const brandFile = n => ["svg", "png"].map(e => `${n}.${e}`).find(f => existsSync(join(ROOT, "src/assets/brands", f)));
// Διαστάσεις εικόνας (JPEG/PNG) χωρίς βιβλιοθήκες, για width/height στο <img> (να μην «πηδάει» η σελίδα).
function imgSize(file) {
  try {
    const b = readFileSync(file);
    if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xFF) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xC0 && m <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  } catch {}
  return null;
}
const WA_URL = `https://wa.me/30${B.mobile}`, VB_URL = `viber://chat?number=%2B30${B.mobile}`;

// ---------- κομμάτια που χτίζονται από τα δεδομένα (ανά γλώσσα) ----------
const C = DATA.CATEGORIES;
// Αντιστοίχιση σελίδων ελληνικά ↔ αγγλικά (αγγλικά στο /en/)
const SLUG = { index: "index", apostoli: "send", paralavi: "receive", anazitisi: "track", proorismoi: "destinations", epixeiriseis: "business",
  spiti: "home-delivery", klirosi: "giveaway", "syxnes-erotiseis": "faq", epikoinonia: "contact", oroi: "terms", aporrito: "privacy", poll: "poll", nomothesia: "legislation", ladi: "olive-oil", foitites: "students", diaxeirisi: "admin", "diaxeirisi-proorismon": "admin-destinations", "404": "404", "fylaxi-aposkevon": "luggage-storage" };
const GR_OF = Object.fromEntries(Object.entries(SLUG).map(([g, e]) => [e, g]));
// Σελίδες ανά προορισμό («Αποστολή δέματος Αγρίνιο – Αθήνα»): μόνο για απευθείας προορισμούς με τιμές, από τα δεδομένα της διαχείρισης.
const DEST_PAGES = [["Αθήνα", "athina", "athens", "στην Αθήνα"], ["Πάτρα", "patra", "patras", "στην Πάτρα"], ["Θεσσαλονίκη", "thessaloniki", "thessaloniki", "στη Θεσσαλονίκη"], ["Ιωάννινα", "ioannina", "ioannina", "στα Ιωάννινα"],
  ["Λάρισα", "larisa", "larissa", "στη Λάρισα"], ["Βόλος", "volos", "volos", "στον Βόλο"], ["Πρέβεζα", "preveza", "preveza", "στην Πρέβεζα"], ["Άρτα", "arta", "arta", "στην Άρτα"], ["Λευκάδα", "lefkada", "lefkada", "στη Λευκάδα"], ["Καλαμάτα", "kalamata", "kalamata", "στην Καλαμάτα"]]
  .map(([name, gr, en, eis]) => ({ d: DATA.DESTINATIONS.find(x => x.name === name && (x.type === "direct" || x.type === "local") && DATA.TARIFFS[tariffKey(DATA, x)]), gr: "dema-agrinio-" + gr, en: "parcel-agrinio-" + en, eis }))
  .filter(x => x.d);
for (const p of DEST_PAGES) { SLUG[p.gr] = p.en; GR_OF[p.en] = p.gr; }
const counts = { direct: DATA.DESTINATIONS.filter(d => d.type === "direct").length, local: DATA.DESTINATIONS.filter(d => d.type === "local").length, transfer: DATA.DESTINATIONS.filter(d => d.type === "transfer").length,
  athensDaily: SCHED.filter(r => r.dest === "ΑΘΗΝΑ" && r.days[2] === "1").length, patraDaily: SCHED.filter(r => r.dest === "ΠΑΤΡΑ" && r.days[2] === "1").length };

function makeLang(lang) {
  const t = (el, en) => (lang === "en" ? en : el);
  const L = s => tr(s, lang);
  const link = gr => !ARTIFACT && gr === "index" ? "./" : (lang === "en" ? SLUG[gr] : gr) + EXT;   // σύνδεσμος σελίδας στην ίδια γλώσσα
  const sortL = (a, b) => L(a.name).localeCompare(L(b.name), lang);
  const kgFmt = n => (lang === "en" ? String(n) : String(n).replace(".", ","));
  const eur = n => n == null ? "—" : (lang === "en" ? `€${n}` : `${n} €`);
  const dateTxt = ymd => new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "el-GR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(ymd + "T00:00:00Z"));
  const money2 = n => (lang === "en" ? `€${n.toFixed(2)}` : `${n.toFixed(2).replace(".", ",")} €`);
  const ow = DATA.OVERWEIGHT;
  const pre0 = lang === "en" ? "../" : "";
  const brandImg = (n, alt, hgt) => { const f = brandFile(n); return f ? `<img class="brand-logo" src="${pre0}assets/brands/${f}" alt="${esc(alt)}" height="${hgt}" style="height:${hgt}px;width:auto">` : ""; };
  const chatButtons = () => `<span class="chat-btns"><a class="btn btn-wa" href="${WA_URL}">${brandImg("whatsapp", "", 22) || I.chat}WhatsApp</a>${B.viber ? `<a class="btn btn-vb" href="${VB_URL}">${brandImg("viber", "", 22) || I.chat}Viber</a>` : ""}</span>`;

  const tariffTable = () => {
    const order = ["athina", "patra", "thess", "ioannina", "larisa", "lamia", "volos", "ipeiros", "kriti", "nomos"];
    return `<div class="table-wrap"><table class="data"><thead><tr><th scope="col">${t("Είδος δέματος", "Item")}</th>${order.map(k => `<th scope="col">${esc(L(DATA.TARIFFS[k].label))}</th>`).join("")}</tr></thead><tbody>${
      C.map(c => `<tr><th scope="row" style="font-weight:600">${esc(L(c.name))}</th>${order.map(k => { const v = DATA.TARIFFS[k].p[c.id]; return `<td class="${v == null ? "na" : ""}">${v == null ? t("ρωτήστε", "ask") : eur(v)}</td>`; }).join("")}</tr>`).join("")
    }${ow.enabled ? `<tr><th scope="row" style="font-weight:600">${t(`Ανά κιλό πάνω από ${ow.fromKg} kg`, `Per kg over ${ow.fromKg} kg`)}</th>${order.map(k => `<td>+${money2(kgRate(ow, DATA.TARIFFS[k]))}</td>`).join("")}</tr>` : ""}</tbody></table></div><p class="caption">${t("Ενδεικτικές τιμές από τον επίσημο τιμοκατάλογο του ΚΤΕΛ Αιτωλοακαρνανίας, ανά τεμάχιο, με ΦΠΑ. Η τελική τιμή βγαίνει στον πάγκο, μετά από ζύγισμα και μέτρηση.", "Indicative prices from the official KTEL Aetolia-Acarnania price list, per item, VAT included. The final price is set at the counter after weighing and measuring.")}${
      ow.enabled ? " " + t(`Επιβάρυνση βάρους (τελευταία γραμμή): για κουτιά, φακέλους και τσουβάλια, ανά κιλό πάνω από ${ow.fromKg} kg και ανά τεμάχιο, στρογγυλεμένη στο επόμενο ευρώ. Τενεκέδες και αρνί έχουν σταθερή τιμή.`, `Weight surcharge (last row): for boxes, envelopes and sacks, per kg over ${ow.fromKg} kg and per item, rounded up to the next euro. Tins and lamb have a fixed price.`) : ""}</p>`;
  };
  const sizeTable = () => `<div class="table-wrap"><table class="data"><thead><tr><th scope="col">${t("Κατηγορία", "Category")}</th><th scope="col">${t("Χωράει σε (εκ.)", "Fits in (cm)")}</th><th scope="col">${t("Έως", "Up to")}</th></tr></thead><tbody>${
    C.filter(c => c.box).map(c => `<tr><th scope="row" style="font-weight:600">${esc(L(c.name))}</th><td class="num">${c.box.L} × ${c.box.W} × ${c.box.H}</td><td class="num">${kgFmt(c.kg)} kg</td></tr>`).join("")
  }<tr><th scope="row" style="font-weight:600">${t("Μεγαλύτερο ή βαρύτερο", "Larger or heavier")}</th><td colspan="2">${t("Καλέστε μας", "Call us")}</td></tr></tbody></table></div><p class="caption">${t("Μετράει η μεγαλύτερη κατηγορία από τις δύο: διαστάσεις ή βάρος. Ένα μικρό κουτί 8 κιλών χρεώνεται ως μεσαίο.", "The larger of the two counts: size or weight. A small box weighing 8 kg is charged as medium.")}</p>`;

  const destGroups = () => {
    const by = ty => DATA.DESTINATIONS.filter(d => d.type === ty).sort(sortL);
    const daily = t("Καθημερινά", "Daily");
    const chip = d => {
      const lbl = destDays(DATA, SCHED, d, lang, { viaHub: false });
      const dp = DEST_PAGES.find(p => p.d.name === d.name);
      return `<li><a href="${dp ? link(dp.gr) : `${link("apostoli")}?to=${encodeURIComponent(d.name)}#ypologismos`}" style="color:inherit;text-decoration:none">${esc(L(d.name))}</a>${lbl && lbl !== daily ? ` <small>· ${esc(lbl)}</small>` : ""}</li>`;
    };
    const hubs = Object.entries(DATA.HUBS).map(([k, h]) => {
      const list = DATA.DESTINATIONS.filter(d => d.hub === k).sort(sortL);
      return `<div class="panel"><h3>${t("Μέσω", "Via")} ${esc(L(h.label))}</h3><p class="muted" style="margin-top:6px">${esc(L(h.eta))} ${t(`Πληρώνετε εδώ την τιμή ${esc(L(DATA.TARIFFS[h.tariff].label))} και βάζετε περίπου άλλο τόσο σε φάκελο πάνω στο δέμα, για το πρακτορείο που συνεχίζει.`, `You pay the ${esc(L(DATA.TARIFFS[h.tariff].label))} price here and put about the same amount in an envelope on the parcel, for the agency that carries it on.`)}</p><ul class="dest-list">${list.map(chip).join("")}</ul></div>`;
    }).join("");
    return `<div class="dest-groups">
  <div><h2>${t("Απευθείας δρομολόγια", "Direct buses")}</h2><p class="muted" style="margin-top:6px">${t("Το δέμα φτάνει την ίδια μέρα που φεύγει. Δίπλα σε κάθε πόλη, οι μέρες που υπάρχει δρομολόγιο, αν δεν είναι καθημερινό.", "It arrives the same day it leaves. Next to each town: the days with a bus, if not daily.")}</p><ul class="dest-list">${by("direct").map(chip).join("")}</ul></div>
  <div><h2>${t("Εντός Νομού Αιτωλοακαρνανίας", "Within Aetolia-Acarnania")}</h2><p class="muted" style="margin-top:6px">${t("Ίδια τιμή για όλο τον νομό.", "One price for the whole prefecture.")}</p><ul class="dest-list">${by("local").map(chip).join("")}</ul></div>
  <div><h2>${t("Με ανταπόκριση", "With connection")}</h2><div class="grid g3" style="margin-top:12px">${hubs}</div></div>
  ${by("ask").length ? `<div><h2>${t("Ρωτήστε μας", "Ask us")}</h2><ul class="dest-list">${by("ask").map(d => `<li>${esc(L(d.name))}</li>`).join("")}</ul></div>` : ""}
  <div><h2>${t("Δεν εξυπηρετούνται", "Not served")}</h2><ul class="dest-list none">${by("none").map(d => `<li>${esc(L(d.name))}</li>`).join("")}</ul></div>
</div>`;
  };
  const hoursTable = () => `<table class="hours"><tbody>${B.hours.map(x => `<tr><td>${esc(L(x.days))}</td><td>${esc(x.time)}</td></tr>`).join("")}</tbody></table><p class="caption">${esc(L(B.holidaysNote))}</p>`;
  const faqData = lang === "en" ? FAQ_EN : FAQ;
  const faqHtml = (onlyTop = false) => onlyTop
    ? faqData.flatMap(c => c.items).filter(i => i.top).map(i => `<details class="q"><summary>${esc(i.q)}</summary><div class="a">${i.a}</div></details>`).join("")
    : faqData.map(c => `<section class="faq-cat"><h2>${esc(c.cat)}</h2>${c.items.map(i => `<details class="q"><summary>${esc(i.q)}</summary><div class="a">${i.a}</div></details>`).join("")}</section>`).join("");

  const TOKENS = {
    "{{tariffTable}}": tariffTable, "{{sizeTable}}": sizeTable, "{{destGroups}}": destGroups, "{{hours}}": hoursTable,
    "{{faq}}": () => faqHtml(false), "{{faqTop}}": () => faqHtml(true),
    "{{tel}}": () => B.phone,
    // Πίνακας αναχωρήσεων χωρίς JavaScript: τα πρώτα πρωινά δρομολόγια μιας καθημερινής (το client.js τα αντικαθιστά με τα επόμενα).
    "{{boardRows}}": () => {
      const picks = ["ΑΘΗΝΑ", "ΠΑΤΡΑ", "ΘΕΣΣΑΛΟΝΙΚΗ", "ΙΩΑΝΝΙΝΑ", "ΛΕΥΚΑΔΑ", "ΑΡΤΑ", "ΝΑΥΠΑΚΤΟΣ", "ΜΕΣΟΛΟΓΓΙ", "ΑΜΦΙΛΟΧΙΑ"];
      const nm = k => { const d = DATA.DESTINATIONS.find(x => x.sched && x.sched[0] === k); return d ? L(d.name) : k; };
      const rows = SCHED.filter(r => picks.includes(r.dest) && r.days[1] === "1" && r.time >= "07:00").sort((a, b) => a.time.localeCompare(b.time));
      const seen = new Set(), out = [];
      for (const r of rows) { if (seen.has(r.dest)) continue; seen.add(r.dest); out.push(r); if (out.length >= 7) break; }
      return out.sort((a, b) => a.time.localeCompare(b.time)).map(r => `<tr><td class="t">${r.time}</td><td class="d">${esc(nm(r.dest))}</td><td class="x">${r.express ? "Express" : ""}</td></tr>`).join("");
    },
    "{{eveningBy}}": () => B.eveningBy || B.hours[0].schema.c, "{{openWk}}": () => B.hours[0].schema.o, "{{openWe}}": () => B.hours[1].schema.o, "{{close}}": () => B.hours[0].schema.c,
    "{{chatButtons}}": () => chatButtons(),
    "{{asapLogo}}": () => `<a class="partner-link" href="https://asapcouriers.gr/" rel="noopener" target="_blank">${brandImg("asap", "ASAP Courier", 28) || "<b>ASAP Courier</b>"}</a>`,
    "{{phone}}": () => `<a class="num" href="tel:+30${B.phone}">${lang === "en" ? "+30 " : ""}${B.phoneDisplay}</a>`,
    "{{mobile}}": () => `<a class="num" href="tel:+30${B.mobile}">${lang === "en" ? "+30 " : ""}${B.mobileDisplay}</a>`,
    "{{whatsapp}}": () => `https://wa.me/30${B.mobile}`, "{{email}}": () => `<a href="mailto:${B.email}">${B.email}</a>`,
    "{{maps}}": () => B.mapsUrl, "{{access}}": () => `<ul class="access"><li><b>${t("Είσοδος", "Entrance")}:</b> ${t("μπαίνετε από την Εθνική Οδό Αγρινίου – Αντιρρίου. Η αποθήκη είναι δεξιά από την είσοδο του σταθμού ΚΤΕΛ.", "turn in from the Agrinio – Antirrio national road. The depot is to the right of the KTEL station entrance.")}</li><li><b>${t("Στάθμευση", "Parking")}:</b> ${t("στις θέσεις με την ταμπέλα για παραλαβή και παράδοση ασυνόδευτων δεμάτων.", "in the signposted spaces for dropping off and collecting unaccompanied parcels.")}</li></ul>`, "{{ktel}}": () => B.ktelUrl, "{{name}}": () => esc(L(B.name)), "{{slogan}}": () => esc(L(B.slogan)),
    "{{nDirect}}": () => counts.direct, "{{nLocal}}": () => counts.local, "{{nTransfer}}": () => counts.transfer,
    "{{athensDaily}}": () => `<span data-daily="ΑΘΗΝΑ">${counts.athensDaily}</span>`, "{{patraDaily}}": () => `<span data-daily="ΠΑΤΡΑ">${counts.patraDaily}</span>`,
    "{{free}}": () => DATA.STORAGE.freeDays, "{{perDay}}": () => DATA.STORAGE.perDay, "{{cap}}": () => DATA.STORAGE.cap,
    "{{homePrice}}": () => DATA.HOME.zones[0].price, "{{homeHours}}": () => DATA.HOME.hours, "{{homeVehicles}}": () => esc(L(DATA.HOME.vehicles)),
    "{{homeZones}}": () => DATA.HOME.zones.map(z => `<option value="${z.id}">${esc(L(z.name))}</option>`).join(""),
    "{{athensNote}}": () => esc(L(DATA.HOME.athensNote)), "{{luggage}}": () => DATA.LUGGAGE.perPiecePerDay, "{{cutoff}}": () => B.cutoffMin,
    "{{destTable}}": () => {
      const typeTxt = d => d.type === "direct" ? t("Απευθείας", "Direct") : d.type === "local" ? t("Εντός νομού", "Within prefecture")
        : d.type === "transfer" ? `${t("Μέσω", "Via")} ${L(DATA.HUBS[d.hub].label)}` : d.type === "ask" ? t("Ρωτήστε μας", "Ask us") : t("Δεν εξυπηρετείται", "Not served");
      const tag = d => d.type === "none" ? "" : d.type === "transfer" ? "info" : "ok";
      const rows = DATA.DESTINATIONS.slice().sort(sortL).map(d => {
        const tf = DATA.TARIFFS[tariffKey(DATA, d)];
        const days = destDays(DATA, SCHED, d, lang);
        const eta = d.type === "transfer" ? (d.eta || DATA.HUBS[d.hub].eta) : d.eta;
        const from = tf && tf.p.fakelos != null ? `${t("από", "from")} ${eur(tf.p.fakelos)}` : "—";
        const calc = d.type === "none" || d.type === "ask" ? "" : `<a href="${link("apostoli")}?to=${encodeURIComponent(d.name)}#ypologismos">${t("Υπολογισμός", "Calculate")}</a>`;
        return `<tr data-q="${esc((d.name + " " + L(d.name) + " " + d.region + " " + L(d.region)).toLowerCase())}"${d.type === "none" ? ' class="off"' : ""}><th scope="row">${esc(L(d.name))}<small>${esc(L(d.region))}</small></th><td>${tag(d) ? `<span class="tag ${tag(d)}">${esc(typeTxt(d))}</span>` : esc(typeTxt(d))}</td><td>${tf ? esc(L(tf.label)) : "—"}</td><td>${from}</td><td>${esc(days) || "—"}</td><td class="wrap-cell">${esc(L(eta) || "")}</td><td>${calc}</td></tr>`;
      }).map(r => { const lab = [t("Πώς πάει", "Route"), t("Τιμοκατάλογος", "Price list"), t("Φάκελος", "Envelope"), t("Μέρες", "Days"), t("Παράδοση", "Delivery"), ""]; let i = 0;
        return r.replace(/<td( class="[^"]*")?>/g, (m, c) => `<td${c || ""} data-label="${esc(lab[i++] || "")}">`); }).join("");
      return `<div class="field" style="max-width:420px;margin-bottom:12px"><label for="dt-q">${t("Βρείτε πόλη", "Find a town")}</label><input id="dt-q" type="search" data-dest-filter placeholder="${t("π.χ. Τρίπολη", "e.g. Tripoli")}" autocomplete="off"></div>
<div class="table-wrap"><table class="data dest-table"><thead><tr><th scope="col">${t("Προορισμός", "Destination")}</th><th scope="col">${t("Πώς πάει", "Route")}</th><th scope="col">${t("Τιμοκατάλογος", "Price list")}</th><th scope="col">${t("Φάκελος", "Envelope")}</th><th scope="col">${t("Μέρες δρομολογίου", "Bus days")}</th><th scope="col">${t("Παράδοση", "Delivery")}</th><th scope="col"></th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="caption" data-dest-count></p>`;
    },
    "{{packingTable}}": () => { const P = DATA.PACKING, m = n => (lang === "en" ? `€${Number.isInteger(n) ? n : n.toFixed(2)}` : `${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")} €`);
      return `<div class="table-wrap"><table class="data"><thead><tr><th scope="col">${t("Είδος", "Item")}</th><th scope="col">${t("Μόνο υλικό", "Material only")}</th><th scope="col">${t("Το πακετάρουμε εμείς", "We pack it")}</th></tr></thead><tbody>${
        P.items.map(i => `<tr><th scope="row" style="font-weight:600">${esc(L(i.name))}</th><td>${m(i.material)}</td><td>${m(i.service)}</td></tr>`).join("")
      }<tr><th scope="row" style="font-weight:600">${t("Εύθραυστο (γέμισμα, σήμανση)", "Fragile (padding, labels)")}</th><td>—</td><td>+${m(P.fragile)}</td></tr></tbody></table></div><p class="caption">${t("Με ΦΠΑ. Ταινία και stretch film δωρεάν με την αγορά κούτας. Η συσκευασία χρεώνεται χωριστά από τον ναύλο του ΚΤΕΛ.", "VAT included. Tape and stretch film free with any box. Packing is charged separately from the KTEL fare.")}</p>`; },
    "{{cEnd}}": () => dateTxt(DATA.CONTEST.end), "{{cDraw}}": () => dateTxt(DATA.CONTEST.draw), "{{cWinners}}": () => DATA.CONTEST.winners,
    "{{cDeliveries}}": () => DATA.CONTEST.prizeDeliveries, "{{cFallback}}": () => DATA.CONTEST.fallbackShipments, "{{cFallbackUntil}}": () => dateTxt(DATA.CONTEST.fallbackUntil),
    "{{owFrom}}": () => ow.fromKg, "{{owShare}}": () => Math.round(ow.share * 100),
    "{{owExamples}}": () => ["nomos", "patra", "athina", "thess", "kriti"].map(k => { const tf = DATA.TARIFFS[k]; return `${esc(L(tf.label))}: ${money2(kgRate(ow, tf))}/kg`; }).join(" · "),
    "{{address}}": () => esc(`${L(B.address.place)}, ${L(B.address.street)}, ${B.address.postal} ${L(B.address.city)}`),
    ...Object.fromEntries(Object.entries(I).map(([k, v]) => [`{{i:${k}}}`, () => v])),
  };
  // {{photo:name|…}}: «!name» = φωτογραφία στην κορυφή της σελίδας (φορτώνει αμέσως, όχι lazy).
  const photo = (name, capEl, capEn) => {
    const eager = name.startsWith("!"); if (eager) name = name.slice(1);
    const f = ["jpg", "jpeg", "webp", "png"].map(x => name + "." + x).find(x => existsSync(join(PHOTO_DIR, x)));
    if (!f) return "";
    const cap = t(capEl, capEn || capEl), sz = imgSize(join(PHOTO_DIR, f));
    return `<figure class="photo"><img src="${lang === "en" ? "../" : ""}assets/photos/${f}" alt=""${sz ? ` width="${sz.w}" height="${sz.h}"` : ""} ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}><figcaption>${esc(cap)}</figcaption></figure>`;
  };
  // {{seasonTable:κατηγορία,κατηγορία|Πόλη,Πόλη}}: τιμές από τον τιμοκατάλογο + ημέρες/πλήθος αναχωρήσεων, για σελίδες εποχής.
  const SHORT = { tenekes: ["Τενεκές", "Tin"], tenekes_syn: ["Ταξιδεύετε μαζί", "You travel too"], mikro: ["Μικρή", "Small"], mesaio: ["Μεσαία", "Medium"], megalo: ["Μεγάλη", "Large"] };
  const seasonTable = (catIds, names) => {
    const cats = catIds.map(id => C.find(c => c.id === id)).filter(Boolean);
    const rows = names.map(n => DATA.DESTINATIONS.find(d => d.name === n)).filter(d => d && DATA.TARIFFS[tariffKey(DATA, d)]);
    const deps = d => {
      const days = destDays(DATA, SCHED, d, lang, { viaHub: false });
      if (!days) return "";
      const wk = d.sched ? SCHED.filter(r => d.sched.includes(r.dest) && r.days[2] === "1").length : 0;
      return days + (wk > 1 ? t(` · ${wk} την ημέρα`, ` · ${wk} a day`) : "");
    };
    return `<div class="table-wrap"><table class="data season"><thead><tr><th scope="col">${t("Προορισμός", "Destination")}</th>${cats.map(c => `<th scope="col">${SHORT[c.id] ? t(...SHORT[c.id]) : esc(L(c.name))}</th>`).join("")}<th scope="col" class="deps-col">${t("Αναχωρήσεις", "Departures")}</th></tr></thead><tbody>${
      rows.map(d => `<tr><th scope="row">${esc(L(d.name))}<small class="m-deps">${esc(deps(d))}</small></th>${cats.map(c => { const v = DATA.TARIFFS[tariffKey(DATA, d)].p[c.id]; return `<td class="num">${v == null ? t("ρωτήστε", "ask") : eur(v)}</td>`; }).join("")}<td class="deps-cell">${esc(deps(d))}</td></tr>`).join("")
    }</tbody></table></div>`;
  };
  const fill = s => s.replace(/\{\{eur:([a-z]+):([a-z_]+)\}\}/g, (m, k, c) => { const v = DATA.TARIFFS[k] ? DATA.TARIFFS[k].p[c] : DATA0.TARIFFS[k] && DATA0.TARIFFS[k].p[c]; if (v == null) { if (DATA0.TARIFFS[k] && DATA0.TARIFFS[k].p[c] != null) return t("ρωτήστε", "ask"); throw new Error("Άγνωστη τιμή: " + m); } return eur(v); })
    .replace(/\{\{seasonTable:([a-z_,]+)\|([^}]+)\}\}/g, (_, c, n) => seasonTable(c.split(","), n.split(",").map(x => x.trim())))
    .replace(/\{\{photo:(!?[a-z0-9-]+)\|([^|}]*)(?:\|([^}]*))?\}\}/g, (_, n, a, b) => photo(n, a, b))
    .replace(/\{\{[^}]+\}\}/g, m => TOKENS[m] ? String(TOKENS[m]()) : (console.warn("Άγνωστο:", m), m));

  const NAV = [["apostoli", t("Αποστολή", "Send")], ["paralavi", t("Παραλαβή", "Collect")], ["anazitisi", t("Αναζήτηση", "Track")], ["proorismoi", t("Προορισμοί", "Destinations")],
    ["epixeiriseis", t("Επιχειρήσεις", "Business")], ["syxnes-erotiseis", t("Ερωτήσεις", "FAQ")], ["epikoinonia", t("Επικοινωνία", "Contact")]];
  // Ένα στοιχείο επιχείρησης για όλο το σάιτ: ίδιο όνομα, διεύθυνση και url σε ελληνικά και αγγλικά (το αγγλικό όνομα ως alternateName).
  const localBusiness = () => {
    const imgs = ["eisodos", "rafia"].map(n => ["jpg", "png"].map(e => n + "." + e).find(f => existsSync(join(PHOTO_DIR, f)))).filter(Boolean).map(f => B.domain + "/assets/photos/" + f);
    return {
      "@context": "https://schema.org", "@type": "LocalBusiness", "@id": B.domain + "/#business",
      name: B.name, alternateName: tr(B.name, "en"), slogan: L(B.slogan), url: B.domain + "/",
      telephone: "+30" + B.phone, email: B.email, image: [...imgs, B.domain + "/assets/og.jpg"], logo: B.domain + "/assets/icon-512.png",
      contactPoint: { "@type": "ContactPoint", telephone: "+30" + B.mobile, contactType: "customer service", availableLanguage: ["el", "en"] },
      address: { "@type": "PostalAddress", streetAddress: `${B.address.place}, ${B.address.street}`, addressLocality: B.address.city, postalCode: B.address.postal, addressRegion: B.address.region, addressCountry: "GR" },
      ...(B.geo ? { geo: { "@type": "GeoCoordinates", latitude: B.geo.lat, longitude: B.geo.lng } } : {}),
      containedInPlace: { "@type": "BusStation", name: "Υπεραστικός σταθμός ΚΤΕΛ Αγρινίου" },
      openingHoursSpecification: [
        ...B.hours.map(x => ({ "@type": "OpeningHoursSpecification", dayOfWeek: x.schema.d, opens: x.schema.o, closes: x.schema.c })),
        ...(B.closedDates || []).map(d => ({ "@type": "OpeningHoursSpecification", opens: "00:00", closes: "00:00", validFrom: d, validThrough: d })),
      ],
      areaServed: [{ "@type": "City", name: "Αγρίνιο" }, { "@type": "AdministrativeArea", name: "Αιτωλοακαρνανία" }],
      paymentAccepted: B.payments.join(", "), currenciesAccepted: "EUR",
      priceRange: "€", hasMap: B.mapsUrl, ...(B.sameAs && B.sameAs.length ? { sameAs: B.sameAs } : {}),
    };
  };
  const faqLd = () => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqData.flatMap(c => c.items).map(i => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a.replace(/<[^>]+>/g, "") } })) });

  // Κάθε πρόταση/μπλοκ ξεκινά με κεφαλαίο: αρχή στοιχείων κειμένου, μετά από «<b>Ετικέτα:</b>», και placeholders.
  const LOW = "a-zα-ωάέήίόύώϊϋΐΰ";
  const capFirst = html => html
    .replace(new RegExp(`(<(?:p|li|td|th|dd|dt|small|figcaption|summary|option|label|legend|h[1-6]|div class="a"|span class="(?:hint|caption|yr|m-deps|more|p)")(?:\\s[^>]*)?>\\s*(?:<(?!/)[^>]+>\\s*)*)([${LOW}])(?![${LOW}]*[@.:/][a-z])`, "g"), (m, pre, ch) => pre + ch.toUpperCase())
    .replace(new RegExp(`(<b>[^<]{1,40}:</b>\\s*)([${LOW}])`, "g"), (m, pre, ch) => pre + ch.toUpperCase())
    .replace(new RegExp(`(</b><span>)([${LOW}])`, "g"), (m, pre, ch) => pre + ch.toUpperCase())
    .replace(new RegExp(`(placeholder=")([${LOW}])`, "g"), (m, pre, ch) => pre + ch.toUpperCase())
    .replace(/(<(?:li|td|th|span class="(?:hint|m-deps)")[^>]*>)(Kg|Cm)\b/g, (m, a, u) => a + u.toLowerCase());
  function page(gr, meta, body) { body = capFirst(body);
    const pre = lang === "en" ? "../" : "";
    const urlOf = (lg, g) => B.domain + "/" + (lg === "en" ? "en/" : "") + (g === "index" ? "" : (lg === "en" ? SLUG[g] : g) + EXT);
    const url = urlOf(lang, gr);
    const other = lang === "en" ? `../${gr}.html` : `en/${SLUG[gr]}.html`;
    const ld = [meta.ld === "business" ? localBusiness() : null, meta.ld === "faq" ? faqLd() : null, ...(meta.ldExtra || [])].filter(Boolean);
    const nav = NAV.map(([g, label]) => `<a href="${link(g)}"${g === gr ? ' aria-current="page"' : ""}>${label}</a>`).join("");
    const headInner = `<title>${esc(meta.title)}</title>
${ARTIFACT ? '<meta name="claude:viewport-fit-sides" content="cover">\n' : ""}<meta name="description" content="${esc(meta.description)}">
${meta.noindex ? '<meta name="robots" content="noindex">\n' : `<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="el" href="${urlOf("el", gr)}"><link rel="alternate" hreflang="en" href="${urlOf("en", gr)}"><link rel="alternate" hreflang="x-default" href="${urlOf("el", gr)}">`}
<meta property="og:type" content="website"><meta property="og:locale" content="${t("el_GR", "en_GB")}"><meta property="og:site_name" content="${esc(L(B.name))}">
<meta property="og:title" content="${esc(meta.title)}"><meta property="og:description" content="${esc(meta.description)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${B.domain}/assets/og.jpg">
<meta name="theme-color" content="#0C3456">
<link rel="icon" href="${pre}assets/icon-192.png"><link rel="apple-touch-icon" href="${pre}assets/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fira+Sans+Condensed:wght@600;700;800&family=Fira+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap">
<link rel="stylesheet" href="${pre}assets/site.css">
${ld.map(x => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join("\n")}
<!-- Στατιστικά χωρίς cookies (Cloudflare Web Analytics): μπαίνει εδώ μετά τη δημοσίευση. -->`;
    const content = `<a class="skip" href="#main">${t("Μετάβαση στο περιεχόμενο", "Skip to content")}</a>
${PROTOTYPE ? `<div class="proto">${t("Πρωτότυπο για έγκριση — τιμές και όροι υπό έλεγχο, η σελίδα δεν είναι ακόμα δημόσια.", "Prototype for approval — prices and terms under review; not public yet.")}</div>` : ""}
<header class="site-head"><div class="wrap">
  <a class="brand" href="${link("index")}"><span class="chip"><img src="${pre}assets/mark.png" alt="" width="54" height="27"></span><span><b>${t("Αποθήκη Δεμάτων", "Parcel Depot")}</b><small>${t("ΚΤΕΛ Αγρινίου", "KTEL Agrinio")}</small></span></a>
  <a class="lang-switch" href="${other}" hreflang="${t("en", "el")}" lang="${t("en", "el")}">${t("EN", "ΕΛ")}</a>
  <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav">${t("Μενού", "Menu")}</button>
  <nav class="nav" id="nav" aria-label="${t("Κύριο μενού", "Main menu")}">${nav}<a class="call" href="tel:+30${B.phone}">${B.phoneDisplay}</a></nav>
</div></header>
<main id="main">
${body}
</main>
<footer class="site-foot"><div class="wrap">
  <div><h3>${esc(L(B.name))}</h3><p>${t("Αποθήκη δεμάτων μέσα στον σταθμό ΚΤΕΛ Αγρινίου, με τα δρομολόγια του ΚΤΕΛ Αιτωλοακαρνανίας.", "Parcel agency inside the KTEL Agrinio bus station, using KTEL Aetolia-Acarnania buses.")}</p><p style="margin-top:10px">${t("Δέματα για", "Parcels to")} ${DEST_PAGES.map(p => `<a href="${link(p.gr)}">${esc(L(p.d.name))}</a>`).join(" · ")}</p><p style="margin-top:10px">${t("Για εισιτήρια και δρομολόγια επιβατών:", "For passenger tickets and timetables:")} <a href="${B.ktelUrl}" rel="noopener">${t("ΚΤΕΛ Αιτωλοακαρνανίας", "KTEL Aetolia-Acarnania")}</a></p></div>
  <div><h3>${t("Υπηρεσίες", "Services")}</h3><ul><li><a href="${link("apostoli")}">${t("Αποστολή δέματος", "Send a parcel")}</a></li><li><a href="${link("paralavi")}">${t("Παραλαβή δέματος", "Collect a parcel")}</a></li><li><a href="${link("anazitisi")}">${t("Αναζήτηση δέματος", "Track a parcel")}</a></li><li><a href="${link("spiti")}">${t("Παράδοση στο σπίτι", "Home delivery")}</a></li><li><a href="${link("ladi")}">${t("Λάδι για τους δικούς σας", "Olive oil to family")}</a></li><li><a href="${link("foitites")}">${t("Πακέτο για φοιτητές", "Parcels for students")}</a></li><li><a href="${link("fylaxi-aposkevon")}">${t("Φύλαξη αποσκευών", "Luggage storage")}</a></li><li><a href="${link("epixeiriseis")}">${t("Για επιχειρήσεις", "For businesses")}</a></li></ul></div>
  <div><h3>${t("Ωράριο", "Opening hours")}</h3><ul>${B.hours.map(x => `<li>${esc(L(x.days))}<br><span class="num">${esc(x.time)}</span></li>`).join("")}</ul></div>
  <div><h3>${t("Επικοινωνία", "Contact")}</h3><ul><li>${esc(L(B.address.place))}, ${esc(L(B.address.street))}, ${B.address.postal} ${esc(L(B.address.city))}<br><a href="${B.mapsUrl}" rel="noopener">${t("Οδηγίες στον χάρτη", "Directions")}</a></li><li><a class="num" href="tel:+30${B.phone}">${lang === "en" ? "+30 " : ""}${B.phoneDisplay}</a></li><li><a class="num" href="tel:+30${B.mobile}">${lang === "en" ? "+30 " : ""}${B.mobileDisplay}</a><br><a href="${WA_URL}">WhatsApp</a>${B.viber ? ` · <a href="${VB_URL}">Viber</a>` : ""}</li><li><a href="mailto:${B.email}">${B.email}</a></li></ul></div>
  <div class="legal"><span>© ${new Date().getFullYear()} ${esc(L(B.name))}</span><span><a href="${link("oroi")}">${t("Όροι εξυπηρέτησης", "Terms of service")}</a> · <a href="${link("aporrito")}">${t("Απόρρητο", "Privacy")}</a> · <a href="${link("nomothesia")}">${t("Νομοθεσία", "Legislation")}</a> · ${t("Χωρίς cookies", "No cookies")}</span></div>
</div></footer>
<nav class="quickbar" aria-label="${t("Γρήγορες ενέργειες", "Quick actions")}">
  <a href="tel:+30${B.phone}">${I.phone}<span>${t("Κλήση", "Call")}</span></a>
  <a href="${link("anazitisi")}"${gr === "anazitisi" ? ' aria-current="page"' : ""}>${I.search}<span>${t("Πού είναι το δέμα", "Track parcel")}</span></a>
  <a href="${link("apostoli")}#ypologismos"${gr === "apostoli" ? ' aria-current="page"' : ""}>${I.send}<span>${t("Πόσο κοστίζει", "Price")}</span></a>
</nav>
<script src="${pre}assets/app.js"></script>`;
    if (ARTIFACT && lang === "el" && gr === "index") return `${headInner}\n${content}\n`;
    return `<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${headInner}\n</head>\n<body>\n${content}\n</body>\n</html>\n`;
  }
  // Σελίδα προορισμού: τιμές, μέρες, ώρες αναχώρησης, παράδοση, σημείο παραλαβής — όλα από τα δεδομένα, όχι αντιγραμμένο κείμενο.
  function destPage(p) {
    const d = p.d, name = L(d.name), tf = DATA.TARIFFS[tariffKey(DATA, d)];
    const days = destDays(DATA, SCHED, d, lang);
    const rows = SCHED.filter(r => (d.sched || []).includes(r.dest)).sort((a, b) => a.time.localeCompare(b.time));
    const pEnv = tf.p.fakelos, pSmall = tf.p.mikro;
    const fromTxt = t([pEnv != null ? `φάκελος από ${eur(pEnv)}` : "", pSmall != null ? `μικρό κουτί από ${eur(pSmall)}` : ""].filter(Boolean).join(", "),
      [pEnv != null ? `envelopes from ${eur(pEnv)}` : "", pSmall != null ? `small boxes from ${eur(pSmall)}` : ""].filter(Boolean).join(", "));
    const noteTxt = s => { const k = String(s || "").trim(), m = DATA.NOTE_TEXT && DATA.NOTE_TEXT[k]; return m ? m[lang === "en" ? 1 : 0] : L(k); };
    const calc = `${link("apostoli")}?to=${encodeURIComponent(d.name)}#ypologismos`;
    const facts = [
      days && [t("Μέρες", "Days"), days],
      d.eta && [t("Παράδοση", "Delivery"), L(d.eta)],
      d.terminal && [t("Παραλαβή στον προορισμό", "Collection at destination"), [d.terminal, d.terminalAddr].filter(Boolean).join(", "), d.terminalPhone],
      d.note && [t("Σημείωση", "Note"), L(d.note)],
      [t("Στο ταμείο", "At the counter"), t(`Τουλάχιστον ${B.cutoffMin} λεπτά πριν την αναχώρηση.`, `At least ${B.cutoffMin} minutes before departure.`)],
      [t("Πληρωμή", "Payment"), t("Μετρητά, κάρτα ή IRIS", "Cash, card or IRIS")],
    ].filter(Boolean);
    const others = DEST_PAGES.filter(x => x !== p).map(x => `<li><a href="${link(x.gr)}">${esc(L(x.d.name))}</a></li>`).join("");
    const body = `<section class="page-head"><div class="wrap">
  <span class="crumbs"><a href="${link("index")}">${t("Αρχική", "Home")}</a> / <a href="${link("proorismoi")}">${t("Προορισμοί", "Destinations")}</a> / ${t("Αγρίνιο", "Agrinio")} – ${esc(name)}</span>
  <h1>${t(`Αποστολή δέματος Αγρίνιο – ${esc(name)}`, `Send a parcel from Agrinio to ${esc(name)}`)}</h1>
  <p>${t(`Με τα λεωφορεία του ΚΤΕΛ, από τον σταθμό του Αγρινίου: ${fromTxt}.`, `On KTEL buses, from the Agrinio bus station: ${fromTxt}.`)}</p>
  <p style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><a class="btn btn-primary" href="${calc}">${t("Υπολογίστε το κόστος", "Work out the cost")}</a></p>
</div></section>
<section class="section"><div class="wrap">
  <h2>${t("Με μια ματιά", "At a glance")}</h2>
  <ul class="access">${facts.map(([k, v, ph]) => `<li><b>${k}:</b> ${esc(v)}${ph ? ` · ${String(ph).split(/\s*[,;]\s*/).map(n => `<a class="num" href="tel:${n.replace(/[^\d+]/g, "").replace(/^(?!\+)/, "+30")}">${esc(n)}</a>`).join(", ")}` : ""}</li>`).join("")}</ul>
  ${d.name === "Αθήνα" && DATA.HOME.athens ? `<div class="notice info" style="margin-top:16px;max-width:70ch"><b>${t("Παραλαβή κατ' οίκον στην Αθήνα", "Delivery to your door in Athens")}${DATA.HOME.athens.active ? "" : ` <span class="tag">${t("Σύντομα", "Soon")}</span>`}</b>${(brandImg("asap", "", 20) ? brandImg("asap", DATA.HOME.athens.partner, 20) + " " : "") + t(`Σε συνεργασία με την ${esc(DATA.HOME.athens.partner)}: ο παραλήπτης το παίρνει στο σπίτι ή στο γραφείο, χωρίς να πάει στον Κηφισό.`, `In partnership with ${esc(DATA.HOME.athens.partner)}: the recipient gets it at home or at work, without going to Kifisos.`)} <a href="${link("spiti")}#${lang === "en" ? "athens" : "athina"}">${t("Περισσότερα →", "More →")}</a></div>` : ""}
  <h2 style="margin-top:32px">${t(`Τιμές για ${esc(name)}`, `Prices to ${esc(name)}`)}</h2>
  <div class="table-wrap"><table class="data"><thead><tr><th scope="col">${t("Είδος δέματος", "Item")}</th><th scope="col">${t("Τιμή", "Price")}</th></tr></thead><tbody>${
    C.map(c => { const v = tf.p[c.id]; return `<tr><th scope="row" style="font-weight:600">${esc(L(c.name))}</th><td class="${v == null ? "na" : "num"}">${v == null ? t("ρωτήστε", "ask") : eur(v)}</td></tr>`; }).join("")
  }${ow.enabled ? `<tr><th scope="row" style="font-weight:600">${t(`Ανά κιλό πάνω από ${ow.fromKg} kg`, `Per kg over ${ow.fromKg} kg`)}</th><td class="num">+${money2(kgRate(ow, tf))}</td></tr>` : ""}</tbody></table></div>
  <p class="caption">${t("Ενδεικτικές τιμές από τον επίσημο τιμοκατάλογο του ΚΤΕΛ Αιτωλοακαρνανίας, ανά τεμάχιο, με ΦΠΑ. Η τελική τιμή βγαίνει στον πάγκο.", "Indicative prices from the official KTEL Aetolia-Acarnania price list, per item, VAT included. The final price is set at the counter.")} <a href="${link("apostoli")}#ypologismos">${t("Ποιο μέγεθος είναι το δέμα μου;", "Which size is my parcel?")}</a></p>
  ${rows.length ? `<h2 style="margin-top:32px">${t("Αναχωρήσεις από το Αγρίνιο", "Departures from Agrinio")}</h2>
  <div class="table-wrap"><table class="data"><thead><tr><th scope="col">${t("Ώρα", "Time")}</th><th scope="col">${t("Μέρες", "Days")}</th><th scope="col">${t("Σημείωση", "Note")}</th></tr></thead><tbody>${
    rows.map(r => `<tr><td class="num">${r.time}</td><td>${esc(daysLabel([r], [r.dest], lang))}</td><td>${[r.express ? "Express" : "", r.notes ? esc(noteTxt(r.notes)) : ""].filter(Boolean).join(" · ")}</td></tr>`).join("")
  }</tbody></table></div>
  <p class="caption">${t(`Λεωφορεία που παίρνουν δέματα. Φέρτε το δέμα στο ταμείο τουλάχιστον ${B.cutoffMin} λεπτά πριν. Τις αργίες τα δρομολόγια μπορεί να αλλάζουν.`, `Buses that carry parcels. Bring your parcel to the counter at least ${B.cutoffMin} minutes before. Holiday timetables may differ.`)}</p>` : ""}
  <h2 style="margin-top:32px">${t("Πώς στέλνω", "How to send")}</h2>
  <ol class="steps"><li><div><b>${t("Συσκευάστε το δέμα", "Pack the parcel")}</b><p>${t("Γράψτε πάνω ονοματεπώνυμο και κινητό του παραλήπτη, όπως στην ταυτότητά του.", "Write the recipient’s full name, as on their ID, and mobile number on it.")}</p></div></li><li><div><b>${t("Φέρτε το στην αποθήκη", "Bring it to the warehouse")}</b><p>${t(`Δεξιά από την είσοδο του σταθμού ΚΤΕΛ Αγρινίου. ${esc(B.hours.map(x => L(x.days) + " " + x.time).join(" · "))}.`, `To the right of the Agrinio KTEL station entrance. ${esc(B.hours.map(x => L(x.days) + " " + x.time).join(" · "))}.`)}</p></div></li><li><div><b>${t("Πληρώνετε και φεύγει", "Pay and it’s on its way")}</b><p>${t(`Μετρητά, κάρτα ή IRIS. Ο παραλήπτης ειδοποιείται με SMS όταν φτάσει ${p.eis}.`, `Cash, card or IRIS. The recipient gets an SMS when it reaches ${esc(name)}.`)}</p></div></li></ol>
  <h2 style="margin-top:32px">${t("Άλλοι προορισμοί", "Other destinations")}</h2>
  <ul class="dest-list">${others}<li><a href="${link("proorismoi")}">${t("Όλοι οι προορισμοί →", "All destinations →")}</a></li></ul>
</div></section>`;
    const U = g => B.domain + "/" + (lang === "en" ? "en/" : "") + (g === "index" ? "" : (lang === "en" ? SLUG[g] : g) + EXT);
    const crumbsLd = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: t("Αρχική", "Home"), item: U("index") },
      { "@type": "ListItem", position: 2, name: t("Προορισμοί", "Destinations"), item: U("proorismoi") },
      { "@type": "ListItem", position: 3, name: `${t("Αγρίνιο", "Agrinio")} – ${name}`, item: U(p.gr) }] };
    const meta = {
      ldExtra: [crumbsLd],
      title: t(`Αποστολή δέματος Αγρίνιο – ${name} · Τιμές & δρομολόγια ΚΤΕΛ`, `Parcel from Agrinio to ${name} · KTEL prices & times`),
      description: t(`Δέμα από το Αγρίνιο ${p.eis} με το ΚΤΕΛ: ${fromTxt}.${days ? ` Δρομολόγια: ${days}.` : ""} Τιμές ανά είδος και ώρες αναχώρησης.`,
        `Parcels from Agrinio to ${name} by KTEL bus: ${fromTxt}.${days ? ` Departures: ${days}.` : ""} Prices by item and departure times.`),
    };
    return { meta, body };
  }
  return { fill, page, destPage, urlOf: (g) => B.domain + "/" + (lang === "en" ? "en/" : "") + (g === "index" ? "" : (lang === "en" ? SLUG[g] : g) + EXT) };
}

// ---------- σελίδες ----------
// Το Cloudflare Pages σερβίρει /apostoli για το apostoli.html (και ανακατευθύνει το .html): σύνδεσμοι χωρίς .html.
function cleanLinks(html) {
  if (ARTIFACT) return html;
  return html
    .replace(/(href|action)="(?!https?:|mailto:|tel:|#|\/\/|viber:)([^"]*?)\.html(?=["#?])/g, '$1="$2')
    .replace(/(href|action)="(\.\.\/|en\/)?index(?=["#?])/g, (m, a, up) => `${a}="${up || "./"}`)
    .replace(/(href|action)="\.\/(?=[#?])/g, '$1="./');
}
const sitemap = [];
let n = 0;
for (const lang of ["el", "en"]) {
  const dir = join(ROOT, lang === "en" ? "src/pages-en" : "src/pages");
  const outDir = lang === "en" ? join(OUT, "en") : OUT;
  mkdirSync(outDir, { recursive: true });
  const M = makeLang(lang);
  for (const f of readdirSync(dir).filter(f => f.endsWith(".html"))) {
    const slug = f.replace(/\.html$/, "");
    const gr = lang === "en" ? GR_OF[slug] : slug;
    if (!gr) throw new Error("Άγνωστη αγγλική σελίδα: " + f);
    const raw = readFileSync(join(dir, f), "utf8");
    const m = raw.match(/^<!--meta\s*(\{[\s\S]*?\})\s*-->\s*/);
    if (!m) throw new Error("Λείπει meta: " + f);
    const meta = JSON.parse(m[1]);
    meta.title = M.fill(meta.title); meta.description = M.fill(meta.description);
    let html = M.page(gr, meta, M.fill(raw.slice(m[0].length)));
    // Η 404 σερβίρεται σε οποιαδήποτε διεύθυνση (και σε υποφακέλους): οι σχετικοί σύνδεσμοι μετρούν από τη ρίζα της γλώσσας.
    if (gr === "404" && !ARTIFACT) html = html.replace(/<head>/i, `<head>\n<base href="${lang === "en" ? "/en/" : "/"}">`);
    writeFileSync(join(outDir, f), cleanLinks(html));
    if (!meta.noindex) sitemap.push(M.urlOf(gr));
    n++;
  }
  for (const p of DEST_PAGES) {
    const { meta, body } = M.destPage(p);
    writeFileSync(join(outDir, (lang === "en" ? p.en : p.gr) + ".html"), cleanLinks(M.page(p.gr, meta, body)));
    sitemap.push(M.urlOf(p.gr)); n++;
  }
}
writeFileSync(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map(u => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`);
// Cloudflare Pages: κεφαλίδες ασφαλείας· οι σελίδες διαχείρισης ποτέ στο Google και ποτέ από προσωρινή μνήμη.
if (!ARTIFACT) writeFileSync(join(OUT, "_headers"), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
/diaxeirisi*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
/en/admin*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
`);
writeFileSync(join(OUT, "robots.txt"), PROTOTYPE ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\nSitemap: ${B.domain}/sitemap.xml\n`);
console.log(`OK — ${n} σελίδες (ελληνικά + αγγλικά) → ${OUT}`);
