import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Relative base so the build works from any path: the Python server, GitHub Pages, a file share.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: '../python/harryplotter/static', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: { proxy: { '/api': 'http://127.0.0.1:8765' } },
});
