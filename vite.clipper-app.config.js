// vite.clipper-app.config.js — build de la fenêtre clipper (clipper-app.js).
//
// Bundle React AUTONOME (IIFE) chargé par public/clipper-app.html, servi first-party
// par JourDoc. Buildé séparément du front principal et exclu de la PWA/SW.
//
//   npm run build:clipper  (lance ce build + celui du lanceur)

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'public',
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: 'src/clipper/app.jsx',
      name: 'JourDocClipperApp',
      formats: ['iife'],
      fileName: () => 'clipper-app.js',
    },
    rollupOptions: {
      output: {
        entryFileNames: 'clipper-app.js',
        assetFileNames: 'clipper-app.[ext]',
        inlineDynamicImports: true,
      },
    },
  },
})
