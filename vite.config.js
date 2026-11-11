import { defineConfig } from "vite";
// Χτίζει στο /docs ώστε το GitHub Pages να το σερβίρει από τον κλάδο main.
// Κάθε build γράφει version.json — οι ανοιχτές συσκευές το ελέγχουν και δείχνουν «νέα έκδοση».
const BUILD = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Athens" }).slice(0, 16); // ώρα Ελλάδας
export default defineConfig({
  base: "./", build: { outDir: "docs", emptyOutDir: true },
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [{ name: "version-json", generateBundle() { this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD }) }); } }],
});
