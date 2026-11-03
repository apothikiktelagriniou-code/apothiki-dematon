// Supabase Edge Function: send-sms
// Στέλνει SMS από το Android κινητό της αποθήκης μέσω της εφαρμογής «SMS Gateway for Android» (sms-gate.app, λειτουργία Cloud).
// Τα στοιχεία SMSGATE_USER / SMSGATE_PASS ζουν ΜΟΝΟ στα Secrets του Supabase.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = Deno.env.get("SMSGATE_USER"), pass = Deno.env.get("SMSGATE_PASS");
  const url = new URL(req.url);
  if (url.searchParams.get("health") === "1") return json({ ok: true, ready: !!(user && pass) });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "", {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user: u } } = await sb.auth.getUser();
  if (!u) return json({ error: "unauthorized" }, 401);
  if (!user || !pass) return json({ error: "missing_credentials" }, 500);

  let b: { phone?: string; text?: string };
  try { b = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const phone = String(b.phone ?? "").replace(/\D/g, "").replace(/^30(?=\d{10}$)/, "");
  const text = String(b.text ?? "").trim();
  if (!/^(69\d{8})$/.test(phone)) return json({ error: "invalid_phone" }, 400); // μόνο κινητά δέχονται SMS
  if (!text || text.length > 160) return json({ error: "bad_text" }, 400); // πάντα 1 SMS

  const r = await fetch("https://api.sms-gate.app/3rdparty/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Basic " + btoa(user + ":" + pass) },
    body: JSON.stringify({ phoneNumbers: ["+30" + phone], textMessage: { text } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("sms_failed", r.status, j); return json({ error: "sms_failed", status: r.status, detail: j?.message || "" }, 502); }
  return json({ ok: true, id: j.id || null, state: j.state || j.status || null });
});
