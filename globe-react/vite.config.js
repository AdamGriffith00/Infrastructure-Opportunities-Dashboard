import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// This config file lives *inside* globe-react/, so root is '.'
export default defineConfig({
  root: '.',                 // use globe-react as the project root
  base: '/globe/',           // built files will be served under /globe/
  plugins: [react()],
  build: {
    outDir: '../globe',      // write final files directly to /globe at repo root
    emptyOutDir: true,       // clean /globe on every build
    sourcemap: false
  }
});
