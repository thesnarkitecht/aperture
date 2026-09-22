import { defineConfig } from 'vite';

// Relative base so the production build can be hosted from any path
// (static hosting, GitHub Pages, or a single inlined HTML file).
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
