import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'assets/globe',     // ⬅️ build into your existing site
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/globe.jsx',   // ⬅️ single entry
      output: {
        entryFileNames: 'globe.js',          // deterministic name for globe.html
        chunkFileNames: 'globe-[hash].js',
        assetFileNames: 'globe-[name].[ext]'
      }
    }
  }
})
