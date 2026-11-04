// Supabase Edge Function: gemi-sync
// Φέρνει τις ενεργές επιχειρήσεις του Δήμου Αγρινίου από το ΓΕΜΗ Open Data (άδεια ODC-BY 1.0) στον πίνακα businesses.
// Το κλειδί GEMI_API_KEY ζει ΜΟΝΟ στα Secrets του Supabase. ΑΦΜ δεν αποθηκεύεται.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const VERSION = "2026-11-04-gemi-1";
const API = "https://opendata-api.businessportal.gr/api/opendata/v1";
const MUNI_NAME = "ΑΓΡΙΝΙ"; // Δήμος Αγρινίου
const PAGE = 200, PAGES_PER_CALL = 5, GAP_MS = 3300; // όριο ΓΕΜΗ ~20 κλήσεις/λεπτό

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const up = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

async function gemi(path: string, key: string) {
  const r = await fetch(API + path, { headers: { api_key: key, accept: "application/json" } });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* */ }
  return { ok: r.ok, status: r.status, j, t: t.slice(0, 300) };
}
// ποια παράμετρος φιλτράρει δήμο / ενεργές (από το επίσημο Swagger, για να μη μαντεύουμε)
async function params() {
  const out = { muni: "municipalities", active: "isActive", offset: "resultsOffset", size: "resultsSize", all: [] as string[] };
  try {
    const r = await fetch("https://opendata-api.businessportal.gr/api-docs"); const s = await r.json();
    const p = s?.paths?.["/companies"]?.get?.parameters || s?.paths?.["/api/opendata/v1/companies"]?.get?.parameters || [];
    out.all = p.map((x: any) => x.name);
    out.muni = out.all.find(n => /municipal/i.test(n)) || out.muni;
    out.active = out.all.find(n => /^isActive$/i.test(n)) || out.all.find(n => /active/i.test(n)) || "";
    out.offset = out.all.find(n => /offset/i.test(n)) || out.offset;
    out.size = out.all.find(n => /size/i.test(n)) || out.size;
  } catch { /* defaults */ }
  return out;
}
async function muniId(key: string) {
  const r = await gemi("/metadata/municipalities", key);
  const list: any[] = Array.isArray(r.j) ? r.j : (r.j?.municipalities || r.j?.data || []);
  const m = list.find(x => up(x.descr || x.descrEl || x.name).includes(MUNI_NAME) && !up(x.descr || "").includes("ΑΓΡΙΝΙΩΤ"));
  return { id: m ? String(m.id) : null, status: r.status, matches: list.filter(x => up(x.descr || x.name).includes(MUNI_NAME)).map(x => ({ id: x.id, descr: x.descr })) };
}
const results = (j: any): any[] => j?.searchResults || j?.results || j?.companies || (Array.isArray(j) ? j : []);
function row(c: any) {
  const lt = c.legalType?.descr || "";
  const act = Array.isArray(c.activities) && c.activities.length ? (c.activities[0]?.activity?.descr || c.activities[0]?.descr || c.activities[0]?.descrEl || null) : null;
  const tel = String(c.phone || "").replace(/[^\d+]/g, "") || null;
  return {
    ar_gemi: String(c.arGemi), name: String(c.coNameEl || (c.coTitlesEl || [])[0] || "").trim(),
    titles: (c.coTitlesEl || []).join(" · ") || null, legal_type: lt || null, is_sole: /ΑΤΟΜΙΚ/.test(up(lt)),
    street: c.street || null, street_no: c.streetNumber || null, city: c.city || null, zip: c.zipCode || null,
    phone: tel, email: c.email || c.eMail || null, activity: act, status: c.status?.descr || null, synced_at: new Date().toISOString(),
  };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const key = Deno.env.get("GEMI_API_KEY");
  const url = new URL(req.url);
  if (url.searchParams.get("health") === "1") return json({ ok: true, version: VERSION, ready: !!key });
  if (url.searchParams.get("probe") === "1") { // μόνο ονόματα πεδίων — καθόλου στοιχεία επιχειρήσεων
    const p = await params(); if (!key) return json({ version: VERSION, params: p, ready: false });
    const m = await muniId(key);
    let fields: string[] = [], total = null, st = null, sampleStatus: unknown = null;
    if (m.id) {
      const q = new URLSearchParams({ [p.muni]: m.id, [p.size]: "1", [p.offset]: "0" }); if (p.active) q.set(p.active, "true");
      const r = await gemi("/companies?" + q, key); st = r.status;
      const c = results(r.j)[0]; fields = c ? Object.keys(c) : []; sampleStatus = c?.status || null;
      total = r.j?.searchMetadata?.totalCount ?? r.j?.totalCount ?? r.j?.total ?? null;
      if (!r.ok) return json({ version: VERSION, params: p, muni: m, status: st, body: r.t });
    }
    return json({ version: VERSION, params: p, muni: m, status: st, total, fields, sampleStatus });
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "", {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user: u } } = await sb.auth.getUser();
  if (!u) return json({ error: "unauthorized" }, 401);
  if (!key) return json({ error: "missing_key" }, 500);

  let b: { offset?: number } = {};
  try { b = await req.json(); } catch { /* */ }
  const p = await params();
  const m = await muniId(key);
  if (!m.id) return json({ error: "municipality_not_found", detail: m }, 502);
  let offset = Math.max(0, Number(b.offset) || 0), saved = 0, total: number | null = null, done = false;
  for (let i = 0; i < PAGES_PER_CALL; i++) {
    if (i) await sleep(GAP_MS);
    const q = new URLSearchParams({ [p.muni]: m.id, [p.size]: String(PAGE), [p.offset]: String(offset) }); if (p.active) q.set(p.active, "true");
    const r = await gemi("/companies?" + q, key);
    if (r.status === 429) return json({ ok: true, offset, saved, total, done: false, wait: 60 });
    if (!r.ok) return json({ error: "gemi_failed", status: r.status, detail: r.t, offset, saved }, 502);
    total = r.j?.searchMetadata?.totalCount ?? r.j?.totalCount ?? total;
    const list = results(r.j);
    const rows = list.filter(c => c && c.arGemi && !/ΔΙΑΓΡΑΦ|ΛΥΣΗ|ΠΤΩΧ|ΑΝΕΝΕΡΓ/.test(up(c.status?.descr))).map(row).filter(x => x.name);
    if (rows.length) { const { error } = await sb.from("businesses").upsert(rows, { onConflict: "ar_gemi" }); if (error) return json({ error: "db_failed", detail: error.message, offset }, 500); saved += rows.length; }
    offset += list.length;
    if (list.length < PAGE || (total != null && offset >= total)) { done = true; break; }
  }
  return json({ ok: true, offset, saved, total, done });
});
