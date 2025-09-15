export default defineConfig({
  base: '/globe/',        // we want site.com/globe
  build: {
    outDir: '../globe',   // so the built files end up in /globe at root
    emptyOutDir: true
  }
})
