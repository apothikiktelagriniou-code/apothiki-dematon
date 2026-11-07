// Χτίσιμο ιστοσελίδας: node site/build.mjs            → site/dist (για δημοσίευση)
//                         node site/build.mjs --artifact → site/artifact (πρωτότυπο για προβολή στο Claude)
// Χωρίς εξαρτήσεις. Σελίδες: site/src/pages/*.html — η πρώτη γραμμή είναι <!--meta {...}-->.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as DATA from "./src/data.mjs";
import { FAQ } from "./src/faq.mjs";
import { SCHEDULE_TIMES } from "../src/schedule-seed.js";
import { SUPABASE_URL, SUPABASE_KEY } from "../src/config.js";
import { daysLabel } from "./src/calc.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = process.argv.includes("--artifact");
const PROTOTYPE = true; // false όταν εγκριθεί και δημοσιευτεί
const OUT = join(ROOT, ARTIFACT ? "artifact" : "dist");
const B = DATA.BUSINESS;
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const eur = n => n == null ? "—" : `${n} €`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "assets"), { recursive: true });

// ---------- assets ----------
for (const f of readdirSync(join(ROOT, "src/assets"))) copyFileSync(join(ROOT, "src/assets", f), join(OUT, "assets", f));
const calcSrc = readFileSync(join(ROOT, "src/calc.mjs"), "utf8").replace(/^export /gm, "");
const site = { ...DATA, SCHEDULE: SCHEDULE_TIMES.map(({ dest, time, days, express, conn, notes }) => ({ dest, time, days, express, conn, notes })), SUPABASE: { url: SUPABASE_URL, key: SUPABASE_KEY } };
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
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
};

// ---------- κομμάτια που χτίζονται από τα δεδομένα ----------
const C = DATA.CATEGORIES;
const tariffTable = () => {
  const order = ["athina", "patra", "thess", "ioannina", "larisa", "lamia", "volos", "ipeiros", "kriti", "nomos"]; // Κέρκυρα: μόλις μπουν τιμές
  return `<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Είδος δέματος</th>${order.map(k => `<th scope="col">${esc(DATA.TARIFFS[k].label)}</th>`).join("")}</tr></thead><tbody>${
    C.map(c => `<tr><th scope="row" style="font-weight:600">${esc(c.name)}</th>${order.map(k => { const v = DATA.TARIFFS[k].p[c.id]; return `<td class="${v == null ? "na" : ""}">${v == null ? "ρωτήστε" : eur(v)}</td>`; }).join("")}</tr>`).join("")
  }</tbody></table></div><p class="caption">Επίσημος τιμοκατάλογος ΚΤΕΛ Αιτωλοακαρνανίας, ανά τεμάχιο, με ΦΠΑ. Οι τιμές μπορεί να αλλάξουν· ισχύει η τιμή του ταμείου.</p>`;
};
const sizeTable = () => `<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Κατηγορία</th><th scope="col">Χωράει σε (εκ.)</th><th scope="col">Έως</th></tr></thead><tbody>${
  C.filter(c => c.box).map(c => `<tr><th scope="row" style="font-weight:600">${esc(c.name)}</th><td class="num">${c.box.L} × ${c.box.W} × ${c.box.H}</td><td class="num">${String(c.kg).replace(".", ",")} kg</td></tr>`).join("")
}<tr><th scope="row" style="font-weight:600">Μεγαλύτερο ή βαρύτερο</th><td colspan="2">Καλέστε μας</td></tr></tbody></table></div><p class="caption">Μετράει η μεγαλύτερη κατηγορία από τις δύο: διαστάσεις ή βάρος. Ένα μικρό κουτί 8 κιλών χρεώνεται ως μεσαίο.</p>`;

const destGroups = () => {
  const by = t => DATA.DESTINATIONS.filter(d => d.type === t).sort((a, b) => a.name.localeCompare(b.name, "el"));
  const chip = d => {
    const lbl = d.sched ? daysLabel(SCHEDULE_TIMES, d.sched) : "";
    return `<li><a href="apostoli.html?to=${encodeURIComponent(d.name)}#ypologismos" style="color:inherit;text-decoration:none">${esc(d.name)}</a>${lbl && lbl !== "Καθημερινά" ? ` <small>· ${esc(lbl)}</small>` : ""}</li>`;
  };
  const hubs = Object.entries(DATA.HUBS).map(([k, h]) => {
    const list = DATA.DESTINATIONS.filter(d => d.hub === k).sort((a, b) => a.name.localeCompare(b.name, "el"));
    return `<div class="panel"><h3>Μέσω ${esc(h.label)}</h3><p class="muted" style="margin-top:6px">${esc(h.eta)} Πληρώνετε εδώ την τιμή ${esc(DATA.TARIFFS[h.tariff].label)} και βάζετε περίπου άλλο τόσο σε φάκελο πάνω στο δέμα, για το πρακτορείο που συνεχίζει.</p><ul class="dest-list">${list.map(chip).join("")}</ul></div>`;
  }).join("");
  return `<div class="dest-groups">
  <div><h2>Απευθείας δρομολόγια</h2><p class="muted" style="margin-top:6px">Το δέμα φεύγει με το επόμενο λεωφορείο και φτάνει αυθημερόν. Δίπλα σε κάθε πόλη, οι μέρες που υπάρχει δρομολόγιο, αν δεν είναι καθημερινό.</p><ul class="dest-list">${by("direct").map(chip).join("")}</ul></div>
  <div><h2>Εντός Νομού Αιτωλοακαρνανίας</h2><p class="muted" style="margin-top:6px">Ίδια τιμή για όλο τον νομό.</p><ul class="dest-list">${by("local").map(chip).join("")}</ul></div>
  <div><h2>Με ανταπόκριση</h2><div class="grid g3" style="margin-top:12px">${hubs}</div></div>
  <div><h2>Ρωτήστε μας</h2><p class="muted" style="margin-top:6px">Για αυτούς τους προορισμούς η τιμή και η διαδρομή δίνονται στο τηλέφωνο.</p><ul class="dest-list">${by("ask").map(d => `<li>${esc(d.name)}</li>`).join("")}</ul></div>
  <div><h2>Δεν εξυπηρετούνται</h2><ul class="dest-list none">${by("none").map(d => `<li>${esc(d.name)}</li>`).join("")}</ul></div>
</div>`;
};

const hoursTable = () => `<table class="hours"><tbody>${B.hours.map(x => `<tr><td>${esc(x.days)}</td><td>${esc(x.time)}</td></tr>`).join("")}</tbody></table><p class="caption">${esc(B.holidaysNote)}</p>`;

const faqHtml = (onlyTop = false) => onlyTop
  ? FAQ.flatMap(c => c.items).filter(i => i.top).map(i => `<details class="q"><summary>${esc(i.q)}</summary><div class="a">${i.a}</div></details>`).join("")
  : FAQ.map(c => `<section class="faq-cat"><h2>${esc(c.cat)}</h2>${c.items.map(i => `<details class="q"><summary>${esc(i.q)}</summary><div class="a">${i.a}</div></details>`).join("")}</section>`).join("");

const counts = { direct: DATA.DESTINATIONS.filter(d => d.type === "direct").length, local: DATA.DESTINATIONS.filter(d => d.type === "local").length, transfer: DATA.DESTINATIONS.filter(d => d.type === "transfer").length,
  athensDaily: SCHEDULE_TIMES.filter(r => r.dest === "ΑΘΗΝΑ" && r.days[2] === "1").length, patraDaily: SCHEDULE_TIMES.filter(r => r.dest === "ΠΑΤΡΑ" && r.days[2] === "1").length };

const TOKENS = {
  "{{tariffTable}}": tariffTable, "{{sizeTable}}": sizeTable, "{{destGroups}}": destGroups, "{{hours}}": hoursTable,
  "{{faq}}": () => faqHtml(false), "{{faqTop}}": () => faqHtml(true),
  "{{phone}}": () => `<a class="num" href="tel:+30${B.phone}">${B.phoneDisplay}</a>`,
  "{{mobile}}": () => `<a class="num" href="tel:+30${B.mobile}">${B.mobileDisplay}</a>`,
  "{{whatsapp}}": () => `https://wa.me/30${B.mobile}`, "{{email}}": () => `<a href="mailto:${B.email}">${B.email}</a>`,
  "{{maps}}": () => B.mapsUrl, "{{ktel}}": () => B.ktelUrl, "{{name}}": () => esc(B.name), "{{slogan}}": () => esc(B.slogan),
  "{{nDirect}}": () => counts.direct, "{{nLocal}}": () => counts.local, "{{nTransfer}}": () => counts.transfer,
  "{{athensDaily}}": () => counts.athensDaily, "{{patraDaily}}": () => counts.patraDaily,
  "{{free}}": () => DATA.STORAGE.freeDays, "{{perDay}}": () => DATA.STORAGE.perDay, "{{cap}}": () => DATA.STORAGE.cap,
  "{{homePrice}}": () => DATA.HOME.zones[0].price, "{{homeHours}}": () => DATA.HOME.hours, "{{homeVehicles}}": () => DATA.HOME.vehicles,
  "{{homeZones}}": () => DATA.HOME.zones.map(z => `<option value="${z.id}">${esc(z.name)}</option>`).join(""),
  "{{athensNote}}": () => esc(DATA.HOME.athensNote), "{{luggage}}": () => DATA.LUGGAGE.perPiecePerDay, "{{cutoff}}": () => B.cutoffMin,
  "{{address}}": () => esc(`${B.address.place}, ${B.address.street}, ${B.address.postal} ${B.address.city}`),
  ...Object.fromEntries(Object.entries(I).map(([k, v]) => [`{{i:${k}}}`, () => v])),
};
const fill = s => s.replace(/\{\{[^}]+\}\}/g, m => TOKENS[m] ? String(TOKENS[m]()) : (console.warn("Άγνωστο:", m), m));

// ---------- πλαίσιο σελίδας ----------
const NAV = [
  ["apostoli.html", "Αποστολή"], ["paralavi.html", "Παραλαβή"], ["anazitisi.html", "Αναζήτηση"], ["proorismoi.html", "Προορισμοί"],
  ["epixeiriseis.html", "Επιχειρήσεις"], ["syxnes-erotiseis.html", "Ερωτήσεις"], ["epikoinonia.html", "Επικοινωνία"],
];
const localBusiness = () => ({
  "@context": "https://schema.org", "@type": "LocalBusiness", "@id": B.domain + "/#business", name: B.name, slogan: B.slogan, url: B.domain + "/",
  telephone: "+30" + B.phone, email: B.email, image: B.domain + "/assets/og.jpg", logo: B.domain + "/assets/icon-512.png",
  address: { "@type": "PostalAddress", streetAddress: B.address.street, addressLocality: B.address.city, postalCode: B.address.postal || undefined, addressRegion: B.address.region, addressCountry: "GR" },
  openingHoursSpecification: B.hours.map(x => ({ "@type": "OpeningHoursSpecification", dayOfWeek: x.schema.d, opens: x.schema.o, closes: x.schema.c })),
  areaServed: ["Αγρίνιο", "Αιτωλοακαρνανία"], paymentAccepted: B.payments.join(", "),
});
const faqLd = () => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.flatMap(c => c.items).map(i => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a.replace(/<[^>]+>/g, "") } })) });

function page(file, meta, body) {
  const url = B.domain + "/" + (file === "index.html" ? "" : file);
  const ld = [meta.ld === "business" ? localBusiness() : null, meta.ld === "faq" ? faqLd() : null].filter(Boolean);
  const nav = NAV.map(([href, label]) => `<a href="${href}"${href === file ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  const headInner = `<title>${esc(meta.title)}</title>
${ARTIFACT ? '<meta name="claude:viewport-fit-sides" content="cover">\n' : ""}<meta name="description" content="${esc(meta.description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website"><meta property="og:locale" content="el_GR"><meta property="og:site_name" content="${esc(B.name)}">
<meta property="og:title" content="${esc(meta.title)}"><meta property="og:description" content="${esc(meta.description)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${B.domain}/assets/og.jpg">
<meta name="theme-color" content="#12345A">
<link rel="icon" href="assets/icon-192.png"><link rel="apple-touch-icon" href="assets/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Commissioner:wght@600;700;800&family=JetBrains+Mono:wght@500;600&family=Noto+Sans:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="assets/site.css">
${ld.map(x => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join("\n")}
<!-- Στατιστικά χωρίς cookies (Cloudflare Web Analytics): μπαίνει εδώ μετά τη δημοσίευση. -->`;
  const content = `<a class="skip" href="#main">Μετάβαση στο περιεχόμενο</a>
${PROTOTYPE ? '<div class="proto">Πρωτότυπο για έγκριση — τιμές και όροι υπό έλεγχο, η σελίδα δεν είναι ακόμα δημόσια.</div>' : ""}
<header class="site-head"><div class="wrap">
  <a class="brand" href="index.html"><span class="chip"><img src="assets/mark.png" alt="" width="54" height="27"></span><span><b>Αποθήκη Δεμάτων</b><small>ΚΤΕΛ Αγρινίου</small></span></a>
  <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav">Μενού</button>
  <nav class="nav" id="nav" aria-label="Κύριο μενού">${nav}<a class="call" href="tel:+30${B.phone}">${B.phoneDisplay}</a></nav>
</div></header>
<main id="main">
${body}
</main>
<footer class="site-foot"><div class="wrap">
  <div><h3>${esc(B.name)}</h3><p>Πρακτορείο δεμάτων μέσα στον σταθμό ΚΤΕΛ Αγρινίου, με τα δρομολόγια του ΚΤΕΛ Αιτωλοακαρνανίας.</p><p style="margin-top:10px">Για εισιτήρια και δρομολόγια επιβατών: <a href="${B.ktelUrl}" rel="noopener">ΚΤΕΛ Αιτωλοακαρνανίας</a></p></div>
  <div><h3>Υπηρεσίες</h3><ul><li><a href="apostoli.html">Αποστολή δέματος</a></li><li><a href="paralavi.html">Παραλαβή δέματος</a></li><li><a href="anazitisi.html">Αναζήτηση δέματος</a></li><li><a href="spiti.html">Παράδοση στο σπίτι</a></li><li><a href="epixeiriseis.html">Για επιχειρήσεις</a></li></ul></div>
  <div><h3>Ωράριο</h3><ul>${B.hours.map(x => `<li>${esc(x.days)}<br><span class="num">${esc(x.time)}</span></li>`).join("")}</ul></div>
  <div><h3>Επικοινωνία</h3><ul><li><a class="num" href="tel:+30${B.phone}">${B.phoneDisplay}</a></li><li><a class="num" href="https://wa.me/30${B.mobile}">${B.mobileDisplay} (WhatsApp)</a></li><li><a href="mailto:${B.email}">${B.email}</a></li></ul></div>
  <div class="legal"><span>© ${new Date().getFullYear()} ${esc(B.name)}</span><span><a href="oroi.html">Όροι εξυπηρέτησης</a> · <a href="aporrito.html">Απόρρητο</a> · Χωρίς cookies</span></div>
</div></footer>
<script src="assets/app.js"></script>`;
  if (ARTIFACT && file === "index.html") return `${headInner}\n${content}\n`;
  return `<!doctype html>\n<html lang="el">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${headInner}\n</head>\n<body>\n${content}\n</body>\n</html>\n`;
}

// ---------- σελίδες ----------
const files = readdirSync(join(ROOT, "src/pages")).filter(f => f.endsWith(".html"));
const sitemap = [];
for (const f of files) {
  const raw = readFileSync(join(ROOT, "src/pages", f), "utf8");
  const m = raw.match(/^<!--meta\s*(\{[\s\S]*?\})\s*-->\s*/);
  if (!m) throw new Error("Λείπει meta: " + f);
  const meta = JSON.parse(m[1]);
  writeFileSync(join(OUT, f), page(f, meta, fill(raw.slice(m[0].length))));
  if (!meta.noindex) sitemap.push(B.domain + "/" + (f === "index.html" ? "" : f));
}
writeFileSync(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map(u => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`);
writeFileSync(join(OUT, "robots.txt"), PROTOTYPE ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\nSitemap: ${B.domain}/sitemap.xml\n`);
console.log(`OK — ${files.length} σελίδες → ${OUT}`);
