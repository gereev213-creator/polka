import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Локальная разработка: бот-процесс с Mini App API
      // (WEBAPP_PORT=8000). Префикс /api НЕ отрезаем — бот отдаёт /api/* сам.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
