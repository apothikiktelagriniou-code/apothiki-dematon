// Αντίγραφα ασφαλείας: όλα τα δεδομένα σε ένα αρχείο .json.gz
// - αυτόματα μία φορά τη μέρα (από όποια συσκευή ανοίξει πρώτη) στον ιδιωτικό χώρο «backups» — κρατιούνται 30 μέρες
// - και με το χέρι: «⬇ Λήψη αντιγράφου» στον υπολογιστή/κινητό, για να υπάρχει και εκτός Supabase.
const TABLES = ["parcels", "customers", "outgoing", "outgoing_reports", "outgoing_cash", "manifests", "shift_notes", "batches", "app_settings", "activity_log"];
const KEEP_DAYS = 30;
const day = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

async function fetchAll(sb, table, onProgress) {
  const out = []; const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from(table).select("*").range(from, from + page - 1);
    if (error) { if (/does not exist|schema cache|not find/i.test(error.message)) return null; throw new Error(table + ": " + error.message); }
    out.push(...(data || [])); onProgress && onProgress(table, out.length);
    if (!data || data.length < page) break;
  }
  return out;
}
export async function makeBackup(sb, onProgress) {
  const tables = {}, counts = {};
  for (const t of TABLES) { const rows = await fetchAll(sb, t, onProgress); if (rows) { tables[t] = rows; counts[t] = rows.length; } }
  const json = JSON.stringify({ app: "apothiki-dematon", version: 1, created_at: new Date().toISOString(), counts, tables });
  let blob = new Blob([json], { type: "application/json" }), gz = false;
  if (typeof CompressionStream !== "undefined") {
    try { blob = await new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).blob(); gz = true; } catch { /* χωρίς συμπίεση */ }
  }
  return { blob, gz, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}
/** Μία φορά τη μέρα: αν δεν υπάρχει το σημερινό, το φτιάχνει και σβήνει όσα είναι παλιότερα από 30 μέρες. */
export async function autoBackup(sb) {
  const today = day();
  try { if (localStorage.getItem("backupDay") === today) return { skipped: true }; } catch { /* */ }
  const { data: list, error } = await sb.storage.from("backups").list("daily", { limit: 200, sortBy: { column: "name", order: "desc" } });
  if (error) return { error: error.message };
  if ((list || []).some(f => f.name.startsWith(today))) { try { localStorage.setItem("backupDay", today); } catch { /* */ } return { exists: true }; }
  const b = await makeBackup(sb);
  const name = "daily/" + today + (b.gz ? ".json.gz" : ".json");
  const up = await sb.storage.from("backups").upload(name, b.blob, { upsert: true, contentType: b.gz ? "application/gzip" : "application/json" });
  if (up.error) return { error: up.error.message };
  const cutoff = day(new Date(Date.now() - KEEP_DAYS * 864e5));
  const old = (list || []).filter(f => f.name.slice(0, 10) < cutoff).map(f => "daily/" + f.name);
  if (old.length) await sb.storage.from("backups").remove(old);
  try { localStorage.setItem("backupDay", today); } catch { /* */ }
  return { ok: true, name, total: b.total };
}
export async function lastBackup(sb) {
  const { data } = await sb.storage.from("backups").list("daily", { limit: 1, sortBy: { column: "name", order: "desc" } });
  return data && data[0] ? { name: data[0].name, size: data[0].metadata?.size || 0 } : null;
}
/** Λήψη στη συσκευή (π.χ. για φύλαξη σε USB / Google Drive). */
export async function downloadBackup(sb, onProgress) {
  const b = await makeBackup(sb, onProgress);
  const a = document.createElement("a"); a.href = URL.createObjectURL(b.blob);
  a.download = "apothiki-antigrafo-" + day() + (b.gz ? ".json.gz" : ".json"); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return b;
}
