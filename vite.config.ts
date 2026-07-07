import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: './' produces relative asset URLs, so the same build works on
// GitHub Pages (served from /DrillMCQ/) and Vercel (served from /).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
