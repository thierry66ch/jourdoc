import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '../.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq < 0 || line.startsWith('#')) continue
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim()
    if (k && !(k in process.env)) process.env[k] = v
  }
}

const { default: sql } = await import('./db.js')

const ws  = await sql`SELECT id, name FROM workspaces ORDER BY id`
const uwa = await sql`SELECT user_id, workspace_id, role FROM user_workspace_access`
const notes = await sql`SELECT id, titre, date, workspace_id FROM jd_notes ORDER BY date DESC LIMIT 5`
const users = await sql`SELECT id, username, email FROM users`

console.log('\nUsers V2 :', users)
console.log('\nWorkspaces :', ws)
console.log('\nAccès user↔workspace :', uwa)
console.log('\nDernières notes :', notes)
process.exit(0)
