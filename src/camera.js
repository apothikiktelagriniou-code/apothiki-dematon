// 📸 Κάμερα εισερχομένων: μία-μία ετικέτα, ένδειξη φωτισμού (+ φακός όπου υποστηρίζεται),
// και μετά την ανάγνωση: ΠΡΑΣΙΝΟ «πέρασε — επόμενο» ή ΚΟΚΚΙΝΟ «δεν πέρασε».
import { sound } from "./scan.js";
import { enqueueShot } from "./capture.js";

const $ = id => document.getElementById(id);
let cam = null;
const DARK = 62, BRIGHT = 95; // μέση φωτεινότητα 0–255

/** Μέση φωτεινότητα ενός καρέ (μικρό δείγμα, γρήγορο). */
export function lumaOf(src, w = 48, h = 36) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data; let s = 0;
  for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return s / (w * h);
}

async function setTorch(on) {
  if (!cam || !cam.caps.torch) return;
  try { await cam.track.applyConstraints({ advanced: [{ torch: on }] }); cam.torch = on; $("camTorch").classList.toggle("primary", on); } catch { /* */ }
}
function lightLoop() {
  if (!cam) return;
  const v = $("camVideo");
  if (v.videoWidth) {
    const L = lumaOf(v); cam.l = L;
    const dark = L < DARK, warn = $("camLight");
    if (dark) {
      warn.hidden = false;
      if (cam.caps.torch && !cam.torch && !cam.userTorch) { setTorch(true); cam.autoTorch = true; }
      warn.textContent = cam.caps.torch ? (cam.torch ? "🔦 Φακός ανοιχτός — ακόμα λίγο φως, πλησίασε την ετικέτα" : "💡 Λίγο φως — πάτα 🔦") : "💡 Λίγο φως — πήγαινε σε πιο φωτεινό σημείο, ή χρησιμοποίησε το «📷 Φωτογραφίες δεμάτων» με φλας";
    } else if (L > BRIGHT) warn.hidden = true;
  }
  cam.loop = setTimeout(lightLoop, 400);
}

let flashT = null;
function flash(kind, big, name, sub, ms) {
  const f = $("camFlash"); clearTimeout(flashT);
  f.className = "scanflash " + kind; f.hidden = false;
  $("camBig").textContent = big; $("camName").textContent = name || ""; $("camSub").textContent = sub || "";
  $("camCnt").textContent = cam ? "✓ " + cam.ok + (cam.bad ? " · ✗ " + cam.bad : "") : "";
  if (ms) flashT = setTimeout(() => { f.hidden = true; }, ms);
}

const fast = () => { try { return localStorage.getItem("camFast") === "1"; } catch { return false; } };
function logLine(n, r) {
  const li = document.createElement("div"); li.className = "camlog-" + (r.ok ? "ok" : "bad");
  li.textContent = "#" + n + " " + (r.ok ? "✓ " : "✗ ") + (r.name || "—") + (r.sub ? " · " + r.sub : "");
  const L = $("camLog"); L.prepend(li); while (L.childNodes.length > 30) L.lastChild.remove();
}
function pendTxt() { if (!cam) return; $("camPend").textContent = cam.pend ? "⏳ " + cam.pend + " διαβάζονται" : ""; $("camPend").hidden = !cam.pend; }
/** ⚡ Συνεχόμενη λήψη: δεν περιμένει το αποτέλεσμα — τα πράσινα/κόκκινα έρχονται με αριθμό λήψης και όνομα. */
async function shootFast(v) {
  const now = Date.now(); if (now - (cam.lastShot || 0) < 700) return; cam.lastShot = now;
  sound.unlock(); const n = ++cam.seq;
  const file = await grab(v); if (!file) return;
  sound.dup(); $("camVideo").classList.remove("snap"); void $("camVideo").offsetWidth; $("camVideo").classList.add("snap");
  cam.pend++; pendTxt();
  const res = await Promise.race([enqueueShot(file.f), new Promise(r => setTimeout(() => r({ late: true }), 60000))]);
  if (!cam) return; cam.pend--; pendTxt();
  if (!res) return;
  if (res.late) { logLine(n, { ok: false, name: "αργεί", sub: "θα διαβαστεί μόλις υπάρξει σύνδεση" }); return; }
  const r = { ...res, sub: [res.sub, !res.ok && file.dark ? "σκοτεινή φωτογραφία" : ""].filter(Boolean).join(" · ") };
  logLine(n, r);
  const cnt = () => { $("camCnt").textContent = "✓ " + cam.ok + (cam.bad ? " · ✗ " + cam.bad : ""); };
  if (r.ok) { cam.ok++; cnt(); }
  if (r.ok) { sound.ok(); if ($("camFlash").hidden || !$("camFlash").classList.contains("bad")) flash("ok", "✓ #" + n, r.name, r.sub, 900); }
  else { cam.bad++; cam.redN = ($("camFlash").hidden || !$("camFlash").classList.contains("bad")) ? 1 : (cam.redN || 1) + 1; sound.bad();
    flash("bad", "✗ #" + n + " ΔΕΝ ΠΕΡΑΣΕ", r.name, r.sub + (cam.redN > 1 ? " · (+" + (cam.redN - 1) + " ακόμα κόκκινα — δες τη λίστα)" : "") + " · Πάτα για συνέχεια"); }
}
async function grab(v) {
  let blob = null;
  if (window.ImageCapture && cam.track.readyState === "live") { try { blob = await new ImageCapture(cam.track).takePhoto(); } catch { blob = null; } }
  const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0);
  const dark = lumaOf(c) < DARK - 12;
  if (!blob) blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
  if (!blob) return null;
  return { f: new File([blob], "etiketa-" + Date.now() + ".jpg", { type: "image/jpeg", lastModified: Date.now() }), dark };
}
async function shoot() {
  if (!cam) return;
  if (fast()) { const v = $("camVideo"); if (v.videoWidth) shootFast(v); return; }
  if (cam.busy) return;
  const v = $("camVideo"); if (!v.videoWidth) return;
  sound.unlock(); cam.busy = true; $("camShot").disabled = true;
  try {
    let blob = null;
    // Android: φωτογραφία πλήρους ανάλυσης του αισθητήρα (όχι καρέ βίντεο)
    if (window.ImageCapture && cam.track.readyState === "live") { try { blob = await new ImageCapture(cam.track).takePhoto(); } catch { blob = null; } }
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0);
    const dark = lumaOf(c) < DARK - 12;
    if (!blob) blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
    const file = new File([blob], "etiketa-" + Date.now() + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
    flash("dup", "⏳ ΔΙΑΒΑΖΩ…", dark ? "Σκοτεινή φωτογραφία" : "", "Κράτα το επόμενο δέμα έτοιμο");
    const res = await Promise.race([enqueueShot(file), new Promise(r => setTimeout(() => r({ late: true }), 30000))]);
    if (!res) { $("camFlash").hidden = true; return; } // χωρίς χρήστη
    if (res.late) { flash("warn", "⏳ ΑΡΓΕΙ", "Χωρίς σύνδεση ή αργό δίκτυο", "Θα διαβαστεί μόλις γίνει δυνατό — συνέχισε", 2500); return; }
    if (res.ok) { cam.ok++; sound.ok(); flash("ok", "✓ ΠΕΡΑΣΕ", res.name, [res.sub, "ΕΠΟΜΕΝΟ ▶"].filter(Boolean).join(" · "), 1400); }
    else { cam.bad++; sound.bad(); flash("bad", "✗ ΔΕΝ ΠΕΡΑΣΕ", res.name, (res.sub || "") + (dark ? " · Η φωτογραφία ήταν σκοτεινή — άνοιξε φακό" : "") + " · Πάτα για συνέχεια"); }
  } finally { if (cam) { cam.busy = false; $("camShot").disabled = false; } }
}

async function openCam() {
  const dlg = $("camDlg"); dlg.showModal(); sound.unlock();
  $("camStatus").textContent = "Άνοιγμα κάμερας…"; $("camStatus").className = "msg info"; $("camFlash").hidden = true; $("camLight").hidden = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
    const track = stream.getVideoTracks()[0]; const caps = (track.getCapabilities && track.getCapabilities()) || {};
    try { if ((caps.focusMode || []).includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch { /* */ }
    cam = { stream, track, caps, ok: 0, bad: 0, busy: false, torch: false, userTorch: false, seq: 0, pend: 0 };
    $("camLog").textContent = ""; pendTxt();
    const v = $("camVideo"); v.srcObject = stream; await v.play().catch(() => {});
    $("camTorch").hidden = !caps.torch;
    const st = track.getSettings ? track.getSettings() : {}; cam.res = st.width ? st.width + "×" + st.height : "";
    $("camStatus").textContent = (cam.res ? "[" + cam.res + "] " : "") + "Βάλε την ετικέτα να γεμίζει την οθόνη και πάτα «📸 Λήψη» (ή πάνω στην εικόνα).";
    lightLoop();
  } catch (e) {
    $("camStatus").className = "msg bad";
    $("camStatus").textContent = "Δεν άνοιξε η κάμερα (" + (e.name === "NotAllowedError" ? "δεν δόθηκε άδεια" : e.message || e.name) + "). Χρησιμοποίησε το «📷 Φωτογραφίες δεμάτων».";
  }
}
function closeCam() {
  if (cam) { clearTimeout(cam.loop); cam.stream.getTracks().forEach(t => t.stop()); cam = null; }
  $("camVideo").srcObject = null; $("camDlg").close();
}
export function initCamera() {
  if (!$("camBtn")) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $("camBtn").hidden = true; return; }
  $("camBtn").onclick = openCam;
  $("camClose").onclick = closeCam;
  $("camDlg").addEventListener("cancel", e => { e.preventDefault(); closeCam(); });
  $("camShot").onclick = shoot;
  $("camVideo").onclick = shoot;
  $("camFlash").onclick = () => { if (cam && cam.busy) return; clearTimeout(flashT); $("camFlash").hidden = true; };
  const ft = $("camFast"); const syncF = () => { ft.classList.toggle("primary", fast()); ft.textContent = fast() ? "⚡ Συνεχόμενη: ΝΑΙ" : "⚡ Συνεχόμενη: ΟΧΙ"; };
  ft.onclick = () => { try { localStorage.setItem("camFast", fast() ? "0" : "1"); } catch { /* */ } syncF(); }; syncF();
  $("camTorch").onclick = () => { if (!cam) return; cam.userTorch = true; setTorch(!cam.torch); };
}
