// globe-react/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // This config file lives inside /globe-react
  plugins: [react()],
  base: '/globe/',                 // final site path
  root: '.',                       // use this folder as Vite root
  build: {
    outDir: '../globe',            // write built files to /globe at repo root
    emptyOutDir: true,
    rollupOptions: {
      input: './index.html'        // use globe-react/index.html as entry
    }
  }
})
