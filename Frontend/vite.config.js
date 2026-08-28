import { defineConfig } from 'vite';

const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:8000';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/patients': backendUrl,
      '/sessions': backendUrl,
      '/health': backendUrl,
      '/admin/ai-config': backendUrl,
      '/ws': {
        target: backendUrl,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
