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
    port: 8505,
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
