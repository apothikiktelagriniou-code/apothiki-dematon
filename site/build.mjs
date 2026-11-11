// Χτίσιμο ιστοσελίδας: node site/build.mjs            → site/dist (για δημοσίευση)
//                         node site/build.mjs --artifact → site/artifact (πρωτότυπο για προβολή στο Claude)
// Χωρίς εξαρτήσεις. Σελίδες: site/src/pages/*.html (ελληνικά) και site/src/pages-en/*.html (αγγλικά, στο /en/).
// Η πρώτη γραμμή κάθε σελίδας είναι <!--meta {...}-->.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
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
// Λανσάρισμα: LAUNCHED = true με το «πέρασέ το». Ακόμα και τότε, μόνο ο κλάδος main (CF_PAGES_BRANCH) βγαίνει δημόσιος·
// το dokimi και κάθε τοπικό build μένουν «Πρωτότυπο» (εκτός αν τρέξει με --live).
const LAUNCHED = false;
const BRANCH = process.env.CF_PAGES_BRANCH || "";
const PROTOTYPE = !(process.argv.includes("--live") || (LAUNCHED && BRANCH === "main"));
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
      const p = {}; for (const id of cats) { const v = t.p && t.p[id]; p[id] = v == null || v === "" || !isFinite(+v) || +v <= 0 ? null : +v; }
      T[t.key] = { label: t.label, p };
    }
    const TYPES = new Set(["direct", "local", "transfer", "ask", "none"]);
    const dests = (cat.destinations || []).filter(d => d && d.name && TYPES.has(d.type)).map(d => {
      const o = { name: d.name, region: d.region || "", type: d.type, tariff: d.tariff && T[d.tariff] ? d.tariff : null };
      if (d.type === "transfer") { if (!DATA0.HUBS[d.hub]) return null; o.hub = d.hub; }
      if ((d.type === "direct" || d.type === "local") && !o.tariff) { console.warn(`⚠ ${d.name}: χωρίς τιμοκατάλογο → «ρωτήστε»`); o.type = "ask"; }
      if (d.sched && d.sched.length) o.sched = d.sched;
      if (d.days && /^[01]{7}$/.test(d.days)) o.days = d.days;
      if (d.eta) o.eta = d.eta === "Αυθημερόν, με τα δρομολόγια της ημέρας" ? "Την ίδια μέρα, με τα δρομολόγια που αναγράφονται" : d.eta;
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
if (B.geo) B.mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${B.geo.lat},${B.geo.lng}`;
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const eur = n => n == null ? "—" : `${Number.isInteger(+n) ? n : (+n).toFixed(2).replace(".", ",")} €`;

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
const APP_JS = `// Παράγεται από site/build.mjs — μην το αλλάζετε με το χέρι.\n"use strict";\nconst SITE = ${JSON.stringify(site)};\n${calcSrc}\n${readFileSync(join(ROOT, "src/client.js"), "utf8")}`;
writeFileSync(join(OUT, "assets/app.js"), APP_JS);
// Γραμματοσειρές από το δικό μας σάιτ: μπαίνουν στην αρχή του site.css (ένα αρχείο, κανένα αίτημα σε τρίτους).
const SITE_CSS = readFileSync(join(ROOT, "src/assets/fonts.css"), "utf8") + "\n" + readFileSync(join(ROOT, "src/assets/site.css"), "utf8");
writeFileSync(join(OUT, "assets/site.css"), SITE_CSS);
rmSync(join(OUT, "assets/fonts.css"), { force: true });
// Έκδοση αρχείων (?v=…): αλλάζει μόνο όταν αλλάζει το περιεχόμενο, άρα ο browser μπορεί να τα κρατά για καιρό.
const ver = s => createHash("sha256").update(s).digest("hex").slice(0, 10);
const V_CSS = ver(SITE_CSS), V_JS = ver(APP_JS);

// ---------- εικονίδια (SVG, inline) ----------
const I = {
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>',
  receive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16v13H4z"/><path d="M9 11h6M12 3v8m-3-3 3 3 3-3"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="7" width="14" height="13" rx="2"/><path d="M9 7V4h6v3M9 20v1M15 20v1"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10M10 20v-6h4v6"/></svg>',
  shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h18l-1-5H4zM5 9v11h14V9M9 20v-6h6v6"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  bus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16M8 18v3M16 18v3M8 14.5h.01M16 14.5h.01"/></svg>',
  euro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M17 6.5A7 7 0 1 0 17 17.5M4 10h9M4 14h9"/></svg>',
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
// Εικονογράφηση τενεκέ με κλαδί ελιάς (δική μας, σε SVG) και εικονίδια για τον οδηγό συσκευασίας.
const OIL_ART = `<svg viewBox="0 0 260 220" role="presentation"><defs><linearGradient id="oaTin" x1="0" x2="1"><stop offset="0" stop-color="#F2CC5C"/><stop offset=".55" stop-color="#E3B23E"/><stop offset="1" stop-color="#C9962A"/></linearGradient><linearGradient id="oaLeaf" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#93AE45"/><stop offset="1" stop-color="#5A7224"/></linearGradient><linearGradient id="oaBox" x1="0" x2="1"><stop offset="0" stop-color="#D2A66A"/><stop offset="1" stop-color="#C3955A"/></linearGradient><radialGradient id="oaOl" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#6F7F35"/><stop offset="1" stop-color="#2F3911"/></radialGradient></defs><circle class="oa-disc" cx="138" cy="112" r="98" fill="#ECE7C8"/><ellipse cx="132" cy="198" rx="104" ry="9" fill="#000" opacity=".13"/><polygon points="138,94 156,80 228,80 210,94" fill="#E0BC86"/><polygon points="210,94 228,80 228,176 210,192" fill="#A97C45"/><rect x="138" y="94" width="72" height="98" fill="url(#oaBox)"/><polygon points="171,94 189,80 197,80 179,94" fill="#EAD7AE" opacity=".9"/><rect x="171" y="94" width="8" height="30" fill="#EAD7AE" opacity=".9"/><rect x="148" y="134" width="52" height="40" rx="3" fill="#F8F2E2"/><path d="M163 165v-21m-5 6 5-6 5 6M185 165v-21m-5 6 5-6 5 6" fill="none" stroke="#7A5A2A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M210 94 228 80" stroke="#8E6634" stroke-width="1" opacity=".5"/><polygon points="40,74 56,62 132,62 116,74" fill="#F6D877"/><polygon points="116,74 132,62 132,180 116,194" fill="#B4842A"/><rect x="40" y="74" width="76" height="120" rx="3" fill="url(#oaTin)"/><rect x="46" y="80" width="6" height="108" rx="3" fill="#fff" opacity=".28"/><path d="M40 98h76l16-12M40 172h76l16-12" fill="none" stroke="#A97A22" stroke-width="2.4" opacity=".75"/><path d="M60 70C58 44 96 40 98 66" fill="none" stroke="#8E6420" stroke-width="5" stroke-linecap="round"/><rect x="100" y="56" width="18" height="9" rx="2" fill="#8E6420"/><ellipse cx="109" cy="56" rx="9" ry="3.2" fill="#B78A35"/><rect x="50" y="110" width="56" height="52" rx="3" fill="#FFF8E5" stroke="#C99B30" stroke-width="1.5"/><path d="M66 140c6-6 14-10 24-12" fill="none" stroke="#6B5A2E" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="72" cy="133" rx="6" ry="2.4" transform="rotate(-40 72 133)" fill="url(#oaLeaf)"/><ellipse cx="81" cy="127" rx="6" ry="2.4" transform="rotate(-25 81 127)" fill="url(#oaLeaf)"/><ellipse cx="80" cy="137" rx="6" ry="2.4" transform="rotate(10 80 137)" fill="url(#oaLeaf)"/><circle cx="88" cy="132" r="3" fill="url(#oaOl)"/><circle cx="69" cy="141" r="2.6" fill="url(#oaOl)"/><rect x="60" y="148" width="36" height="4" rx="2" fill="#8A6A1E"/><rect x="66" y="155" width="24" height="3" rx="1.5" fill="#C9A64E"/><path d="M14 206C40 196 70 186 104 178" fill="none" stroke="#6B5A2E" stroke-width="3" stroke-linecap="round"/><g fill="url(#oaLeaf)"><ellipse cx="30" cy="193" rx="15" ry="5.2" transform="rotate(-38 30 193)"/><ellipse cx="36" cy="207" rx="15" ry="5.2" transform="rotate(22 36 207)"/><ellipse cx="56" cy="183" rx="15" ry="5.2" transform="rotate(-48 56 183)"/><ellipse cx="64" cy="199" rx="14" ry="5" transform="rotate(18 64 199)"/><ellipse cx="84" cy="176" rx="13" ry="4.8" transform="rotate(-42 84 176)"/><ellipse cx="90" cy="190" rx="13" ry="4.8" transform="rotate(14 90 190)"/></g><g><circle cx="46" cy="196" r="6.5" fill="url(#oaOl)"/><circle cx="74" cy="188" r="6" fill="url(#oaOl)"/><circle cx="98" cy="184" r="5" fill="url(#oaOl)"/><circle cx="44" cy="194" r="1.6" fill="#fff" opacity=".45"/><circle cx="72" cy="186" r="1.5" fill="#fff" opacity=".45"/><circle cx="96.5" cy="182.5" r="1.3" fill="#fff" opacity=".45"/></g></svg>`;
const OI = {
  need: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6v3H9z"/><path d="M7 6H5v15h14V6h-2"/><path d="m9 13 2 2 4-4"/></svg>',
  fill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="6" width="14" height="15" rx="2"/><path d="M5 10h14"/><path d="M9 8h6" stroke-dasharray="2 2"/></svg>',
  wipe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c-3 4-5 6.5-5 9a5 5 0 0 0 10 0c0-2.5-2-5-5-9z"/><path d="M4 21h16"/></svg>',
  cap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="9" width="14" height="12" rx="2"/><rect x="13" y="5" width="5" height="4" rx="1"/><path d="M11 3l9 8M20 3l-9 8"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8h12l-1 13H7z"/><path d="M9 8c0-3 1.5-5 3-5s3 2 3 5"/><path d="M10 5.5 14 4"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/><path d="M11 15h4"/></svg>',
  upright: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="9" width="10" height="12" rx="1.5"/><path d="M12 7V2m-3 3 3-3 3 3"/></svg>',
};

const WA_URL = `https://wa.me/30${B.mobile}`, VB_URL = `viber://chat?number=%2B30${B.mobile}`;

// ---------- κομμάτια που χτίζονται από τα δεδομένα (ανά γλώσσα) ----------
const C = DATA.CATEGORIES;
// Αντιστοίχιση σελίδων ελληνικά ↔ αγγλικά (αγγλικά στο /en/)
const SLUG = { index: "index", apostoli: "send", paralavi: "receive", anazitisi: "track", proorismoi: "destinations", epixeiriseis: "business",
  spiti: "home-delivery", klirosi: "giveaway", "syxnes-erotiseis": "faq", epikoinonia: "contact", oroi: "terms", aporrito: "privacy", poll: "poll", nomothesia: "legislation", ladi: "olive-oil", foitites: "students", diaxeirisi: "admin", "diaxeirisi-proorismon": "admin-destinations", "404": "404", "fylaxi-aposkevon": "luggage-storage", istoria: "history" };
const GR_OF = Object.fromEntries(Object.entries(SLUG).map(([g, e]) => [e, g]));
// Σελίδες ανά προορισμό («Αποστολή δέματος Αγρίνιο – Αθήνα»): μόνο για απευθείας προορισμούς με τιμές, από τα δεδομένα της διαχείρισης.
const DEST_PAGES = [["Αθήνα", "athina", "athens", "στην Αθήνα"], ["Πάτρα", "patra", "patras", "στην Πάτρα"], ["Θεσσαλονίκη", "thessaloniki", "thessaloniki", "στη Θεσσαλονίκη"], ["Ιωάννινα", "ioannina", "ioannina", "στα Ιωάννινα"],
  ["Λάρισα", "larisa", "larissa", "στη Λάρισα"], ["Βόλος", "volos", "volos", "στον Βόλο"], ["Πρέβεζα", "preveza", "preveza", "στην Πρέβεζα"], ["Άρτα", "arta", "arta", "στην Άρτα"], ["Λευκάδα", "lefkada", "lefkada", "στη Λευκάδα"], ["Καλαμάτα", "kalamata", "kalamata", "στην Καλαμάτα"]]
  .map(([name, gr, en, eis]) => { const key = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const ok = x => (x.type === "direct" || x.type === "local") && DATA.TARIFFS[tariffKey(DATA, x)];
    // πρώτα με το όνομα· αν μετονομάστηκε στη διαχείριση, με το κλειδί δρομολογίων (π.χ. «ΛΑΡΙΣΑ»)
    const d = DATA.DESTINATIONS.find(x => x.name === name && ok(x)) || DATA.DESTINATIONS.find(x => (x.sched || []).includes(key) && ok(x));
    return { d, gr: "dema-agrinio-" + gr, en: "parcel-agrinio-" + en, eis }; });
const MISSING_PAGES = DEST_PAGES.filter(x => !x.d);
for (const m of MISSING_PAGES) console.warn(`⚠ Η σελίδα ${m.gr} δεν χτίστηκε (ο προορισμός δεν έχει πια απευθείας δρομολόγιο/τιμή) → ανακατεύθυνση στους προορισμούς.`);
DEST_PAGES.splice(0, DEST_PAGES.length, ...DEST_PAGES.filter(x => x.d));
for (const p of DEST_PAGES) { SLUG[p.gr] = p.en; GR_OF[p.en] = p.gr; }
const counts = { direct: DATA.DESTINATIONS.filter(d => d.type === "direct").length, local: DATA.DESTINATIONS.filter(d => d.type === "local").length, transfer: DATA.DESTINATIONS.filter(d => d.type === "transfer").length,
  athensDaily: SCHED.filter(r => r.dest === "ΑΘΗΝΑ" && r.days[2] === "1").length, patraDaily: Math.max(...[0, 1, 2, 3, 4, 5, 6].map(i => SCHED.filter(r => r.dest === "ΠΑΤΡΑ" && r.days[i] === "1").length)) };

// ---------- Χάρτης διαδρομών (αρχική): από το assets/map.svg, απλοποιημένος, με διαδρομές που «ζωγραφίζονται» ----------
const MAP = (() => {
  const src = readFileSync(join(ROOT, "src/assets/map.svg"), "utf8");
  const land = (src.match(/<path d="([^"]+)" fill="#DCE6EC"/) || [])[1] || "";
  // απλοποίηση (Douglas–Peucker) για να μείνει ελαφρύ το inline SVG
  const rdp = (pts, eps) => { if (pts.length < 3) return pts; const [a, b] = [pts[0], pts[pts.length - 1]]; let dm = 0, idx = 0;
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len; if (d > dm) { dm = d; idx = i; } }
    return dm > eps ? [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)] : [a, b]; };
  const rings = land.split(/(?=M)/).map(r => [...r.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => [+m[1], +m[2]]));
  const d = rings.map(r => rdp(r, 0.9)).filter(r => r.length > 2).map(r => "M" + r.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join("L") + "Z").join("");
  const cities = [...src.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="8"[^>]*>(?:<\/circle>)?\s*<text x="([\d.]+)" y="([\d.]+)" text-anchor="(\w+)"[^>]*>([^<]+)<\/text>/g)]
    .map(m => ({ x: +m[1], y: +m[2], tx: +m[3], ty: +m[4], anchor: m[5], label: m[6] }));
  const hub = { x: 741.7, y: 488.8 };
  const plain = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  for (const c of cities) c.dest = DATA.DESTINATIONS.find(x => plain(x.name) === c.label);
  cities.sort((a, b) => Math.hypot(a.x - hub.x, a.y - hub.y) - Math.hypot(b.x - hub.x, b.y - hub.y));
  // Πόλεις με ανταπόκριση (μικροί κύκλοι στο map.svg + λίγες ακόμα της Β. Ελλάδας), συνδεδεμένες με την πόλη μεταφόρτωσης
  const loose = s => plain(s).replace(/^ΑΓ\. /, "ΑΓΙΟΣ ").replace(/ \(.*\)$/, "");
  const extra = [{ x: 1266, y: 104.8, tx: 1276, ty: 98, anchor: "start", label: "Ορεστιάδα" },
                 { x: 807.3, y: 198.5, tx: 807.3, ty: 184, anchor: "middle", label: "Έδεσσα" }];
  const via = [...[...src.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="5"[^>]*>(?:<\/circle>)?\s*<text x="([\d.]+)" y="([\d.]+)" text-anchor="(\w+)"[^>]*>([^<]+)<\/text>/g)]
    .map(m => ({ x: +m[1], y: +m[2], tx: +m[3], ty: +m[4], anchor: m[5], label: m[6] })), ...extra]
    .map(c => ({ ...c, dest: DATA.DESTINATIONS.find(x => x.hub && loose(x.name) === loose(c.label)) }))
    .filter(c => c.dest)
    .map(c => { const hs = DATA.HUBS[c.dest.hub].sched.map(k => cities.find(h => h.label === k) || (k === "ΑΘΗΝΑ" && c.dest.hub === "korinthos" ? cities.find(h => h.label === "ΙΣΘΜΟΣ") : null)).filter(Boolean);
      const from = c.dest.hub === "korinthos" ? cities.find(h => h.label === "ΙΣΘΜΟΣ") : hs.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
      return { ...c, from }; }).filter(c => c.from);
  return { d, cities, hub, via };
})();
const routesSvg = (lang, L, link) => {
  const href = d => { const dp = DEST_PAGES.find(p => p.d.name === d.name); return dp ? link(dp.gr) : `${link("apostoli")}?to=${encodeURIComponent(d.name)}#ypologismos`; };
  const lbl = d => esc(L(d.name)) + (lang === "en" ? ": price and times" : ": τιμή και ώρες");
  const { d, cities, hub, via } = MAP, r1 = n => Math.round(n * 10) / 10, N = cities.length;
  const routes = cities.map((c, i) => { const mx = (hub.x + c.x) / 2, my = (hub.y + c.y) / 2, dx = c.x - hub.x, dy = c.y - hub.y, k = 0.16 * (i % 2 ? 1 : -1);
    return `<path class="rt" data-r="${i}" pathLength="1" style="--i:${i}" d="M${hub.x},${hub.y}Q${r1(mx - dy * k)},${r1(my + dx * k)} ${c.x},${c.y}"/>`; }).join("");
  const dots = cities.map((c, i) => (c.dest ? `<a href="${href(c.dest)}" aria-label="${lbl(c.dest)}" data-r="${i}">` : "") + `<g class="ct" style="--i:${i}"><circle class="hit" cx="${c.x}" cy="${c.y}" r="16"/><circle cx="${c.x}" cy="${c.y}" r="7"/><text x="${c.tx}" y="${c.ty}" text-anchor="${c.anchor}"${c.dest ? "" : ' aria-hidden="true"'}>${esc(c.dest ? L(c.dest.name) : c.label)}</text></g>` + (c.dest ? "</a>" : "")).join("");
  const vRoutes = via.map((c, i) => `<path class="rt via" data-r="v${i}" style="--i:${N + i}" d="M${c.from.x},${c.from.y}L${c.x},${c.y}"/>`).join("");
  const vDots = via.map((c, i) => `<a href="${href(c.dest)}" aria-label="${lbl(c.dest)}" data-r="v${i} ${cities.indexOf(c.from)}"><g class="ct via" style="--i:${N + i}"><circle class="hit" cx="${c.x}" cy="${c.y}" r="14"/><circle cx="${c.x}" cy="${c.y}" r="5"/><text x="${c.tx}" y="${c.ty}" text-anchor="${c.anchor}">${esc(L(c.dest.name))}</text></g></a>`).join("");
  const lx = 560, ly = 905, en = lang === "en";
  const legend = `<g class="legend"><path class="rt" d="M${lx},${ly}h46"/><circle class="lg-d" cx="${lx + 46}" cy="${ly}" r="7"/><text x="${lx + 62}" y="${ly + 7}">${en ? "Direct" : "Απευθείας"}</text>`
    + `<path class="rt via" d="M${lx},${ly + 36}h46"/><circle class="lg-v" cx="${lx + 46}" cy="${ly + 36}" r="5"/><text x="${lx + 62}" y="${ly + 43}">${en ? "With a connection" : "Με ανταπόκριση"}</text></g>`;
  return `<svg class="routes-svg" viewBox="545 60 905 925" role="group" aria-labelledby="rm-t"><title id="rm-t">${en ? "Parcel routes from Agrinio, direct and with a connection" : "Διαδρομές δεμάτων από το Αγρίνιο, απευθείας και με ανταπόκριση"}</title>`
    + `<path class="land" d="${d}"/><g class="rts">${vRoutes}${routes}</g>${vDots}${dots}${legend}`
    + `<g class="hub" aria-hidden="true"><circle class="pulse" cx="${hub.x}" cy="${hub.y}" r="13"/><circle cx="${hub.x}" cy="${hub.y}" r="12"/><text x="${hub.x - 18}" y="${hub.y + 40}" text-anchor="end">${lang === "en" ? "AGRINIO" : "ΑΓΡΙΝΙΟ"}</text></g></svg>`;
};

function makeLang(lang) {
  const t = (el, en) => (lang === "en" ? en : el);
  const L = s => tr(s, lang);
  const link = gr => !ARTIFACT && gr === "index" ? "./" : (lang === "en" ? SLUG[gr] : gr) + EXT;   // σύνδεσμος σελίδας στην ίδια γλώσσα
  const sortL = (a, b) => L(a.name).localeCompare(L(b.name), lang);
  const kgFmt = n => (lang === "en" ? String(n) : String(n).replace(".", ","));
  const eur = n => n == null ? "—" : (lang === "en" ? `€${Number.isInteger(+n) ? n : (+n).toFixed(2)}` : `${Number.isInteger(+n) ? n : (+n).toFixed(2).replace(".", ",")} €`);
  const dateTxt = ymd => new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "el-GR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(ymd + "T00:00:00Z"));
  const money2 = n => (lang === "en" ? `€${n.toFixed(2)}` : `${n.toFixed(2).replace(".", ",")} €`);
  const money = n => (Number.isInteger(n) ? (lang === "en" ? `€${n}` : `${n} €`) : money2(n)).replace(" €", "\u00a0€");
  const ow = DATA.OVERWEIGHT;
  const pre0 = lang === "en" ? "../" : "";
  const brandImg = (n, alt, hgt) => { const f = brandFile(n); return f ? `<img class="brand-logo" src="${pre0}assets/brands/${f}" alt="${esc(alt)}" height="${hgt}" style="height:${hgt}px;width:auto">` : ""; };
  const chatButtons = () => `<span class="chat-btns"><a class="btn btn-wa" href="${WA_URL}">${brandImg("whatsapp", "", 22) || I.chat}WhatsApp</a>${B.viber ? `<a class="btn btn-vb" href="${VB_URL}">${brandImg("viber", "", 22) || I.chat}Viber</a>` : ""}</span>`;

  const tariffTable = () => {
    const pref = ["athina", "patra", "thess", "ioannina", "larisa", "lamia", "volos", "ipeiros", "kriti", "nomos"];
    const order = [...pref.filter(k => DATA.TARIFFS[k]), ...Object.keys(DATA.TARIFFS).filter(k => !pref.includes(k))];
    return `<div class="table-wrap"><table class="data"><thead><tr><th scope="col">${t("Είδος δέματος", "Item")}</th>${order.map(k => `<th scope="col">${esc(L(DATA.TARIFFS[k].label))}</th>`).join("")}</tr></thead><tbody>${
      C.map(c => `<tr><th scope="row" style="font-weight:600">${esc(L(c.name))}</th>${order.map(k => { const v = DATA.TARIFFS[k].p[c.id]; return `<td class="${v == null ? "na" : ""}">${v == null ? t("ρωτήστε", "ask") : eur(v)}</td>`; }).join("")}</tr>`).join("")
    }${ow.enabled ? `<tr><th scope="row" style="font-weight:600">${t(`Ανά κιλό πάνω από ${ow.fromKg} kg`, `Per kg over ${ow.fromKg} kg`)}</th>${order.map(k => `<td>+${money2(kgRate(ow, DATA.TARIFFS[k]))}</td>`).join("")}</tr>` : ""}</tbody></table></div><p class="caption">${t("Ενδεικτικές τιμές από τον επίσημο τιμοκατάλογο του ΚΤΕΛ Αιτωλοακαρνανίας, ανά τεμάχιο, με ΦΠΑ. Η τελική τιμή βγαίνει στον πάγκο, μετά από ζύγισμα και μέτρηση.", "Indicative prices from the official KTEL Aetolia-Acarnania price list, per item, VAT included. The final price is set at the counter after weighing and measuring.")}${
      ow.enabled ? " " + t(`Επιβάρυνση βάρους (τελευταία γραμμή): για κουτιά, φακέλους και τσουβάλια, ανά κιλό πάνω από ${ow.fromKg} kg και ανά τεμάχιο, στρογγυλεμένη στο επόμενο ευρώ. Τενεκέδες και αρνί έχουν σταθερή τιμή.`, `Weight surcharge (last row): for boxes, envelopes and sacks, per kg over ${ow.fromKg} kg and per item, rounded up to the next euro. Tins and lamb have a fixed price.`) : ""}</p>`;
  };
  const sizeTable = () => `<div class="table-wrap"><table class="data stack"><thead><tr><th scope="col">${t("Κατηγορία", "Category")}</th><th scope="col">${t("Χωράει σε (εκ.)", "Fits in (cm)")}</th><th scope="col">${t("Έως", "Up to")}</th></tr></thead><tbody>${
    C.filter(c => c.box).map(c => `<tr><th scope="row" style="font-weight:600">${esc(L(c.name))}</th><td class="num" data-label="${t("Χωράει σε (εκ.)", "Fits in (cm)")}">${c.box.L} × ${c.box.W} × ${c.box.H}</td><td class="num" data-label="${t("Έως", "Up to")}">${kgFmt(c.kg)} kg</td></tr>`).join("")
  }<tr><th scope="row" style="font-weight:600">${t("Μεγαλύτερο ή βαρύτερο", "Larger or heavier")}</th><td colspan="2" style="grid-column:1/-1">${t("Καλέστε μας", "Call us")}</td></tr></tbody></table></div><p class="caption">${t("Μετράει η μεγαλύτερη κατηγορία από τις δύο: διαστάσεις ή βάρος. Ένα μικρό κουτί 8 κιλών χρεώνεται ως μεσαίο.", "The larger of the two counts: size or weight. A small box weighing 8 kg is charged as medium.")}</p>`;

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
      if (!list.length) return "";
      return `<div class="panel"><h3>${t("Ανταπόκριση:", "Via")} ${esc(L(h.label))}</h3><p class="muted" style="margin-top:6px">${esc(L(h.eta))} ${t(`Πληρώνετε εδώ την τιμή ${esc(L(DATA.TARIFFS[h.tariff].label))} και βάζετε περίπου άλλο τόσο σε φάκελο πάνω στο δέμα, για το πρακτορείο που συνεχίζει.`, `You pay the ${esc(L(DATA.TARIFFS[h.tariff].label))} price here and put about the same amount in an envelope on the parcel, for the agency that carries it on.`)}</p><ul class="dest-list">${list.map(chip).join("")}</ul></div>`;
    }).join("");
    return `<div class="dest-groups">
  <div><h2>${t("Απευθείας δρομολόγια", "Direct buses")}</h2><p class="muted" style="margin-top:6px">${t("Το δέμα φτάνει την ίδια μέρα, με τα δρομολόγια που αναγράφονται. Δίπλα σε κάθε πόλη, οι μέρες που υπάρχει δρομολόγιο, αν δεν είναι καθημερινό.", "It arrives the same day, on the listed schedules. Next to each town: the days with a bus, if not daily.")}</p><ul class="dest-list">${by("direct").map(chip).join("")}</ul></div>
  <div><h2>${t("Εντός Νομού Αιτωλοακαρνανίας", "Within Aetolia-Acarnania")}</h2><p class="muted" style="margin-top:6px">${t("Ίδια τιμή για όλο τον νομό.", "One price for the whole prefecture.")}</p><ul class="dest-list">${by("local").map(chip).join("")}</ul></div>
  <div><h2>${t("Με ανταπόκριση", "With connection")}</h2><div class="grid g3" style="margin-top:12px">${hubs}</div></div>
  ${by("ask").length ? `<div><h2>${t("Ρωτήστε μας", "Ask us")}</h2><ul class="dest-list">${by("ask").map(d => `<li>${esc(L(d.name))}</li>`).join("")}</ul></div>` : ""}
  ${by("none").length ? `<div><h2>${t("Δεν εξυπηρετούνται", "Not served")}</h2><ul class="dest-list none">${by("none").map(d => `<li>${esc(L(d.name))}</li>`).join("")}</ul></div>` : ""}
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
    // Κάρτα «Εποχή λαδιού» στην αρχική: μόνο μέσα στην εποχή (ημερομηνία του build, ώρα Ελλάδας).
    "{{oilArt}}": () => OIL_ART,
    "{{tinPack}}": () => { const k = DATA.PACKING.items.find(i => i.id === "tenekes"); return k ? money(k.service) : "—"; },
    "{{tinBox}}": () => { const k = DATA.PACKING.items.find(i => i.id === "tenekes"); return k ? money(k.material) : "—"; },
    "{{oilBanner}}": () => {
      const md = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", month: "2-digit", day: "2-digit" }).format(new Date()).replace("/", "-");
      const { from, to } = DATA.OIL_SEASON || { from: "10-01", to: "02-28" }, inSeason = from <= to ? md >= from && md <= to : md >= from || md <= to;
      if (!inSeason) return "";
      const tfOf = (n, key) => { const d = DATA.DESTINATIONS.find(x => x.name === n) || DATA.DESTINATIONS.find(x => (x.sched || []).includes(key)); const k = d && tariffKey(DATA, d); return (k && DATA.TARIFFS[k]) || { p: {} }; };
      const tf = tfOf("Αθήνα", "ΑΘΗΝΑ"), tfP = tfOf("Πάτρα", "ΠΑΤΡΑ");
      const PK_TIN = DATA.PACKING.items.find(i => i.id === "tenekes") || { service: 4 };
      return `<section class="oil-band" aria-labelledby="oil-h"><div class="wrap">
  <div class="oil-art" aria-hidden="true">${OIL_ART}</div>
  <div class="oil-copy">
    <span class="oil-kicker">${t("Εποχή λαδιού", "Olive oil season")}</span>
    <h2 id="oil-h">${t("Το λάδι της χρονιάς, στους δικούς σας", "This year's oil, to your family")}</h2>
    <p>${t(`Ο τενεκές ταξιδεύει μέσα σε χαρτοκιβώτιο. Φέρτε τον έτοιμο, ή αφήστε τη συσκευασία σε εμάς με ${money(PK_TIN.service)}: κούτα, σακούλα, ταινία και σήμανση.`, `The tin travels inside a cardboard box. Bring it packed, or let us pack it for ${money(PK_TIN.service)}: box, bag, tape and labels.`)}</p>
    <ul class="oil-prices">
      ${tf.p.tenekes != null ? `<li><b>${eur(tf.p.tenekes)}</b><span>${t("τενεκές για Αθήνα", "a tin to Athens")}</span></li>` : ""}
      ${tfP.p.tenekes != null ? `<li><b>${eur(tfP.p.tenekes)}</b><span>${t("τενεκές για Πάτρα", "a tin to Patras")}</span></li>` : ""}
      <li><b>+${money(PK_TIN.service)}</b><span>${t("αν το συσκευάσουμε εμείς", "if we pack it")}</span></li>
    </ul>
    <p class="oil-ctas"><a class="btn btn-primary" href="${link("ladi")}#syskevasia">${t("Πώς τον συσκευάζω", "How to pack it")} →</a><a class="btn btn-ghost" href="${link("ladi")}#times">${t("Τιμές για όλες τις πόλεις", "Prices for all cities")}</a></p>
  </div>
</div></section>`;
    },
    // «Το ταξίδι του δέματος»: στατικά για την Αθήνα (χωρίς JavaScript)· το client.js τα προσαρμόζει στον προορισμό και στην ώρα.
    "{{journey}}": () => {
      const list = DATA.DESTINATIONS.filter(d => (d.type === "direct" || d.type === "local") && d.sched && d.sched.length && DATA.TARIFFS[tariffKey(DATA, d)]).sort(sortL);
      if (!list.length) return "";
      const d0 = list.find(d => d.name === "Αθήνα") || list[0], tf = DATA.TARIFFS[tariffKey(DATA, d0)];
      const step = (k, icon, title, main, sub) => `<li data-j="${k}"><span class="j-node">${icon}</span><div><h3>${title}</h3><p class="j-main">${main}</p><p class="j-sub">${sub}</p></div></li>`;
      const tel = d0.terminalPhone ? String(d0.terminalPhone).split(/\s*[,;]\s*/).map(n => `<a class="num" href="tel:+30${n.replace(/\D/g, "")}">${esc(n)}</a>`).join(", ") : "";
      return `<div class="journey" data-journey>
  <label class="j-pick"><span>${t("Πού το στέλνετε;", "Where to?")}</span><select data-j-dest>${list.map(d => `<option value="${esc(d.name)}"${d === d0 ? " selected" : ""}>${esc(L(d.name))}</option>`).join("")}</select></label>
  <ol class="j-steps">
    ${step("drop", I.send, t("Φέρτε το", "Bring it"), t(`Τουλάχιστον ${B.cutoffMin} λεπτά πριν από την αναχώρηση`, `At least ${B.cutoffMin} minutes before departure`), t(`Για λεωφορεία πριν ανοίξουμε, από το προηγούμενο βράδυ έως τις ${B.eveningBy}.`, `For buses before we open, the evening before, by ${B.eveningBy}.`))}
    ${step("pay", I.euro, t("Πληρώνετε", "Pay"), [tf.p.fakelos != null ? t(`Φάκελος ${eur(tf.p.fakelos)}`, `Envelope ${eur(tf.p.fakelos)}`) : "", tf.p.mikro != null ? t(`μικρό κουτί ${eur(tf.p.mikro)}`, `small box ${eur(tf.p.mikro)}`) : ""].filter(Boolean).join(" · "), t("Ενδεικτικά. Η τελική τιμή βγαίνει στο ταμείο.", "Indicative. The final price is set at the counter."))}
    ${step("go", I.bus, t("Φεύγει", "It leaves"), t("Με το επόμενο δρομολόγιο", "On the next scheduled bus"), esc(L(d0.eta || "")))}
    ${step("get", I.receive, t("Παραλαβή", "Collection"), esc(d0.terminal || t("Στο ΚΤΕΛ του προορισμού", "At the destination bus station")), [esc(d0.terminalAddr || ""), tel].filter(Boolean).join(" · ") + `<br>${t("Με ταυτότητα. Μπορεί να το πάρει και άλλος, με τη δική του.", "With ID. Someone else can collect it with their own ID.")}`)}
    <span class="j-parcel" aria-hidden="true">${I.send}</span>
  </ol>
  <div class="j-ctas"><a class="btn btn-ghost" data-j-calc href="${link("apostoli")}?to=${encodeURIComponent(d0.name)}#ypologismos">${t("Ακριβής τιμή", "Exact price")} →</a>${chatButtons()}</div>
</div>`;
    },
    "{{routesMap}}": () => {
      const hrefOf = d => { const dp = DEST_PAGES.find(p => p.d.name === d.name); return dp ? link(dp.gr) : `${link("apostoli")}?to=${encodeURIComponent(d.name)}#ypologismos`; };
      const all = [...MAP.cities.filter(c => c.dest).map(c => ({ d: c.dest, via: null })), ...MAP.via.map(c => ({ d: c.dest, via: c.from }))].sort((a, b) => L(a.d.name).localeCompare(L(b.d.name), lang));
      const list = `<details class="map-list" id="map-list"><summary>${t(`Όλες οι πόλεις του χάρτη (${all.length})`, `All towns on the map (${all.length})`)}</summary><ul>${all.map(x => `<li><a href="${hrefOf(x.d)}">${esc(L(x.d.name))}${x.via ? `<small>${t("ανταπόκριση", "connection")}</small>` : ""}</a></li>`).join("")}</ul></details>`;
      return `<figure class="routes-map" data-routes><a class="skip-map" href="#map-list">${t("Παράλειψη χάρτη", "Skip map")}</a>${routesSvg(lang, L, link)}<figcaption class="map-hint">${t("Πατήστε μια πόλη για τιμή και ώρες, ή δείτε τη λίστα.", "Tap a town for price and times, or see the list.")}</figcaption>${list}</figure>`;
    },
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
        : d.type === "transfer" ? `${t("Ανταπόκριση:", "Via")} ${L(DATA.HUBS[d.hub].label)}` : d.type === "ask" ? t("Ρωτήστε μας", "Ask us") : t("Δεν εξυπηρετείται", "Not served");
      const tag = d => d.type === "none" ? "" : d.type === "transfer" ? "info" : "ok";
      const rows = DATA.DESTINATIONS.slice().sort(sortL).map(d => {
        const tf = DATA.TARIFFS[tariffKey(DATA, d)];
        const days = destDays(DATA, SCHED, d, lang);
        const eta = d.type === "transfer" ? (d.eta || DATA.HUBS[d.hub].eta) : d.eta;
        const from = tf && tf.p.fakelos != null ? `${t("από", "from")} ${eur(tf.p.fakelos)}${d.type === "transfer" ? t(" + χρέωση ανταπόκρισης", " + connection fee") : ""}` : "—";
        const calc = d.type === "none" || d.type === "ask" ? "" : `<a href="${link("apostoli")}?to=${encodeURIComponent(d.name)}#ypologismos">${t("Υπολογισμός", "Calculate")}<span class="sr-only"> ${t("για", "for")} ${esc(L(d.name))}</span></a>`;
        return `<tr data-q="${esc((d.name + " " + (EN[d.name] || "") + " " + d.region + " " + (EN[d.region] || "")).toLowerCase())}"${DEST_PAGES.some(p => p.d.name === d.name) ? ' data-top="1"' : ""}${d.type === "none" ? ' class="off"' : ""}><th scope="row">${esc(L(d.name))}<small>${esc(L(d.region))}</small></th><td>${tag(d) ? `<span class="tag ${tag(d)}">${esc(typeTxt(d))}</span>` : esc(typeTxt(d))}</td><td>${tf ? esc(L(tf.label)) : "—"}</td><td>${from}</td><td>${esc(days) || "—"}</td><td class="wrap-cell">${esc(L(eta) || "")}</td><td>${calc}</td></tr>`;
      }).map(r => { const lab = [t("Πώς πάει", "Route"), t("Τιμοκατάλογος", "Price list"), t("Φάκελος", "Envelope"), t("Μέρες", "Days"), t("Παράδοση", "Delivery"), ""]; let i = 0;
        return r.replace(/<td( class="[^"]*")?>/g, (m, c) => `<td${c || ""} data-label="${esc(lab[i++] || "")}">`); }).join("");
      return `<div class="field" style="max-width:420px;margin-bottom:12px"><label for="dt-q">${t("Βρείτε πόλη", "Find a town")}</label><input id="dt-q" type="search" data-dest-filter placeholder="${t("π.χ. Τρίπολη", "e.g. Tripoli")}" autocomplete="off"></div>
<div class="table-wrap"><table class="data dest-table"><thead><tr><th scope="col">${t("Προορισμός", "Destination")}</th><th scope="col">${t("Πώς πάει", "Route")}</th><th scope="col">${t("Τιμοκατάλογος", "Price list")}</th><th scope="col">${t("Φάκελος", "Envelope")}</th><th scope="col">${t("Μέρες δρομολογίου", "Bus days")}</th><th scope="col">${t("Παράδοση", "Delivery")}</th><th scope="col"><span class="sr-only">${t("Υπολογισμός τιμής", "Price calculator")}</span></th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="caption" data-dest-count role="status" aria-live="polite"></p>
<div class="notice info dest-help" style="margin-top:16px;max-width:70ch"><b>${t("Δεν βρίσκετε τον προορισμό σας;", "Can't find your destination?")}</b>${t("Καλέστε μας και θα βρούμε τρόπο να σας εξυπηρετήσουμε: ", "Call us and we will find a way to help: ")}<a class="num" href="tel:+30${B.phone}">${lang === "en" ? "+30 " : ""}${B.phoneDisplay}</a> · <a href="${WA_URL}">WhatsApp</a></div>`;
    },
    "{{packingTable}}": () => { const P = DATA.PACKING, m = n => (lang === "en" ? `€${Number.isInteger(n) ? n : n.toFixed(2)}` : `${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")} €`);
      return `<div class="table-wrap"><table class="data stack"><thead><tr><th scope="col">${t("Είδος", "Item")}</th><th scope="col">${t("Μόνο υλικό", "Material only")}</th><th scope="col">${t("Το πακετάρουμε εμείς", "We pack it")}</th></tr></thead><tbody>${
        P.items.map(i => `<tr><th scope="row" style="font-weight:600">${esc(L(i.name))}${i.active && !P.active ? ` <span class="tag ok">${t("Διαθέσιμο", "Available")}</span>` : ""}</th><td data-label="${t("Μόνο υλικό", "Material only")}">${m(i.material)}</td><td data-label="${t("Το πακετάρουμε εμείς", "We pack it")}">${m(i.service)}</td></tr>`).join("")
      }<tr><th scope="row" style="font-weight:600">${t("Εύθραυστο (γέμισμα, σήμανση)", "Fragile (padding, labels)")}</th><td data-label="${t("Μόνο υλικό", "Material only")}">—</td><td data-label="${t("Το πακετάρουμε εμείς", "We pack it")}">+${m(P.fragile)}</td></tr></tbody></table></div><p class="caption">${t("Με ΦΠΑ. Ταινία και stretch film δωρεάν με την αγορά κούτας. Η συσκευασία χρεώνεται χωριστά από τον ναύλο του ΚΤΕΛ.", "VAT included. Tape and stretch film free with any box. Packing is charged separately from the KTEL fare.")}</p>`; },
    "{{cEnd}}": () => dateTxt(DATA.CONTEST.end), "{{cDraw}}": () => dateTxt(DATA.CONTEST.draw), "{{cWinners}}": () => DATA.CONTEST.winners,
    "{{cDeliveries}}": () => DATA.CONTEST.prizeDeliveries, "{{cFallback}}": () => DATA.CONTEST.fallbackShipments, "{{cFallbackUntil}}": () => dateTxt(DATA.CONTEST.fallbackUntil),
    "{{owFrom}}": () => ow.fromKg, "{{owShare}}": () => Math.round(ow.share * 100),
    "{{owExamples}}": () => ["nomos", "patra", "athina", "thess", "kriti"].filter(k => DATA.TARIFFS[k]).map(k => { const tf = DATA.TARIFFS[k]; return `${esc(L(tf.label))}: ${money2(kgRate(ow, tf))}/kg`; }).join(" · "),
    "{{address}}": () => esc(`${L(B.address.place)}, ${L(B.address.street)}, ${B.address.postal} ${L(B.address.city)}`),
    ...Object.fromEntries(Object.entries(I).map(([k, v]) => [`{{i:${k}}}`, () => v])),
    ...Object.fromEntries(Object.entries(OI).map(([k, v]) => [`{{oi:${k}}}`, () => v])),
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
      return days;
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
      telephone: "+30" + B.phone, email: B.email, ...(B.legalName ? { legalName: L(B.legalName) } : {}), ...(B.afm ? { taxID: B.afm } : {}), image: [...imgs, B.domain + "/assets/og.jpg"], logo: B.domain + "/assets/icon-512.png",
      contactPoint: { "@type": "ContactPoint", telephone: "+30" + B.mobile, contactType: "customer service", availableLanguage: ["el", "en"] },
      address: { "@type": "PostalAddress", streetAddress: `${B.address.place}, ${B.address.street}`, addressLocality: B.address.city, postalCode: B.address.postal, addressRegion: B.address.region, addressCountry: "GR" },
      ...(B.geo ? { geo: { "@type": "GeoCoordinates", latitude: B.geo.lat, longitude: B.geo.lng } } : {}),
      containedInPlace: { "@type": "BusStation", name: "Υπεραστικός σταθμός ΚΤΕΛ Αγρινίου" },
      openingHoursSpecification: [
        ...B.hours.map(x => ({ "@type": "OpeningHoursSpecification", dayOfWeek: x.schema.d, opens: x.schema.o, closes: x.schema.c })),
        ...(B.closedDates || []).map(d => ({ "@type": "OpeningHoursSpecification", opens: "00:00", closes: "00:00", validFrom: d, validThrough: d })),
        ...(B.sundayHoursDates || []).map(d => ({ "@type": "OpeningHoursSpecification", opens: B.hours[1].schema.o, closes: B.hours[1].schema.c, validFrom: d, validThrough: d })),
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
<meta property="og:url" content="${url}"><meta property="og:image" content="${B.domain}/assets/og.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:locale:alternate" content="${t("en_GB", "el_GR")}">
<meta name="theme-color" content="#0C3456" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0A2236" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${pre}assets/icon-192.png"><link rel="apple-touch-icon" href="${pre}assets/icon-192.png">
<link rel="preload" href="${pre}assets/fonts/fira-sans-condensed-greek-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${pre}assets/fonts/fira-sans-greek-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${pre}assets/site.css?v=${V_CSS}">
${ld.map(x => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join("\n")}
<!-- Στατιστικά χωρίς cookies (Cloudflare Web Analytics): μπαίνει εδώ μετά τη δημοσίευση. -->`;
    const content = `<a class="skip" href="#main">${t("Μετάβαση στο περιεχόμενο", "Skip to content")}</a>
${PROTOTYPE ? `<aside class="proto" aria-label="${t("Σημείωση", "Note")}">${t("Πρωτότυπο για έγκριση — τιμές και όροι υπό έλεγχο, η σελίδα δεν είναι ακόμα δημόσια.", "Prototype for approval — prices and terms under review; not public yet.")}</aside>` : ""}
<header class="site-head"><div class="wrap">
  <a class="brand" href="${link("index")}"><span class="chip"><img src="${pre}assets/mark.png" alt="" width="54" height="27"></span><span><b>${t("Αποθήκη Δεμάτων", "Parcel Depot")}</b><small>${t("ΚΤΕΛ Αγρινίου", "KTEL Agrinio")}</small></span></a>
  <a class="lang-switch" href="${other}" hreflang="${t("en", "el")}" lang="${t("en", "el")}">${t("EN", "ΕΛ")}</a>
  <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav"><svg class="mb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span class="mb-txt">${t("Μενού", "Menu")}</span></button>
  <nav class="nav" id="nav" aria-label="${t("Κύριο μενού", "Main menu")}">${nav}<a class="call" href="tel:+30${B.phone}">${B.phoneDisplay}</a></nav>
</div></header>
<main id="main">
${body}
</main>
<footer class="site-foot"><div class="wrap">
  <div><h2 class="foot-h">${esc(L(B.name))}</h2><p>${t("Αποθήκη δεμάτων μέσα στον σταθμό ΚΤΕΛ Αγρινίου, με τα δρομολόγια του ΚΤΕΛ Αιτωλοακαρνανίας.", "Parcel agency inside the KTEL Agrinio bus station, using KTEL Aetolia-Acarnania buses.")}</p><p style="margin-top:10px">${t("Δέματα για", "Parcels to")} ${DEST_PAGES.map(p => `<a href="${link(p.gr)}">${esc(L(p.d.name))}</a>`).join(" · ")}</p><p style="margin-top:10px">${t("Για εισιτήρια και δρομολόγια επιβατών:", "For passenger tickets and timetables:")} <a href="${B.ktelUrl}" rel="noopener">${t("ΚΤΕΛ Αιτωλοακαρνανίας", "KTEL Aetolia-Acarnania")}</a></p></div>
  <div><h2 class="foot-h">${t("Υπηρεσίες", "Services")}</h2><ul><li><a href="${link("apostoli")}">${t("Αποστολή δέματος", "Send a parcel")}</a></li><li><a href="${link("paralavi")}">${t("Παραλαβή δέματος", "Collect a parcel")}</a></li><li><a href="${link("anazitisi")}">${t("Αναζήτηση δέματος", "Track a parcel")}</a></li><li><a href="${link("spiti")}">${t("Παράδοση στο σπίτι", "Home delivery")}</a></li><li><a href="${link("ladi")}">${t("Λάδι για τους δικούς σας", "Olive oil to family")}</a></li><li><a href="${link("foitites")}">${t("Πακέτο για φοιτητές", "Parcels for students")}</a></li><li><a href="${link("fylaxi-aposkevon")}">${t("Φύλαξη αποσκευών", "Luggage storage")}</a></li><li><a href="${link("epixeiriseis")}">${t("Για επιχειρήσεις", "For businesses")}</a></li></ul></div>
  <div><h2 class="foot-h">${t("Ωράριο", "Opening hours")}</h2><ul>${B.hours.map(x => `<li>${esc(L(x.days))}<br><span class="num">${esc(x.time)}</span></li>`).join("")}</ul></div>
  <div><h2 class="foot-h">${t("Επικοινωνία", "Contact")}</h2><ul><li>${esc(L(B.address.place))}, ${esc(L(B.address.street))}, ${B.address.postal} ${esc(L(B.address.city))}<br><a href="${B.mapsUrl}" rel="noopener">${t("Οδηγίες στον χάρτη", "Directions")}</a></li><li><a class="num" href="tel:+30${B.phone}">${lang === "en" ? "+30 " : ""}${B.phoneDisplay}</a></li><li><a class="num" href="tel:+30${B.mobile}">${lang === "en" ? "+30 " : ""}${B.mobileDisplay}</a><br><a href="${WA_URL}">WhatsApp</a>${B.viber ? ` · <a href="${VB_URL}">Viber</a>` : ""}</li><li><a href="mailto:${B.email}">${B.email}</a></li></ul></div>
  <div class="legal"><span>© ${new Date().getFullYear()} ${esc(L(B.name))}${B.legalName ? ` · ${esc(L(B.legalName))}` : ""}${B.afm ? ` · ${t("ΑΦΜ", "Tax ID")} <span class="num">${B.afm}</span>` : ""}${B.gemi ? ` · ${t("ΓΕΜΗ", "GEMI")} <span class="num">${B.gemi}</span>` : ""}</span><span><a href="${link("oroi")}">${t("Όροι εξυπηρέτησης", "Terms of service")}</a> · <a href="${link("aporrito")}">${t("Απόρρητο", "Privacy")}</a> · <a href="${link("nomothesia")}">${t("Νομοθεσία", "Legislation")}</a> · <span style="white-space:nowrap">${t("Χωρίς cookies", "No cookies")}</span></span></div>
</div></footer>
<nav class="quickbar" aria-label="${t("Γρήγορες ενέργειες", "Quick actions")}">
  <a href="tel:+30${B.phone}">${I.phone}<span>${t("Κλήση", "Call")}</span></a>
  <a href="${WA_URL}">${I.chat || I.phone}<span>WhatsApp</span></a>
  <a href="${link("anazitisi")}"${gr === "anazitisi" ? ' aria-current="page"' : ""}>${I.search}<span>${t("Το δέμα μου", "My parcel")}</span></a>
  <a href="${link("apostoli")}#ypologismos"${gr === "apostoli" ? ' aria-current="page"' : ""}>${I.send}<span>${t("Τιμή", "Price")}</span></a>
</nav>
<script src="${pre}assets/app.js?v=${V_JS}"></script>`;
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
  <h1>${t(`Δέμα από το Αγρίνιο ${esc(p.eis)} με ΚΤΕΛ`, `Send a parcel from Agrinio to ${esc(name)} by KTEL`)}</h1>
  <p>${t(`Με τα λεωφορεία του ΚΤΕΛ, από τον σταθμό του Αγρινίου: ${fromTxt}.`, `On KTEL buses, from the Agrinio bus station: ${fromTxt}.`)}</p>
  <p style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><a class="btn btn-primary" href="${calc}">${t("Υπολογίστε το κόστος", "Work out the cost")}</a></p>
</div></section>
<section class="section"><div class="wrap">
  <h2>${t("Με μια ματιά", "At a glance")}</h2>
  <ul class="access">${facts.map(([k, v, ph]) => `<li><b>${k}:</b> ${esc(v)}${ph ? ` · ${String(ph).split(/\s*[,;]\s*/).map(n => `<a class="num" href="tel:${n.replace(/[^\d+]/g, "").replace(/^(?!\+)/, "+30")}">${esc(n)}</a>`).join(", ")}` : ""}</li>`).join("")}</ul>
  ${d.name === "Αθήνα" && DATA.HOME.athens ? `<div class="notice info" style="margin-top:16px;max-width:70ch"><b>${t("Παραλαβή κατ' οίκον στην Αθήνα", "Delivery to your door in Athens")}${DATA.HOME.athens.active ? "" : ` <span class="tag">${t("Σύντομα", "Soon")}</span>`}</b>${(brandImg("asap", "", 20) ? brandImg("asap", DATA.HOME.athens.partner, 20) + " " : "") + t(`Σε συνεργασία με την ${esc(DATA.HOME.athens.partner)}: ο παραλήπτης το παίρνει στο σπίτι ή στο γραφείο, χωρίς να πάει στον Κηφισό.`, `In partnership with ${esc(DATA.HOME.athens.partner)}: the recipient gets it at home or at work, without going to Kifisos.`)} <a href="${link("spiti")}#${lang === "en" ? "athens" : "athina"}">${t("Περισσότερα →", "More →")}</a></div>` : ""}
  <h2>${t(`Τιμές για ${esc(name)}`, `Prices to ${esc(name)}`)}</h2>
  <div class="table-wrap narrow"><table class="data two"><thead><tr><th scope="col">${t("Είδος δέματος", "Item")}</th><th scope="col">${t("Τιμή", "Price")}</th></tr></thead><tbody>${
    C.map(c => { const v = tf.p[c.id]; return `<tr><th scope="row" style="font-weight:600">${esc(L(c.name))}</th><td class="${v == null ? "na" : "num"}">${v == null ? t("ρωτήστε", "ask") : eur(v)}</td></tr>`; }).join("")
  }${ow.enabled ? `<tr><th scope="row" style="font-weight:600">${t(`Ανά κιλό πάνω από ${ow.fromKg} kg`, `Per kg over ${ow.fromKg} kg`)}</th><td class="num">+${money2(kgRate(ow, tf))}</td></tr>` : ""}</tbody></table></div>
  <p class="caption">${t("Ενδεικτικές τιμές από τον επίσημο τιμοκατάλογο του ΚΤΕΛ Αιτωλοακαρνανίας, ανά τεμάχιο, με ΦΠΑ. Η τελική τιμή βγαίνει στον πάγκο.", "Indicative prices from the official KTEL Aetolia-Acarnania price list, per item, VAT included. The final price is set at the counter.")} <a href="${link("apostoli")}#ypologismos">${t("Ποιο μέγεθος είναι το δέμα μου;", "Which size is my parcel?")}</a></p>
  ${rows.length ? `<h2>${t("Αναχωρήσεις από το Αγρίνιο", "Departures from Agrinio")}</h2>
  <div class="table-wrap narrow"><table class="data times"><thead><tr><th scope="col">${t("Ώρα", "Time")}</th><th scope="col">${t("Μέρες", "Days")}</th><th scope="col">${t("Σημείωση", "Note")}</th></tr></thead><tbody>${
    rows.map(r => `<tr><td class="num">${r.time}</td><td>${esc(daysLabel([r], [r.dest], lang))}</td><td>${[r.express ? "Express" : "", r.notes ? esc(noteTxt(r.notes)) : ""].filter(Boolean).join(" · ")}</td></tr>`).join("")
  }</tbody></table></div>
  <p class="caption">${t(`Λεωφορεία που παίρνουν δέματα. Φέρτε το δέμα στο ταμείο τουλάχιστον ${B.cutoffMin} λεπτά πριν. Τις αργίες τα δρομολόγια μπορεί να αλλάζουν.`, `Buses that carry parcels. Bring your parcel to the counter at least ${B.cutoffMin} minutes before. Holiday timetables may differ.`)}</p>` : ""}
  <h2>${t("Πώς στέλνω", "How to send")}</h2>
  <ol class="steps"><li><div><b>${t("Συσκευάστε το δέμα", "Pack the parcel")}</b><p>${t("Γράψτε πάνω ονοματεπώνυμο και κινητό του παραλήπτη, όπως στην ταυτότητά του.", "Write the recipient’s full name, as on their ID, and mobile number on it.")}</p></div></li><li><div><b>${t("Φέρτε το στην αποθήκη", "Bring it to the depot")}</b><p>${t(`Δεξιά από την είσοδο του σταθμού ΚΤΕΛ Αγρινίου. ${esc(B.hours.map(x => L(x.days) + " " + x.time).join(" · "))}.`, `To the right of the Agrinio KTEL station entrance. ${esc(B.hours.map(x => L(x.days) + " " + x.time).join(" · "))}.`)}</p></div></li><li><div><b>${t("Πληρώνετε και φεύγει", "Pay and it’s on its way")}</b><p>${t(`Μετρητά, κάρτα ή IRIS. Ο παραλήπτης ειδοποιείται με SMS όταν φτάσει ${p.eis}.`, `Cash, card or IRIS. The recipient gets an SMS when it reaches ${esc(name)}.`)}</p></div></li></ol>
  <h2>${t("Άλλοι προορισμοί", "Other destinations")}</h2>
  <ul class="dest-list">${others}<li><a href="${link("proorismoi")}">${t("Όλοι οι προορισμοί →", "All destinations →")}</a></li></ul>
</div></section>`;
    const U = g => B.domain + "/" + (lang === "en" ? "en/" : "") + (g === "index" ? "" : (lang === "en" ? SLUG[g] : g) + EXT);
    const crumbsLd = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: t("Αρχική", "Home"), item: U("index") },
      { "@type": "ListItem", position: 2, name: t("Προορισμοί", "Destinations"), item: U("proorismoi") },
      { "@type": "ListItem", position: 3, name: `${t("Αγρίνιο", "Agrinio")} – ${name}`, item: U(p.gr) }] };
    const meta = {
      ldExtra: [crumbsLd],
      title: (() => { const same = /^(Αυθημερόν|Την ίδια μέρα)/.test(d.eta || ""); const el = [pEnv != null ? `Από ${eur(pEnv)}` : "", same ? "αυθημερόν" : "τιμές και ώρες"].filter(Boolean).join(", "), en = [pEnv != null ? `From ${eur(pEnv)}` : "", same ? "same day" : "prices and times"].filter(Boolean).join(", ");
        return t(`Δέμα Αγρίνιο – ${name} με ΚΤΕΛ · ${el.charAt(0).toUpperCase() + el.slice(1)}`, `Parcel Agrinio – ${name} by KTEL · ${en.charAt(0).toUpperCase() + en.slice(1)}`); })(),
      description: t(`Δέμα από το Αγρίνιο ${p.eis} με το ΚΤΕΛ: ${fromTxt}. Τιμές, ώρες αναχώρησης και σημείο παραλαβής.`,
        `Parcels from Agrinio to ${name} by KTEL bus: ${fromTxt}. Prices, departure times and pickup point.`),
    };
    return { meta, body };
  }
  return { fill, page, destPage, urlOf: (g) => B.domain + "/" + (lang === "en" ? "en/" : "") + (g === "index" ? "" : (lang === "en" ? SLUG[g] : g) + EXT) };
}

// ---------- σελίδες ----------
// Το Cloudflare Pages σερβίρει /apostoli για το apostoli.html (και ανακατευθύνει το .html): σύνδεσμοι χωρίς .html.
// Πίνακες που σκρολάρουν οριζόντια: να φτάνει κανείς σε αυτούς και με πληκτρολόγιο, με όνομα από την προηγούμενη επικεφαλίδα.
function a11yTables(html) {
  return html.replace(/<div class="table-wrap( [^"]*)?">/g, (m, cls, off) => {
    const before = html.slice(Math.max(0, off - 1500), off), hs = [...before.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)];
    const label = hs.length ? hs[hs.length - 1][1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
    return `<div class="table-wrap${cls || ""}" tabindex="0" role="region" aria-label="${label || (html.includes('lang="en"') ? "Table" : "Πίνακας")}">`;
  });
}
function cleanLinks(html) {
  html = a11yTables(html);
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
  Strict-Transport-Security: max-age=31536000
  Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' ${SUPABASE_URL} https://api.cloudflare.com https://cloudflareinsights.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'
/assets/*
  Cache-Control: public, max-age=604800, stale-while-revalidate=86400
/diaxeirisi*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
/en/admin*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
https://:project.pages.dev/*
  X-Robots-Tag: noindex
https://:version.:project.pages.dev/*
  X-Robots-Tag: noindex
`);
// Σελίδες προορισμών που δεν χτίστηκαν (μετονομασία/αλλαγή στη διαχείριση): 301 στους προορισμούς, όχι 404.
if (!ARTIFACT) writeFileSync(join(OUT, "_redirects"), MISSING_PAGES.flatMap(m => [`/${m.gr} /proorismoi 301`, `/${m.gr}.html /proorismoi 301`, `/en/${m.en} /en/destinations 301`, `/en/${m.en}.html /en/destinations 301`]).join("\n") + "\n");
writeFileSync(join(OUT, "robots.txt"), PROTOTYPE ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\nSitemap: ${B.domain}/sitemap.xml\n`);
console.log(`OK — ${n} σελίδες (ελληνικά + αγγλικά) → ${OUT}`);
