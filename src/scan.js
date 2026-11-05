// Σάρωση ΚΕΙΜΕΝΟΥ από την κάμερα, μέσα στο κινητό (Tesseract, χωρίς AI, χωρίς ανέβασμα φωτογραφιών).
// Ψάχνει μόνο αριθμούς απόδειξης της αποθήκης Αγρινίου: 228-ddd-dddddd.

// 2 «αναγνώστες» παράλληλα σε κινητά με ≥4 πυρήνες → διπλάσια καρέ το δευτερόλεπτο
export const WORKERS = Math.min(2, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
const pool = [];
export async function getWorkers(onProgress) {
  const first = await getWorker(onProgress, 0); pool[0] = first;
  for (let i = 1; i < WORKERS; i++) if (!pool[i]) { try { pool[i] = await getWorker(null, i); } catch { break; } }
  return pool.filter(Boolean);
}
const ws = [], st = [];
export function getWorker(onProgress, i = 0) {
  if (ws[i]) return Promise.resolve(ws[i]);
  if (st[i]) return st[i];
  const base = import.meta.env.BASE_URL + "tess/";
  const starting = st[i] = (async () => {
    const { createWorker, PSM } = await import("tesseract.js"); // φορτώνεται μόνο όταν ανοίξει η σάρωση
    const w = await createWorker("eng", 1, { workerPath: base + "worker.min.js", corePath: base, langPath: base, gzip: true,
      logger: m => onProgress && m.progress != null && onProgress(m) });
    await w.setParameters({ tessedit_char_whitelist: "0123456789- ", tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    ws[i] = w; return w;
  })();
  starting.catch(() => { st[i] = null; });
  return starting;
}

/** Από το κείμενο που διάβασε η κάμερα: όλοι οι αριθμοί 228-ddd-dddddd (ανά γραμμή, για να μη «κολλάνε» αριθμοί από άλλες γραμμές). */
export function find228(text) {
  const out = [];
  for (const line of String(text || "").split(/\n/)) {
    const s = line.replace(/\s+/g, " ");
    const m = s.match(/(?:^|[^\d])228 ?-? ?(\d{3}) ?-? ?(\d{5,7})(?!\d)/);
    if (m) { out.push("228-" + m[1] + "-" + m[2]); continue; }
    // αποδείξεις ΑΛΛΩΝ σταθμών (για τα διερχόμενα): ddd-ddd-ddddd με παύλες — δεκτές μόνο αν υπάρχουν στη λίστα
    const o = s.match(/(?:^|[^\d])(\d{3}) ?- ?(\d{3}) ?- ?(\d{4,6})(?![\d])/);
    if (o) out.push(o[1] + "-" + o[2] + "-" + o[3]);
  }
  return out;
}

/** Παίρνει τη μεσαία λωρίδα του βίντεο (εκεί που είναι το πλαίσιο), μεγεθυμένη και ασπρόμαυρη. */
export function grabBand(video, canvas, band = [0.37, 0.63]) {
  const vw = video.videoWidth, vh = video.videoHeight; if (!vw || !vh) return null;
  const y0 = Math.round(vh * band[0]), h = Math.round(vh * (band[1] - band[0]));
  const scale = Math.min(1.4, 900 / vw); // μικρότερη εικόνα = πιο γρήγορη ανάγνωση (ο αριθμός μένει ευανάγνωστος)
  canvas.width = Math.round(vw * scale); canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.filter = "grayscale(1) contrast(1.8) brightness(1.05)";
  ctx.drawImage(video, 0, y0, vw, h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// ---- ήχοι: ✓ (ψηλός), ήδη (χαμηλός), ⚠ λάθος λεωφορείο / άγνωστο (διπλός βαθύς)
let ac = null;
function tone(freq, ms, at = 0, type = "sine") {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.6, ac.currentTime + at); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + at + ms / 1000);
    o.connect(g).connect(ac.destination); o.start(ac.currentTime + at); o.stop(ac.currentTime + at + ms / 1000 + 0.02);
  } catch { /* χωρίς ήχο */ }
}
export const sound = {
  ok() { tone(1400, 110); tone(1800, 120, 0.12); try { navigator.vibrate && navigator.vibrate(120); } catch { /* */ } }, // δυνατό διπλό «μπιπ-μπιπ»
  dup() { tone(500, 70); },
  bad() { tone(220, 260, 0, "square"); tone(220, 260, 0.32, "square"); try { navigator.vibrate && navigator.vibrate([250, 120, 250]); } catch { /* */ } },
  unlock() { tone(1, 1); }, // iOS: ο ήχος ξεκλειδώνει μόνο μετά από πάτημα
};
