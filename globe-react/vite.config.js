import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Output the compiled globe into /globe at the repository root
    outDir: "../globe",
    emptyOutDir: true
  },
  // Make sure built asset URLs are /globe/... so Netlify serves them correctly
  base: "/globe/"
});
