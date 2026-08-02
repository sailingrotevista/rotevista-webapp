import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist', // Impostato l'output standard su 'dist' per preservare la cartella 'public'
    emptyOutDir: true,
  }
})
