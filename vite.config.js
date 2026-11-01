import { defineConfig } from "vite";
// Χτίζει στο /docs ώστε το GitHub Pages να το σερβίρει από τον κλάδο main.
export default defineConfig({ base: "./", build: { outDir: "docs", emptyOutDir: true } });
