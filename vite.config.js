import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'public', // Output diretto dentro public per Signal K
    emptyOutDir: false, // CRUCIALE: impedisce a Vite di cancellare AppIcon.png dentro public/
  }
})
