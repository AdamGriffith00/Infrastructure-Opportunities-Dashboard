import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// We output into ../globe so it’s served at /globe/
export default defineConfig({
  plugins: [react()],
  root: ".",                 // this folder (globe-react)
  base: "/globe/",           // ensures assets resolve when hosted at /globe/
  build: {
    outDir: "../globe",      // final static files = /globe
    emptyOutDir: true,
    sourcemap: false
  }
});
