import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In sviluppo (npm run dev) inoltra /api, /uploads e /yjs (WebSocket) al server Node.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/yjs': { target: 'ws://localhost:4000', ws: true },
    },
  },
});
