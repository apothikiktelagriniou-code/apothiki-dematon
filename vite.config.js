import { defineConfig } from "vite";
// Χτίζει στο /docs ώστε το GitHub Pages να το σερβίρει από τον κλάδο main.
// Κάθε build γράφει version.json — οι ανοιχτές συσκευές το ελέγχουν και δείχνουν «νέα έκδοση».
const BUILD = new Date().toISOString().slice(0, 16).replace("T", " ");
export default defineConfig({
  base: "./", build: { outDir: "docs", emptyOutDir: true },
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [{ name: "version-json", generateBundle() { this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD }) }); } }],
});
