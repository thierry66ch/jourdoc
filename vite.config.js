import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const buildInfo = JSON.parse(readFileSync(resolve(__dirname, 'build.json'), 'utf8'))

export default defineConfig({
  define: {
    __BUILD_NUMBER__: JSON.stringify(buildInfo.build),
    __BUILD_DATE__:   JSON.stringify(buildInfo.date),
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Le bundle clipper (buildé à part) et son pont sont autonomes et chargés
        // hors PWA : ne pas les précacher dans le service worker.
        globIgnores: ['**/clipper.js', '**/clipper-app.js', '**/clipper-app.html'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // Milkdown/KaTeX : chunks > 2 MiB
      },
      manifest: {
        name: 'JourDoc',
        short_name: 'JourDoc',
        description: 'Journal de terrain personnel',
        theme_color: '#6366f1',
        background_color: '#0f0f1a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'any',
        id: '/',
        icons: [
          { src: '/icon-192.png',          sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png',          sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
  },
})
