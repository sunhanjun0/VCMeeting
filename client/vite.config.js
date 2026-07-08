import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies API + content + socket to the Node server so the browser
// treats everything as same-origin (mirrors nginx behavior in prod).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/content': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true }
    }
  }
});
