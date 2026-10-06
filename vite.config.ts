import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `npm run dev`       → prototype (mock) mode, no backend needed
// `npm run dev:live`  → live mode; /api and the WebSocket are proxied to WYZI_BACKEND
//                       (default http://127.0.0.1:8081, e.g. `ssh -L 8081:127.0.0.1:8081 marceserver`)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const backend = env.WYZI_BACKEND || 'http://127.0.0.1:8081';
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      open: false,
      proxy: { '/api': { target: backend, ws: true, changeOrigin: false } },
    },
    build: { chunkSizeWarningLimit: 900 },
  };
});
