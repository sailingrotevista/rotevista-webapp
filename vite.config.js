import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
  base: './',
  build: {
    outDir: 'public', // Output diretto dentro public per Signal K
    emptyOutDir: false, // CRUCIALE: impedisce a Vite di cancellare AppIcon.png dentro public/
  }
})
