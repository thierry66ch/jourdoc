/**
 * Migration fichiers V1 → KDrive WebDAV V2
 *
 * Usage :
 *   node db/migrate-files.js /chemin/vers/dossier-uploads-local
 *
 * Prérequis : avoir téléchargé les fichiers depuis Infomaniak via SFTP
 *   dans un dossier local. Structure attendue (flexible) :
 *   - dossier-uploads-local/uuid.jpg  (fichiers à la racine)
 *   - dossier-uploads-local/jourdoc/1/uuid.jpg  (sous-dossiers V1)
 *
 * Le script uploade tous les fichiers trouvés vers :
 *   WEBDAV_PATH_UPLOADS/uuid.ext  (KDrive)
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { resolve, dirname, join, basename } from 'path'
import { fileURLToPath } from 'url'

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

const localDir = process.argv[2]
if (!localDir || !existsSync(localDir)) {
  console.error('Usage : node db/migrate-files.js /chemin/vers/dossier-uploads-local')
  process.exit(1)
}

const { uploadFile } = await import('../packages/storage/index.js')
const uploadsPath = process.env.WEBDAV_PATH_UPLOADS

if (!uploadsPath) {
  console.error('WEBDAV_PATH_UPLOADS manquant dans .env.local')
  process.exit(1)
}

// Collecte récursivement tous les fichiers du dossier
function collectFiles(dir) {
  const result = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      result.push(...collectFiles(full))
    } else {
      result.push(full)
    }
  }
  return result
}

const allFiles = collectFiles(localDir)
console.log(`\n${allFiles.length} fichier(s) trouvé(s) dans ${localDir}`)
console.log(`Destination WebDAV : ${uploadsPath}\n`)

let ok = 0, skip = 0, errors = 0

for (const filePath of allFiles) {
  const filename = basename(filePath)
  // Ne traiter que les fichiers média (UUID + extension)
  if (!/^[0-9a-f-]{36}\.(jpg|jpeg|png|gif|webp|pdf|heic|heif|avif)$/i.test(filename)) {
    skip++
    continue
  }
  try {
    const buffer = readFileSync(filePath)
    await uploadFile(uploadsPath, filename, buffer, null)
    console.log(`  ✓ ${filename}`)
    ok++
  } catch (err) {
    console.error(`  ✗ ${filename} : ${err.message}`)
    errors++
  }
}

console.log(`\n✅ Migration fichiers terminée : ${ok} uploadé(s), ${skip} ignoré(s), ${errors} erreur(s)`)
process.exit(errors > 0 ? 1 : 0)
