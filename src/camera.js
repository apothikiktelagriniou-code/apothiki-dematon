// 📸 Κάμερα εισερχομένων — μία-μία ετικέτα με ΠΡΑΣΙΝΟ «πέρασε — επόμενο» / ΚΟΚΚΙΝΟ «δεν πέρασε».
// Δύο τρόποι λήψης:
//  • ΚΑΜΕΡΑ ΚΙΝΗΤΟΥ (προεπιλογή, iPhone & Android): ανοίγει η κανονική κάμερα του κινητού → πραγματική φωτογραφία
//    με την εστίαση/φλας του κινητού (ίδια ποιότητα με «📷 Φωτογραφίες δεμάτων»). Ο φωτισμός ελέγχεται ΜΕΤΑ τη λήψη.
//  • ΖΩΝΤΑΝΗ (προαιρετική, μόνο όπου το κινητό δίνει πραγματική φωτογραφία μέσα από την εφαρμογή — Android/Chrome):
//    ζωντανή εικόνα, ένδειξη φωτισμού πριν τη λήψη, αυτόματος φακός.
import { sound } from "./scan.js";
import { enqueueShot } from "./capture.js";

const $ = id => document.getElementById(id);
let cam = null;
const DARK = 62, BRIGHT = 95; // μέση φωτεινότητα 0–255
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } } };
const LIVE_OK = !!(window.ImageCapture && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); // iPhone: όχι
const live = () => LIVE_OK && ls.get("camLive") === "1";
const fast = () => ls.get("camFast") === "1";

/** Μέση φωτεινότητα (μικρό δείγμα, γρήγορο). */
export function lumaOf(src, w = 48, h = 36) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data; let s = 0;
  for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return s / (w * h);
}
async function fileLuma(file) {
  try { const bm = await createImageBitmap(file); const L = lumaOf(bm); bm.close && bm.close(); return L; } catch { return null; }
}

// ---------------------------------------------------------------- ζωντανή εικόνα (μόνο Android)
async function setTorch(on) {
  if (!cam || !cam.caps || !cam.caps.torch) return;
  try { await cam.track.applyConstraints({ advanced: [{ torch: on }] }); cam.torch = on; $("camTorch").classList.toggle("primary", on); } catch { /* */ }
}
function lightLoop() {
  if (!cam || !cam.stream) return;
  const v = $("camVideo");
  if (v.videoWidth) {
    const L = lumaOf(v), warn = $("camLight");
    if (L < DARK) {
      warn.hidden = false;
      if (cam.caps.torch && !cam.torch && !cam.userTorch) setTorch(true);
      warn.textContent = cam.caps.torch ? (cam.torch ? "🔦 Φακός ανοιχτός — ακόμα λίγο φως, πλησίασε την ετικέτα" : "💡 Λίγο φως — πάτα 🔦") : "💡 Λίγο φως — πήγαινε σε πιο φωτεινό σημείο";
    } else if (L > BRIGHT) warn.hidden = true;
  }
  cam.loop = setTimeout(lightLoop, 400);
}
async function startLive() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
  const track = stream.getVideoTracks()[0]; const caps = (track.getCapabilities && track.getCapabilities()) || {};
  try { if ((caps.focusMode || []).includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch { /* */ }
  Object.assign(cam, { stream, track, caps, torch: false, userTorch: false });
  const v = $("camVideo"); v.srcObject = stream; await v.play().catch(() => {});
  $("camTorch").hidden = !caps.torch;
  lightLoop();
}
function stopLive() {
  if (cam && cam.stream) { clearTimeout(cam.loop); cam.stream.getTracks().forEach(t => t.stop()); cam.stream = null; }
  $("camVideo").srcObject = null;
}
/** Πραγματική φωτογραφία από τη ζωντανή κάμερα (ImageCapture). */
async function grabLive() {
  const v = $("camVideo"); if (!v.videoWidth || !cam.track || cam.track.readyState !== "live") return null;
  let blob = null; try { blob = await new ImageCapture(cam.track).takePhoto(); } catch { blob = null; }
  if (!blob) { const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0); blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.92)); }
  return blob ? new File([blob], "etiketa-" + Date.now() + ".jpg", { type: "image/jpeg", lastModified: Date.now() }) : null;
}

// ---------------------------------------------------------------- σήμανση
let flashT = null;
function flash(kind, big, name, sub, ms) {
  const f = $("camFlash"); clearTimeout(flashT);
  f.className = "scanflash " + kind; f.hidden = false;
  $("camBig").textContent = big; $("camName").textContent = name || ""; $("camSub").textContent = sub || "";
  cnt();
  if (ms) flashT = setTimeout(() => { f.hidden = true; }, ms);
}
const cnt = () => { $("camCnt").textContent = cam ? "✓ " + cam.ok + (cam.bad ? " · ✗ " + cam.bad : "") : ""; };
function logLine(n, r) {
  const li = document.createElement("div"); li.className = "camlog-" + (r.ok ? "ok" : "bad");
  li.textContent = "#" + n + " " + (r.ok ? "✓ " : "✗ ") + (r.name || "—") + (r.sub ? " · " + r.sub : "");
  const L = $("camLog"); L.prepend(li); while (L.childNodes.length > 30) L.lastChild.remove();
}
function pendTxt() { if (!cam) return; $("camPend").textContent = cam.pend ? "⏳ " + cam.pend + " διαβάζονται" : ""; $("camPend").hidden = !cam.pend; }
const redOpen = () => !$("camFlash").hidden && $("camFlash").classList.contains("bad");

/** Μία φωτογραφία ετικέτας → ουρά → πράσινο/κόκκινο. Με «⚡ Συνεχόμενη» δεν περιμένει το αποτέλεσμα. */
async function handleShot(file) {
  if (!cam || !file) return;
  const n = ++cam.seq;
  const L = await fileLuma(file), dark = L != null && L < DARK - 12;
  const darkTxt = dark ? (live() ? "σκοτεινή φωτογραφία — άνοιξε 🔦" : "σκοτεινή φωτογραφία — άνοιξε το φλας της κάμερας") : "";
  sound.dup();
  if (fast()) {
    cam.pend++; pendTxt();
    if (!redOpen()) flash("dup", "📸 #" + n, dark ? "⚠ Σκοτεινή φωτογραφία" : "Λήφθηκε — διαβάζεται", "Φωτογράφισε το επόμενο", 700);
    const res = await Promise.race([enqueueShot(file), new Promise(r => setTimeout(() => r({ late: true }), 60000))]);
    if (!cam) return; cam.pend--; pendTxt();
    if (!res) return;
    if (res.late) { logLine(n, { ok: false, name: "αργεί", sub: "θα διαβαστεί μόλις υπάρξει σύνδεση" }); return; }
    const r = { ...res, sub: [res.sub, !res.ok ? darkTxt : ""].filter(Boolean).join(" · ") };
    logLine(n, r);
    if (r.ok) { cam.ok++; sound.ok(); if (!redOpen()) flash("ok", "✓ #" + n, r.name, r.sub, 900); else cnt(); }
    else { cam.bad++; cam.redN = redOpen() ? (cam.redN || 1) + 1 : 1; sound.bad();
      flash("bad", "✗ #" + n + " ΔΕΝ ΠΕΡΑΣΕ", r.name, r.sub + (cam.redN > 1 ? " · (+" + (cam.redN - 1) + " ακόμα κόκκινα — δες τη λίστα)" : "") + " · Πάτα για συνέχεια"); }
    return;
  }
  cam.busy = true; setBusy(true);
  try {
    flash("dup", "⏳ ΔΙΑΒΑΖΩ…", dark ? "⚠ Σκοτεινή φωτογραφία" : "", "Κράτα το επόμενο δέμα έτοιμο");
    const res = await Promise.race([enqueueShot(file), new Promise(r => setTimeout(() => r({ late: true }), 30000))]);
    if (!res) { $("camFlash").hidden = true; return; }
    if (res.late) { logLine(n, { ok: false, name: "αργεί", sub: "θα διαβαστεί μόλις υπάρξει σύνδεση" }); flash("warn", "⏳ ΑΡΓΕΙ", "Χωρίς σύνδεση ή αργό δίκτυο", "Θα διαβαστεί μόλις γίνει δυνατό — συνέχισε", 2500); return; }
    const r = { ...res, sub: [res.sub, !res.ok ? darkTxt : ""].filter(Boolean).join(" · ") };
    logLine(n, r);
    if (r.ok) { cam.ok++; sound.ok(); flash("ok", "✓ ΠΕΡΑΣΕ", r.name, [r.sub, "ΕΠΟΜΕΝΟ ▶"].filter(Boolean).join(" · "), 1400); }
    else { cam.bad++; sound.bad(); flash("bad", "✗ ΔΕΝ ΠΕΡΑΣΕ", r.name, (r.sub || "") + " · Πάτα για συνέχεια"); }
  } finally { if (cam) { cam.busy = false; setBusy(false); } }
}
function setBusy(b) { $("camShot").disabled = b; $("camShotLbl").classList.toggle("disabled", b); }

async function shootLive() {
  if (!cam || (cam.busy && !fast())) return;
  const now = Date.now(); if (now - (cam.lastShot || 0) < 700) return; cam.lastShot = now;
  sound.unlock(); $("camVideo").classList.remove("snap"); void $("camVideo").offsetWidth; $("camVideo").classList.add("snap");
  handleShot(await grabLive());
}

// ---------------------------------------------------------------- άνοιγμα / κλείσιμο / τρόπος
function applyMode() {
  const L = live();
  $("camDlg").classList.toggle("native", !L);
  $("camShot").hidden = !L; $("camShotLbl").hidden = L;
  $("camLive").hidden = !LIVE_OK;
  $("camLive").textContent = L ? "🎥 Ζωντανή: ΝΑΙ" : "🎥 Ζωντανή: ΟΧΙ"; $("camLive").classList.toggle("primary", L);
  $("camFast").textContent = fast() ? "⚡ Συνεχόμενη: ΝΑΙ" : "⚡ Συνεχόμενη: ΟΧΙ"; $("camFast").classList.toggle("primary", fast());
  $("camTorch").hidden = true; $("camLight").hidden = true;
  $("camStatus").className = "msg info";
  $("camStatus").textContent = L
    ? "Ζωντανή κάμερα: βάλε την ετικέτα να γεμίζει την οθόνη και πάτα «📸 Λήψη» (ή πάνω στην εικόνα)."
    : "Πάτα «📸 Φωτογράφισε ετικέτα» → ανοίγει η κάμερα του κινητού → τράβα την ετικέτα κοντά και καθαρά (με φλας αν έχει λίγο φως) → «Χρήση φωτογραφίας».";
}
async function openCam() {
  cam = { ok: 0, bad: 0, busy: false, seq: 0, pend: 0 };
  $("camLog").textContent = ""; $("camFlash").hidden = true; pendTxt();
  $("camDlg").showModal(); sound.unlock(); applyMode();
  if (live()) {
    try { await startLive(); }
    catch (e) { ls.set("camLive", "0"); applyMode(); $("camStatus").className = "msg warn"; $("camStatus").textContent = "Η ζωντανή κάμερα δεν άνοιξε (" + (e.name === "NotAllowedError" ? "δεν δόθηκε άδεια" : e.message || e.name) + ") — χρησιμοποιώ την κάμερα του κινητού."; }
  }
}
function closeCam() { stopLive(); cam = null; $("camDlg").close(); }
export function initCamera() {
  if (!$("camBtn")) return;
  $("camBtn").onclick = openCam;
  $("camClose").onclick = closeCam;
  $("camDlg").addEventListener("cancel", e => { e.preventDefault(); closeCam(); });
  $("camShot").onclick = shootLive;
  $("camVideo").onclick = shootLive;
  $("camNative").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) handleShot(f); });
  $("camShotLbl").addEventListener("click", e => { if (cam && cam.busy && !fast()) e.preventDefault(); else sound.unlock(); });
  $("camFlash").onclick = () => { if (cam && cam.busy && !fast()) return; clearTimeout(flashT); $("camFlash").hidden = true; };
  $("camFast").onclick = () => { ls.set("camFast", fast() ? "0" : "1"); applyMode(); };
  $("camLive").onclick = async () => { ls.set("camLive", live() ? "0" : "1"); stopLive(); applyMode(); if (live()) { try { await startLive(); } catch { ls.set("camLive", "0"); applyMode(); } } };
  $("camTorch").onclick = () => { if (!cam) return; cam.userTorch = true; setTorch(!cam.torch); };
}
