import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/globe/',
  plugins: [react()],
  build: { outDir: '../globe', emptyOutDir: true }
});
