import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@gac/agent-sdk': resolve(__dirname, '../../lib/agent-sdk'),
    },
  },
  server: {
    port: 8506,
    host: '0.0.0.0',
    allowedHosts: ['gacaiserver', 'localhost'],
    proxy: {
      '/images': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/downloaded_images': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
