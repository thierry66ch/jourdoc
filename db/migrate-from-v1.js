/**
 * Migration SQLite V1 → PostgreSQL (Neon) V2
 *
 * Usage :
 *   node db/migrate-from-v1.js /chemin/vers/pogil.db
 *
 * Ce script :
 *   1. Efface les données JourDoc existantes en V2 (workspaces + tables jd_*)
 *   2. Réinsère toutes les données V1 en conservant les IDs d'origine
 *   3. Recrée les accès user↔workspace
 *   4. Remet à jour les séquences SERIAL
 *
 * Les données de portail (users, admin, apps) ne sont PAS touchées.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

// ── Charger .env.local ────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '../.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq < 0 || line.startsWith('#')) continue
    const k = line.slice(0, eq).trim()
    const v = line.slice(eq + 1).trim()
    if (k && !(k in process.env)) process.env[k] = v
  }
}

// ── Arguments ─────────────────────────────────────────────────────────────────
const sqlitePath = process.argv[2]
if (!sqlitePath || !existsSync(sqlitePath)) {
  console.error('Usage : node db/migrate-from-v1.js /chemin/vers/pogil.db')
  process.exit(1)
}

// ── Ouvrir SQLite ─────────────────────────────────────────────────────────────
// node:sqlite est disponible depuis Node.js 22.5+
// Sur Node 20, utiliser better-sqlite3 (npm install better-sqlite3)
let db
try {
  const { DatabaseSync } = await import('node:sqlite')
  db = new DatabaseSync(sqlitePath)
  console.log('SQLite ouvert via node:sqlite')
} catch {
  try {
    const require = createRequire(import.meta.url)
    const Database = require('better-sqlite3')
    db = new Database(sqlitePath, { readonly: true })
    console.log('SQLite ouvert via better-sqlite3')
  } catch {
    console.error('Impossible d\'ouvrir SQLite. Installe better-sqlite3 : npm install better-sqlite3')
    process.exit(1)
  }
}

// ── Client Neon ───────────────────────────────────────────────────────────────
const { default: sql } = await import('./db.js')

// ── Helpers ───────────────────────────────────────────────────────────────────
const b = v => v === 1 || v === true  // SQLite 0/1 → PG boolean

function rows(query, params = []) {
  // Compatibilité node:sqlite et better-sqlite3
  if (typeof db.prepare === 'function') {
    return db.prepare(query).all(...params)
  }
  // node:sqlite
  const stmt = db.prepare(query)
  return stmt.all(...params)
}

// ── 1. Trouver le user V2 (par email) ────────────────────────────────────────
const [v1User] = rows('SELECT id, email FROM users LIMIT 1')
console.log(`\nUser V1 : ${v1User.email} (id=${v1User.id})`)

const [v2User] = await sql`SELECT id, email FROM users WHERE email = ${v1User.email}`
if (!v2User) {
  console.error(`Aucun user V2 avec l'email ${v1User.email}. Lance d'abord db/seed.js.`)
  process.exit(1)
}
console.log(`User V2 : ${v2User.email} (id=${v2User.id})`)

// ── 2. Trouver l'app jourdoc en V2 ───────────────────────────────────────────
const [v2App] = await sql`SELECT id FROM apps WHERE slug = 'jourdoc'`
if (!v2App) {
  console.error('App jourdoc introuvable en V2. Lance d\'abord db/seed.js.')
  process.exit(1)
}
console.log(`App jourdoc V2 : id=${v2App.id}`)

// ── 3. Effacer les données JourDoc existantes en V2 ──────────────────────────
console.log('\nNettoyage des données V2 existantes…')
await sql`DELETE FROM user_workspace_access`
await sql`DELETE FROM workspaces`
// Les tables jd_* se vident en cascade (ON DELETE CASCADE)
console.log('✓ Données effacées')

// ── 4. Workspaces ─────────────────────────────────────────────────────────────
const workspaces = rows('SELECT * FROM workspaces WHERE app_id = (SELECT id FROM apps WHERE slug = \'jourdoc\')')
console.log(`\nMigration ${workspaces.length} workspace(s)…`)

for (const ws of workspaces) {
  await sql`
    INSERT INTO workspaces (id, app_id, name, created_by, created_at,
      jd_search_depth, todoist_token, todoist_project_id, todoist_project_nom)
    OVERRIDING SYSTEM VALUE
    VALUES (
      ${ws.id}, ${v2App.id}, ${ws.name}, ${v2User.id}, ${ws.created_at ?? new Date().toISOString()},
      ${ws.jd_search_depth ?? 3}, ${ws.todoist_token ?? null},
      ${ws.todoist_project_id ?? null}, ${ws.todoist_project_nom ?? null}
    )
  `
  // Accès user → workspace
  await sql`
    INSERT INTO user_workspace_access (user_id, workspace_id, role)
    VALUES (${v2User.id}, ${ws.id}, 'owner')
    ON CONFLICT DO NOTHING
  `
  console.log(`  ✓ Workspace "${ws.name}" (id=${ws.id})`)
}

// ── 5. jd_objets ──────────────────────────────────────────────────────────────
const objets = rows('SELECT * FROM jd_objets')
console.log(`\nMigration ${objets.length} objet(s)…`)
for (const o of objets) {
  await sql`
    INSERT INTO jd_objets (id, workspace_id, parent_id, nom, nom_court, est_individu, description, created_at)
    OVERRIDING SYSTEM VALUE
    VALUES (${o.id}, ${o.workspace_id}, ${o.parent_id ?? null}, ${o.nom},
      ${o.nom_court ?? null}, ${b(o.est_individu)}, ${o.description ?? null},
      ${o.created_at ?? new Date().toISOString()})
  `
}
console.log('  ✓')

// ── 6. jd_themes ──────────────────────────────────────────────────────────────
const themes = rows('SELECT * FROM jd_themes')
console.log(`\nMigration ${themes.length} thème(s)…`)
for (const t of themes) {
  await sql`
    INSERT INTO jd_themes (id, workspace_id, parent_id, nom, nom_court, created_at)
    OVERRIDING SYSTEM VALUE
    VALUES (${t.id}, ${t.workspace_id}, ${t.parent_id ?? null}, ${t.nom},
      ${t.nom_court ?? null}, ${t.created_at ?? new Date().toISOString()})
  `
}
console.log('  ✓')

// ── 7. jd_elements ────────────────────────────────────────────────────────────
const elements = rows('SELECT * FROM jd_elements')
console.log(`\nMigration ${elements.length} élément(s)…`)
for (const e of elements) {
  await sql`
    INSERT INTO jd_elements (id, workspace_id, nom, created_at)
    OVERRIDING SYSTEM VALUE
    VALUES (${e.id}, ${e.workspace_id}, ${e.nom}, ${e.created_at ?? new Date().toISOString()})
    ON CONFLICT DO NOTHING
  `
}
console.log('  ✓')

// ── 8. jd_notes ───────────────────────────────────────────────────────────────
const notes = rows('SELECT * FROM jd_notes')
console.log(`\nMigration ${notes.length} note(s)…`)
for (const n of notes) {
  await sql`
    INSERT INTO jd_notes (
      id, workspace_id, type, nature, theme_id, titre, titre_alt, contenu,
      date, source_url, created_at, updated_at,
      tache_todoist_id, tache_todoist_due, tache_todoist_priority,
      tache_todoist_done, tache_todoist_recurrence_done,
      tache_todoist_consigne, tache_todoist_content
    )
    OVERRIDING SYSTEM VALUE
    VALUES (
      ${n.id}, ${n.workspace_id}, ${n.type}, ${n.nature ?? null},
      ${n.theme_id ?? null}, ${n.titre}, ${n.titre_alt ?? null}, ${n.contenu ?? null},
      ${n.date ?? null}, ${n.source_url ?? null},
      ${n.created_at ?? new Date().toISOString()},
      ${n.updated_at ?? new Date().toISOString()},
      ${n.tache_todoist_id ?? null}, ${n.tache_todoist_due ?? null},
      ${n.tache_todoist_priority ?? null},
      ${b(n.tache_todoist_done)}, ${b(n.tache_todoist_recurrence_done)},
      ${n.tache_todoist_consigne != null ? String(n.tache_todoist_consigne) : null},
      ${n.tache_todoist_content ?? null}
    )
  `
}
console.log('  ✓')

// ── 9. jd_medias ──────────────────────────────────────────────────────────────
// V1 fichier = "uploads/jourdoc/1/uuid.ext"
// V2 fichier = "/pogil.ch/Apps_datas/JourDoc/uploads/uuid.ext" (chemin WebDAV complet)
const uploadsPath = process.env.WEBDAV_PATH_UPLOADS || '/pogil.ch/Apps_datas/JourDoc/uploads'
const medias = rows('SELECT * FROM jd_medias')
console.log(`\nMigration ${medias.length} média(s)…`)
for (const m of medias) {
  const filename = m.fichier.split('/').pop()
  const fichierV2 = `${uploadsPath}/${filename}`
  await sql`
    INSERT INTO jd_medias (id, workspace_id, fichier, nom_original, type_media, mime_type, taille, date_prise, lie, created_at)
    OVERRIDING SYSTEM VALUE
    VALUES (
      ${m.id}, ${m.workspace_id}, ${fichierV2}, ${m.nom_original ?? null},
      ${m.type_media}, ${m.mime_type ?? null}, ${m.taille ?? null},
      ${m.date_prise ?? null}, ${b(m.lie)},
      ${m.created_at ?? new Date().toISOString()}
    )
  `
}
console.log('  ✓')

// ── 10. Tables de liaison ─────────────────────────────────────────────────────
console.log('\nMigration des liaisons…')

const noteObjets = rows('SELECT * FROM jd_note_objet')
for (const r of noteObjets)
  await sql`INSERT INTO jd_note_objet (note_id, objet_id) VALUES (${r.note_id}, ${r.objet_id}) ON CONFLICT DO NOTHING`
console.log(`  ✓ jd_note_objet  (${noteObjets.length})`)

const noteNotes = rows('SELECT * FROM jd_note_note')
for (const r of noteNotes)
  await sql`INSERT INTO jd_note_note (note_source_id, note_cible_id, type_lien) VALUES (${r.note_source_id}, ${r.note_cible_id}, ${r.type_lien ?? null}) ON CONFLICT DO NOTHING`
console.log(`  ✓ jd_note_note   (${noteNotes.length})`)

const noteMedias = rows('SELECT * FROM jd_note_media')
for (const r of noteMedias)
  await sql`INSERT INTO jd_note_media (note_id, media_id) VALUES (${r.note_id}, ${r.media_id}) ON CONFLICT DO NOTHING`
console.log(`  ✓ jd_note_media  (${noteMedias.length})`)

const noteElements = rows('SELECT * FROM jd_note_element')
for (const r of noteElements)
  await sql`INSERT INTO jd_note_element (note_id, element_id) VALUES (${r.note_id}, ${r.element_id}) ON CONFLICT DO NOTHING`
console.log(`  ✓ jd_note_element (${noteElements.length})`)

// ── 11. Remettre à jour les séquences SERIAL ──────────────────────────────────
console.log('\nMise à jour des séquences…')
for (const table of ['workspaces', 'jd_objets', 'jd_themes', 'jd_elements', 'jd_notes', 'jd_medias']) {
  await sql.unsafe(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`)
}
console.log('  ✓')

console.log('\n✅ Migration DB terminée avec succès !')
console.log('   N\'oublie pas de migrer les fichiers : node db/migrate-files.js /dossier/uploads-v1')
process.exit(0)
