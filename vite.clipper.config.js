// vite.clipper.config.js — build dédié du bundle clipper.
//
// Produit public/clipper.js : un bundle React AUTONOME (IIFE, React inclus) injecté
// par le bookmarklet sur des pages tierces. Buildé séparément du front principal et
// EXCLU de la PWA / du service worker (cf. globIgnores dans vite.config.js).
//
//   npm run build:clipper

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  publicDir: false,           // on écrit DANS public/, ne pas le traiter comme source
  define: {
    // Pas de framework PWA ici ; force le mode prod de React.
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'public',
    emptyOutDir: false,         // ne pas effacer auth-bridge.html & co
    cssCodeSplit: false,
    lib: {
      entry: 'src/clipper/launcher.js',
      name: 'JourDocClipperLauncher',
      formats: ['iife'],
      fileName: () => 'clipper.js',
    },
    rollupOptions: {
      output: {
        entryFileNames: 'clipper.js',
        assetFileNames: 'clipper.[ext]',
        inlineDynamicImports: true,
      },
    },
  },
})
