import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to TabzChrome backend
      '/api': {
        target: 'http://localhost:8129',
        changeOrigin: true,
      },
    },
  },
});
