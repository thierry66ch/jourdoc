// server/app.js — app Hono 4
// Identique à V1 server/index.js, sans @hono/node-server.
// Le démarrage HTTP est géré par Vercel (prod) ou par le script dev (local).

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

// Routes (à porter depuis V1 server/routes/)
import authRoutes    from './routes/auth.js'
import adminRoutes   from './routes/admin.js'
import portalRoutes  from './routes/portal.js'
import jourdocRoutes from './routes/jourdoc.js'
import inboxRoutes   from './routes/inbox.js'

// Rate limiting en mémoire (par instance — acceptable pour usage personnel)
const loginAttempts = new Map()

const app = new Hono()

// ─── Middleware globaux ───────────────────────────────────────────────────────

app.use('*', logger())
app.use('*', cors({
  origin: process.env.VITE_API_URL || '*',
  credentials: true,
}))

// ─── Chargement manuel des variables d'environnement (dev local) ─────────────
// En production Vercel, les env vars sont injectées automatiquement.
// En local, utiliser un fichier .env.local et dotenv.

// ─── Routes API ──────────────────────────────────────────────────────────────

app.route('/api/auth',    authRoutes)
app.route('/api/admin',   adminRoutes)
app.route('/api/me',      portalRoutes)
app.route('/api/jourdoc', jourdocRoutes)
app.route('/api/jourdoc', inboxRoutes)

// ─── Manifest PWA ────────────────────────────────────────────────────────────

app.get('/manifest.webmanifest', (c) => {
  // Contenu du manifest — à remplir avec les valeurs de V1
  return c.json({
    name: 'JourDoc',
    short_name: 'JourDoc',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icon-192.png',          sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png',          sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, 200, { 'Content-Type': 'application/manifest+json' })
})

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', (c) => c.json({ ok: true, build: process.env.npm_package_version }))

export default app
export { loginAttempts }
