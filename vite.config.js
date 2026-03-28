import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    watch: {
      // Ignora la cartella public e node_modules per evitare riavvii infiniti
      ignored: ['**/public/**', '**/node_modules/**'],
    },
  },
  build: {
    outDir: 'public',
    emptyOutDir: true,
  }
})
