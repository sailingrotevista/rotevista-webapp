import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // Fondamentale per SignalK
  build: {
    outDir: 'public', // Cambiamo dist in public per SignalK
    emptyOutDir: true,
  }
})
