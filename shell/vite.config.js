import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Default session URL — override via VITE_SESSION_MENU_URL in .env
// In production both shell and sessions are served from the same origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8503,
    host: '0.0.0.0',
    allowedHosts: ['gacaiserver', 'localhost'],
    proxy: {
      '/v1': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
