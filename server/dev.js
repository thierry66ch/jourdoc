// Serveur de développement local — charge .env.local puis démarre Hono sur port 3000
// En production Vercel, ce fichier n'est pas utilisé (api/index.js prend le relais)

import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env.local')

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !(key in process.env)) process.env[key] = val
  }
}

const { default: app } = await import('./app.js')
const { serve } = await import('@hono/node-server')

serve({ fetch: app.fetch, port: 3000 }, () => {
  console.log('API Hono → http://localhost:3000')
})
