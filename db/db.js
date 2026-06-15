// db/db.js — client PostgreSQL Neon (serverless)
// Remplace node:sqlite de V1. Même principe : import sql, puis requêtes taguées.
//
// Usage :
//   import sql from '../db/db.js'
//   const rows = await sql`SELECT * FROM jd_notes WHERE workspace_id = ${wsId}`
//   const [note] = await sql`INSERT INTO jd_notes (...) VALUES (...) RETURNING *`

import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL est manquant dans les variables d\'environnement')
}

const sql = neon(process.env.DATABASE_URL)

export default sql

// Helper : initialise le schéma (à appeler au premier démarrage ou en migration)
export async function initSchema() {
  const { readFileSync } = await import('fs')
  const { fileURLToPath } = await import('url')
  const { dirname, join } = await import('path')
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
  // Découper par instruction et exécuter séquentiellement
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))
  for (const stmt of statements) {
    await sql.unsafe(stmt)
  }
  console.log('Schéma PostgreSQL initialisé.')
}
