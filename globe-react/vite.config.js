import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/globe/',
  build: {
    outDir: '../globe',      // write into repo root /globe
    emptyOutDir: true,
    rollupOptions: { input: './index.html' }
  },
  plugins: [react()]
})
