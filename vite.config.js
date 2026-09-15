import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    // Во время локальной разработки (npm run dev) запросы /api
    // проксируются на express-сервер бота (npm start в корне проекта).
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
});
