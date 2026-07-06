import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built app works from any GitHub Pages sub-path
// (https://<user>.github.io/<repo>/) without hard-coding the repo name.
// HashRouter keeps all routing in the URL fragment, so no server rewrites are needed.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 3000 },
  build: {
    outDir: 'dist',
    rollupOptions: { output: { manualChunks: undefined } },
  },
});
