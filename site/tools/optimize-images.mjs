// Μικρότερες εικόνες για κινητά — τρέχει ΜΙΑ φορά όταν μπαίνει/αλλάζει φωτογραφία ή λογότυπο (όχι στο build):
//   cd site && npm i --no-save sharp && node tools/optimize-images.mjs
// Φωτογραφίες: για κάθε src/assets/photos/όνομα.jpg φτιάχνει όνομα-480/800/1200/<πλάτος>.avif και .webp (μόνο μικρότερα από το πρωτότυπο).
// Το build.mjs τα βάζει αυτόματα σε <picture> αν υπάρχουν· αν λείπουν, η σελίδα δείχνει το jpg όπως πριν.
// Λογότυπα (--logos): mark.png και brands/*.png στο διπλάσιο του μεγέθους που δείχνονται, με παλέτα (PNG-8).
import sharp from "sharp";
import { readdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PH = join(ROOT, "src/assets/photos");
for (const f of readdirSync(PH).filter(f => /^[a-z0-9-]+\.jpe?g$/.test(f))) {
  const name = f.replace(/\.jpe?g$/, ""), src = join(PH, f), { width } = await sharp(src).metadata();
  const widths = [480, 800, 1200].filter(w => w < width).concat([width]);
  const out = [];
  for (const w of widths) {
    const r = sharp(src).rotate().resize({ width: w });
    const a = await r.clone().avif({ quality: 50, effort: 6 }).toBuffer(), b = await r.clone().webp({ quality: 72, effort: 6 }).toBuffer();
    writeFileSync(join(PH, `${name}-${w}.avif`), a); writeFileSync(join(PH, `${name}-${w}.webp`), b);
    out.push(`${w}w: avif ${(a.length / 1024).toFixed(0)} KB, webp ${(b.length / 1024).toFixed(0)} KB`);
  }
  console.log(`${f} (${(statSync(src).size / 1024).toFixed(0)} KB) → ${out.join(" · ")}`);
}
if (process.argv.includes("--logos")) {
  // [αρχείο, ύψος που δείχνεται σε px] → αποθήκευση στο 2x
  for (const [f, h] of [["mark.png", 27], ["brands/whatsapp.png", 28], ["brands/viber.png", 28], ["brands/asap.png", 32]]) {
    const p = join(ROOT, "src/assets", f), before = statSync(p).size;
    const buf = await sharp(readFileSync(p)).resize({ height: h * 2 }).png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 }).toBuffer();
    writeFileSync(p, buf); console.log(`${f}: ${(before / 1024).toFixed(1)} KB → ${(buf.length / 1024).toFixed(1)} KB`);
  }
}
