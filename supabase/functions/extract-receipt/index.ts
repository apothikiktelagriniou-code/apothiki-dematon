// Supabase Edge Function: extract-receipt
// Διαβάζει 1–2 φωτογραφίες απόδειξης ΚΤΕΛ με Claude Haiku και επιστρέφει τα πεδία σε JSON.
// Το κλειδί ANTHROPIC_API_KEY ζει ΜΟΝΟ στα Secrets του Supabase — ποτέ στην εφαρμογή.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const MODEL = "claude-haiku-5-5";
const MAX_TOKENS = 4096; // αρκετό και αν το μοντέλο «σκεφτεί» πριν απαντήσει
const PRICE_IN = 0.10 / 1e6, PRICE_OUT = 0.50 / 1e6; // USD ανά token
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const SYSTEM = `Διαβάζεις φωτογραφίες από αποδείξεις δεμάτων (ΔΕΛΤΙΟ ΑΠΟΣΚΕΥΩΝ) του ΚΤΕΛ Αιτωλοακαρνανίας. Μπορεί να είναι τυπωμένη θερμική ετικέτα ή χειρόγραφη απόδειξη. Μπορεί να υπάρχει και χειρόγραφο κινητό τηλέφωνο πάνω στην ετικέτα ή κάπου αλλού στο δέμα (δεύτερη φωτογραφία).

Τυπική διάταξη τυπωμένης ετικέτας:
ΚΤΕΛ ΑΙΤΩΛΟΑΚΑΡΝΑΝΙΑΣ ΑΕ / Εκδότης:258 / ΔΕΛΤΙΟ ΑΠΟΣΚΕΥΩΝ / ΣΥΝΟΔΕΥΤΙΚΟ (ή ΑΣΥΝΟΔΕΥΤΟ) / ΚΟΜΙΣΤΡΟ: 5 € / Είδος: Απλό δέμα / Ημ/νία έκδοσης: Σαβ 31/10/2026 Ωρα:16:40 / Ημ/νία Αναχώρησης: Σαβ 31/10/2026 Ωρα:17:00 / Αρ. Απόδειξης: 258-341-23682 / Κωδ. Δέματος: 8CAM5U8B / Αποστολέας : / Παραλήπτης: ΧΑΤΖΗΣ / Τηλ: / Απο-From: ΠΑΤΡΑ / Προς-Το: ΑΓΡΙΝΙΟ / [QR] — Το QR αγνόησέ το.

ΚΑΝΟΝΕΣ:
- Διάβασε ΜΟΝΟ ό,τι φαίνεται. ΜΗΝ μαντεύεις. Ό,τι λείπει ή δεν διαβάζεται → κενό string "".
- Αν κάποιο πεδίο διαβάζεται αλλά υπάρχει αμφιβολία (π.χ. 0/8, 1/7, 5/6, Ο/0, θολό, τσαλακωμένο, βρεγμένο), βάλε το κλειδί του στη λίστα "unsure".
- Οι χειρόγραφοι αριθμοί τηλεφώνου είναι πάντα επικίνδυνοι: αν το τηλέφωνο είναι χειρόγραφο, phone_is_handwritten=true.
- Πόλεις: κεφαλαία χωρίς τόνους (π.χ. ΠΑΤΡΑ, ΑΘΗΝΑ, ΙΩΑΝΝΙΝΑ).
- Ημερομηνίες: DD/MM/YYYY HH:MM.

Απάντησε ΜΟΝΟ με ένα JSON αντικείμενο, χωρίς άλλο κείμενο, με ακριβώς αυτά τα κλειδιά:
{"receipt_no":"","parcel_code":"","kind":"Συνοδευτικό|Ασυνόδευτο|","item":"","fare_eur":null,"issued":"","departure":"","sender":"","recipient":"","phone":"","phone_is_handwritten":false,"origin_city":"","destination_city":"","is_handwritten_receipt":false,"damage_visible":false,"unsure":[],"notes":""}`;

const SYSTEM_MANIFEST = `Διαβάζεις φωτογραφίες από ΚΑΤΑΣΤΑΣΗ ΦΟΡΤΩΣΗΣ / λίστα δεμάτων που στέλνει πρακτορείο ΚΤΕΛ μαζί με ένα λεωφορείο προς το Αγρίνιο. Μπορεί να είναι τυπωμένη, χειρόγραφη ή φωτογραφία οθόνης, σε μία ή περισσότερες σελίδες (οι φωτογραφίες είναι σελίδες της ΙΔΙΑΣ κατάστασης).

Τυπική μορφή (τυπωμένη από το σύστημα ΚΤΕΛ):
ΚΤΕΛ ΑΙΤΩΛΟΑΚΑΡΝΑΝΙΑΣ ΑΕ / Ημ.Αναχώρησης: Κυρ 01/11/2026 16:00 / Συνοδευτική Κατάσταση ΑΣΥΝΟΔΕΥΤΟ ...
Στήλες: Φορτωτική | Παραλήπτης | Παράδοση | Ποσ | Είδος | Τιμή
Γραμμή: 2-255-349-11663 | ΑΠΟΣΤΟΛΟΠΟΥΛΟΣ | ΚΤΕΛ ΝΑΥΠΑΚΤΟΥ | 1 | Απλό δέμα | 15,0
Το «ΣΤΑΘΜΟΣ ΑΓΡΙΝΙΟΥ» μπορεί να σπάει σε δύο γραμμές («ΣΤΑΘΜΟΣ ΑΓΡΙΝΙ» + «ΟΥ») — είναι ΕΝΑΣ προορισμός, όχι νέα γραμμή.
Στο τέλος: πίνακας Προορισμός/Ποσότητα, «Αναχώρηση: ΘΕΣΣΑΛΟΝΙΚΗ_ΣΤΑΘΜΟΣ 5» (= πόλη αναχώρησης και πλήθος), «Σύνολο: 5», «Γεν.Σύνολο: €49,00».
- receipt_no = η Φορτωτική ΑΚΡΙΒΩΣ όπως είναι τυπωμένη (π.χ. 2-255-349-11663).
- destination_city = η στήλη Παράδοση σε ονομαστική πόλης (ΣΤΑΘΜΟΣ ΑΓΡΙΝΙΟΥ → ΑΓΡΙΝΙΟ, ΚΤΕΛ ΝΑΥΠΑΚΤΟΥ → ΝΑΥΠΑΚΤΟΣ).
- origin_city = η πόλη της «Αναχώρηση:» (ΘΕΣΣΑΛΟΝΙΚΗ_ΣΤΑΘΜΟΣ → ΘΕΣΣΑΛΟΝΙΚΗ). departure = Ημ.Αναχώρησης. total_declared = «Σύνολο». fare_eur = Τιμή.

ΚΑΝΟΝΕΣ:
- Βγάλε ΚΑΘΕ γραμμή δέματος. Μην παραλείψεις καμία, μη διπλασιάσεις καμία (αν η ίδια γραμμή φαίνεται σε δύο φωτογραφίες, γράψ' την μία φορά).
- Διάβασε μόνο ό,τι φαίνεται· ό,τι λείπει → "". Αμφιβολία σε γραμμή → "unsure": true.
- Αριθμός απόδειξης συνήθως σε μορφή 258-341-23682.
- Πόλεις κεφαλαία χωρίς τόνους. Ημερομηνία/ώρα DD/MM/YYYY HH:MM.

Απάντησε ΜΟΝΟ με JSON:
{"origin_city":"","departure":"","agency":"","items":[{"receipt_no":"","recipient":"","destination_city":"","pieces":null,"fare_eur":null,"unsure":false}],"total_declared":null,"notes":""}
όπου total_declared = το σύνολο δεμάτων αν γράφεται στην κατάσταση.`;

const GR2LAT: Record<string, string> = { Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X" };
const up = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

function clean(d: Record<string, unknown>) {
  const o: Record<string, unknown> = { ...d };
  o.receipt_no = String(d.receipt_no ?? "").replace(/\s/g, "");
  o.parcel_code = up(d.parcel_code).replace(/[Α-Ω]/g, c => GR2LAT[c] || c).replace(/\s/g, "");
  o.origin_city = up(d.origin_city);
  o.destination_city = up(d.destination_city);
  let ph = String(d.phone ?? "").replace(/\D/g, "").replace(/^0030(?=\d{10}$)/, "").replace(/^30(?=\d{10}$)/, "");
  o.phone = ph;
  const f = d.fare_eur;
  o.fare_eur = f === null || f === "" || f === undefined ? null : Number(String(f).replace(",", "."));
  if (o.fare_eur !== null && isNaN(o.fare_eur as number)) o.fare_eur = null;
  o.kind = /ΑΣΥΝ/.test(up(d.kind)) ? "Ασυνόδευτο" : /ΣΥΝ/.test(up(d.kind)) ? "Συνοδευτικό" : "";
  o.unsure = Array.isArray(d.unsure) ? d.unsure.map(String) : [];
  return o;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (url.searchParams.get("health") === "1") return json({ ok: true, hasKey: !!key, model: MODEL });
  if (url.searchParams.get("health") === "2") {
    // διαγνωστικό: μια μικρή κλήση στο AI για να φανεί αν δουλεύουν κλειδί/μοντέλο/πίστωση (δεν επιστρέφει το κλειδί)
    if (!key) return json({ ok: false, error: "missing_key" });
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 5, messages: [{ role: "user", content: "Απάντησε μόνο: OK" }] }) });
    const j = await r.json().catch(() => ({}));
    return json({ ok: r.ok, status: r.status, model: MODEL, error: j?.error?.message || null, type: j?.error?.type || null });
  }
  if (url.searchParams.get("health") === "3") {
    // διαγνωστικό: η πλήρης οδηγία ανάγνωσης χωρίς εικόνα — δείχνει αν βγαίνει JSON και γιατί σταματά
    if (!key) return json({ ok: false, error: "missing_key" });
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM,
        messages: [{ role: "user", content: "Δοκιμή χωρίς εικόνα: Αρ. Απόδειξης: 258-341-23682, ΚΟΜΙΣΤΡΟ: 5 €, Παραλήπτης: ΧΑΤΖΗΣ, Απο-From: ΠΑΤΡΑ, Προς-Το: ΑΓΡΙΝΙΟ, Ημ/νία Αναχώρησης: 31/10/2026 17:00. Επέστρεψε το JSON." }] }) });
    const j = await r.json().catch(() => ({}));
    const text = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
    return json({ ok: r.ok, status: r.status, stop_reason: j.stop_reason, blocks: (j.content || []).map((c: { type: string }) => c.type), usage: j.usage, text: text.slice(0, 600), error: j?.error?.message || null });
  }

  // μόνο συνδεδεμένοι χρήστες της εφαρμογής
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "", {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!key) return json({ error: "missing_key" }, 500);

  let body: { mode?: string; images?: { data: string; media_type?: string }[] };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const manifest = body.mode === "manifest";
  const imgs = (body.images || []).slice(0, manifest ? 4 : 2).filter(i => i && typeof i.data === "string" && i.data.length < 6_000_000);
  if (!imgs.length) return json({ error: "no_image" }, 400);

  const content = [
    ...imgs.map(i => ({ type: "image", source: { type: "base64", media_type: i.media_type || "image/jpeg", data: i.data } })),
    { type: "text", text: manifest ? (imgs.length > 1 ? imgs.length + " σελίδες της ίδιας κατάστασης. " : "") + "Επέστρεψε το JSON."
      : imgs.length > 1 ? "Δύο φωτογραφίες του ΙΔΙΟΥ δέματος (η 2η συνήθως δείχνει χειρόγραφο τηλέφωνο). Επέστρεψε το JSON." : "Επέστρεψε το JSON." },
  ];

  async function call() {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: manifest ? 16000 : MAX_TOKENS, system: manifest ? SYSTEM_MANIFEST : SYSTEM, messages: [{ role: "user", content }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error("anthropic " + r.status + ": " + (j?.error?.message || ""));
    return j;
  }

  let parsed: Record<string, unknown> | null = null, usage = { input_tokens: 0, output_tokens: 0 }, err = "";
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    try {
      const j = await call();
      usage.input_tokens += j.usage?.input_tokens || 0; usage.output_tokens += j.usage?.output_tokens || 0;
      const text = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text?: string }) => c.text || "").join("");
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { err = "invalid_json: " + text.slice(0, 200); } }
      else err = "no_json (stop=" + j.stop_reason + ", blocks=" + (j.content || []).map((c: { type: string }) => c.type).join("+") + ", out=" + (j.usage?.output_tokens ?? "?") + "): " + text.slice(0, 200);
    } catch (e) { err = String(e); }
  }
  const cost = usage.input_tokens * PRICE_IN + usage.output_tokens * PRICE_OUT;
  await sb.from("ai_usage").insert({ input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_usd: cost, ok: !!parsed });
  if (!parsed) { console.error("extract_failed", err); return json({ error: "extract_failed", detail: err.slice(0, 300) }, 502); }
  if (manifest) {
    const p = parsed as { items?: Record<string, unknown>[] } & Record<string, unknown>;
    const items = (Array.isArray(p.items) ? p.items : []).map(it => ({
      receipt_no: String(it.receipt_no ?? "").replace(/\s/g, ""), recipient: String(it.recipient ?? "").trim(),
      destination_city: up(it.destination_city), pieces: it.pieces == null || it.pieces === "" ? null : Number(it.pieces),
      fare_eur: it.fare_eur == null || it.fare_eur === "" ? null : Number(String(it.fare_eur).replace(",", ".")), unsure: !!it.unsure }));
    return json({ data: { origin_city: up(p.origin_city), departure: String(p.departure ?? ""), agency: String(p.agency ?? ""), items,
      total_declared: p.total_declared == null || p.total_declared === "" ? null : Number(p.total_declared), notes: String(p.notes ?? "") }, usage, cost_usd: cost });
  }
  return json({ data: clean(parsed), usage, cost_usd: cost });
});
