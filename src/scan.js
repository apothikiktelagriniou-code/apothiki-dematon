// Σάρωση ΚΕΙΜΕΝΟΥ από την κάμερα, μέσα στο κινητό (Tesseract, χωρίς AI, χωρίς ανέβασμα φωτογραφιών).
// Ψάχνει μόνο αριθμούς απόδειξης της αποθήκης Αγρινίου: 228-ddd-dddddd.

let worker = null, starting = null;
export function getWorker(onProgress) {
  if (worker) return Promise.resolve(worker);
  if (starting) return starting;
  const base = import.meta.env.BASE_URL + "tess/";
  starting = (async () => {
    const { createWorker, PSM } = await import("tesseract.js"); // φορτώνεται μόνο όταν ανοίξει η σάρωση
    const w = await createWorker("eng", 1, { workerPath: base + "worker.min.js", corePath: base, langPath: base, gzip: true,
      logger: m => onProgress && m.progress != null && onProgress(m) });
    await w.setParameters({ tessedit_char_whitelist: "0123456789- ", tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    worker = w; return w;
  })();
  starting.catch(() => { starting = null; });
  return starting;
}

/** Από το κείμενο που διάβασε η κάμερα: όλοι οι αριθμοί 228-ddd-dddddd (ανά γραμμή, για να μη «κολλάνε» αριθμοί από άλλες γραμμές). */
export function find228(text) {
  const out = [];
  for (const line of String(text || "").split(/\n/)) {
    const m = line.replace(/\s+/g, " ").match(/(?:^|[^\d])228 ?-? ?(\d{3}) ?-? ?(\d{5,7})(?!\d)/);
    if (m) out.push("228-" + m[1] + "-" + m[2]);
  }
  return out;
}

/** Παίρνει τη μεσαία λωρίδα του βίντεο (εκεί που είναι το πλαίσιο), μεγεθυμένη και ασπρόμαυρη. */
export function grabBand(video, canvas, band = [0.3, 0.7]) {
  const vw = video.videoWidth, vh = video.videoHeight; if (!vw || !vh) return null;
  const y0 = Math.round(vh * band[0]), h = Math.round(vh * (band[1] - band[0]));
  const scale = Math.min(2, 1400 / vw);
  canvas.width = Math.round(vw * scale); canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.filter = "grayscale(1) contrast(1.4)";
  ctx.drawImage(video, 0, y0, vw, h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// ---- ήχοι: ✓ (ψηλός), ήδη (χαμηλός), ⚠ λάθος λεωφορείο / άγνωστο (διπλός βαθύς)
let ac = null;
function tone(freq, ms, at = 0, type = "sine") {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.25, ac.currentTime + at); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + at + ms / 1000);
    o.connect(g).connect(ac.destination); o.start(ac.currentTime + at); o.stop(ac.currentTime + at + ms / 1000 + 0.02);
  } catch { /* χωρίς ήχο */ }
}
export const sound = {
  ok() { tone(1200, 90); try { navigator.vibrate && navigator.vibrate(60); } catch { /* */ } },
  dup() { tone(500, 70); },
  bad() { tone(220, 260, 0, "square"); tone(220, 260, 0.32, "square"); try { navigator.vibrate && navigator.vibrate([250, 120, 250]); } catch { /* */ } },
  unlock() { tone(1, 1); }, // iOS: ο ήχος ξεκλειδώνει μόνο μετά από πάτημα
};
