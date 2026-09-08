import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/contiunuum/', // GitHub Pages serves this project from a subpath, not the domain root
  plugins: [react()],
})
