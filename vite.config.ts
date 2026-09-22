import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any static host or subdirectory.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  server: { host: true },
});
