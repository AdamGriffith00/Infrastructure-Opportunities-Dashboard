// globe-react/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // the source lives here
  root: 'globe-react',

  // the URL path the built app will be served on
  base: '/globe/',

  // write the build output into the repo at /globe
  build: {
    outDir: '../globe',      // => /globe
    emptyOutDir: true,
    assetsDir: 'assets'
  },

  plugins: [react()]
});
