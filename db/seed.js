// Initialisation : admin + premier utilisateur + app jourdoc
// Usage : node db/seed.js

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Charger .env.local
const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '../.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq < 0 || line.startsWith('#')) continue
    const k = line.slice(0, eq).trim(); const v = line.slice(eq+1).trim()
    if (k && !(k in process.env)) process.env[k] = v
  }
}

import bcrypt from 'bcrypt'
const { default: sql } = await import('./db.js')

// ── Paramètres à ajuster ──────────────────────────────────────
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || 'ty66ch@pogil.ch'
const ADMIN_PASSWORD = 'changeme123'   // ← à changer après le premier login

const USER_USERNAME  = 'thierry'
const USER_EMAIL     = 'ty66ch@pogil.ch'
const USER_PASSWORD  = 'changeme123'   // ← à changer après le premier login
// ─────────────────────────────────────────────────────────────

// Admin
const [existingAdmin] = await sql`SELECT id FROM admin WHERE email = ${ADMIN_EMAIL}`
if (existingAdmin) {
  console.log('Admin déjà existant, skip.')
} else {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12)
  await sql`INSERT INTO admin (email, password_hash) VALUES (${ADMIN_EMAIL}, ${hash})`
  console.log(`✅ Admin créé : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
}

// App JourDoc
let [app] = await sql`SELECT id FROM apps WHERE slug = 'jourdoc'`
if (!app) {
  ;[app] = await sql`
    INSERT INTO apps (slug, name, icon, description, is_active)
    VALUES ('jourdoc', 'JourDoc', '📔', 'Journal de terrain', TRUE)
    RETURNING id
  `
  console.log('✅ App jourdoc créée')
} else {
  console.log('App jourdoc déjà existante, skip.')
}

// Utilisateur
const [existingUser] = await sql`SELECT id FROM users WHERE email = ${USER_EMAIL}`
if (existingUser) {
  console.log('Utilisateur déjà existant, skip.')
} else {
  const hash = await bcrypt.hash(USER_PASSWORD, 12)
  const [user] = await sql`
    INSERT INTO users (username, email, password_hash, is_active)
    VALUES (${USER_USERNAME}, ${USER_EMAIL}, ${hash}, TRUE)
    RETURNING id
  `
  await sql`INSERT INTO user_app_access (user_id, app_id) VALUES (${user.id}, ${app.id})`
  console.log(`✅ Utilisateur créé : ${USER_USERNAME} / ${USER_PASSWORD}`)
}

console.log('\n⚠️  Change les mots de passe après le premier login !')
process.exit(0)
