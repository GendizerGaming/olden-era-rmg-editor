import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// On GitHub Pages the app is served from /<repo-name>/, so the production
// build needs that base for asset URLs to resolve. Dev keeps "/" so the local
// server and preview work at the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/olden-era-rmg-editor/' : '/',
  plugins: [react()],
}))
