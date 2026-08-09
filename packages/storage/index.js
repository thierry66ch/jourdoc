// packages/storage/index.js — module WebDAV mutualisé
//
// Ce module est l'UNIQUE endroit qui connaît WebDAV.
// Les routes Hono appellent ces fonctions sans savoir comment les fichiers sont stockés.
// Si on change de provider (KDrive → Nextcloud → S3), on ne touche qu'à ce fichier.
//
// Tous les chemins (appPath) viennent de variables d'environnement :
//   process.env.WEBDAV_PATH_UPLOADS  → /Apps_data/JourDoc/uploads
//   process.env.WEBDAV_PATH_INBOX    → /Apps_data/JourDoc/inbox
// Jamais de chemins hardcodés dans les routes.

import { createClient } from 'webdav'

// ─── Client WebDAV ────────────────────────────────────────────────────────────

function getClient() {
  const url  = process.env.WEBDAV_URL
  const user = process.env.WEBDAV_USER
  const pass = process.env.WEBDAV_PASSWORD

  if (!url || !user || !pass) {
    throw new Error('Variables WebDAV manquantes : WEBDAV_URL, WEBDAV_USER, WEBDAV_PASSWORD')
  }

  return createClient(url, { username: user, password: pass })
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function joinPath(...parts) {
  return parts.join('/').replace(/\/+/g, '/')
}

// S'assure qu'un dossier existe (crée récursivement si besoin)
async function ensureDir(client, dirPath) {
  try {
    await client.createDirectory(dirPath, { recursive: true })
  } catch (e) {
    // Ignore si le dossier existe déjà
    if (!e.message?.includes('405') && !e.message?.includes('already exists')) {
      throw e
    }
  }
}

// ─── Résolution des dossiers de workspace ──────────────────────────────────────
//
// En base, le dossier d'un workspace est TOUJOURS son numéro (`uploads/2/…`). Mais
// l'utilisateur peut renommer physiquement le dossier sur KDrive en préfixant le numéro
// (`uploads/2 Modélisme/…`) pour s'y retrouver. On traduit donc, juste avant l'appel
// WebDAV, le segment numérique vers le dossier réel, tout en gardant le chemin canonique
// (numérique) côté appelant/DB → aucune migration, insensible aux renommages ultérieurs.

const WS_CACHE_TTL = 5 * 60 * 1000
const wsFolderCache = new Map()  // base → { at, map: Map<number, {exact?, named?}> }

function basePaths() {
  return [process.env.WEBDAV_PATH_UPLOADS, process.env.WEBDAV_PATH_INBOX, process.env.WEBDAV_PATH_EXTDOCS]
    .filter(Boolean)
}

// Map numéro → nom réel du sous-dossier de `base` (dossiers dont le nom commence par des
// chiffres). On préfère un dossier EXACTEMENT numérique (protège les données existantes) ;
// sinon la variante nommée. Cache court par base (les renommages sont rares).
async function wsFolderMap(client, base) {
  const cached = wsFolderCache.get(base)
  if (cached && Date.now() - cached.at < WS_CACHE_TTL) return cached.map
  const map = new Map()
  try {
    const items = await client.getDirectoryContents(base)
    for (const it of items) {
      if (it.type !== 'directory') continue
      const m = it.basename.match(/^(\d+)/)
      if (!m) continue
      const n = Number(m[1])
      const entry = map.get(n) || {}
      if (it.basename === m[1]) entry.exact = it.basename
      else if (!entry.named || it.basename.length < entry.named.length) entry.named = it.basename
      map.set(n, entry)
    }
  } catch { /* base absente ou non listable → pas de résolution (repli numérique) */ }
  wsFolderCache.set(base, { at: Date.now(), map })
  return map
}

// Traduit le segment de workspace (numérique) d'un chemin vers le dossier réel.
// Ne touche qu'un segment PUREMENT numérique juste après une base connue ; préserve la
// queue (sous-dossiers clipper/assets…). No-op si le dossier n'est pas renommé.
async function resolveWsPath(client, path) {
  const base = basePaths().find(b => path === b || path.startsWith(b + '/'))
  if (!base) return path
  const m = path.slice(base.length).match(/^\/(\d+)(\/.*|$)/)
  if (!m) return path  // pas de segment ws numérique (base seule, ou déjà nommé)
  const n = Number(m[1]), tail = m[2] || ''
  const entry = (await wsFolderMap(client, base)).get(n)
  const actual = entry?.exact ?? entry?.named
  if (!actual || actual === m[1]) return path
  return `${base}/${actual}${tail}`
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Upload un fichier dans un dossier WebDAV.
 * @param {string} appPath   - chemin dossier (depuis env), ex: /Apps_data/JourDoc/uploads
 * @param {string} filename  - nom du fichier (UUID généré par l'appelant)
 * @param {Buffer} buffer    - contenu du fichier
 * @param {string} mimetype  - MIME type (pour info, non utilisé par WebDAV)
 * @returns {string}         - chemin complet du fichier sur KDrive
 */
export async function uploadFile(appPath, filename, buffer, mimetype) {
  const client = getClient()
  const realDir = await resolveWsPath(client, appPath)
  await ensureDir(client, realDir)
  await client.putFileContents(joinPath(realDir, filename), buffer, { overwrite: true })
  return joinPath(appPath, filename)   // chemin CANONIQUE (numérique) pour la DB
}

/**
 * Télécharge un fichier depuis WebDAV.
 * @param {string} appPath   - chemin dossier
 * @param {string} filename  - nom du fichier
 * @returns {Buffer}
 */
export async function downloadFile(appPath, filename) {
  const client = getClient()
  const realDir = await resolveWsPath(client, appPath)
  const buffer = await client.getFileContents(joinPath(realDir, filename))
  return Buffer.from(buffer)
}

/**
 * Liste les fichiers d'un dossier WebDAV.
 * @param {string} appPath - chemin dossier
 * @returns {Array<{filename, basename, size, lastmod, mime}>}
 */
export async function listFiles(appPath) {
  const client = getClient()
  try {
    const items = await client.getDirectoryContents(await resolveWsPath(client, appPath))
    return items.filter(i => i.type === 'file').map(i => ({
      filename: i.basename,
      basename: i.basename,
      size:     i.size,
      lastmod:  i.lastmod,
      mime:     i.mime,
    }))
  } catch (e) {
    if (e.message?.includes('404')) return []
    throw e
  }
}

/**
 * Liste le contenu d'un dossier (dossiers ET fichiers) — pour le navigateur EXTDOCS.
 * @param {string} appPath - chemin complet du dossier
 * @returns {Array<{name, type, size, mime}>} type = 'file' | 'directory'
 */
export async function listDir(appPath) {
  const client = getClient()
  try {
    const items = await client.getDirectoryContents(await resolveWsPath(client, appPath))
    return items.map(i => ({ name: i.basename, type: i.type, size: i.size, mime: i.mime }))
  } catch (e) {
    if (e.message?.includes('404')) return []
    throw e
  }
}

/**
 * Supprime un fichier sur WebDAV.
 * @param {string} appPath
 * @param {string} filename
 */
export async function deleteFile(appPath, filename) {
  const client = getClient()
  const realDir = await resolveWsPath(client, appPath)
  await client.deleteFile(joinPath(realDir, filename))
}

/**
 * Supprime un fichier OU un dossier (collection) par chemin complet.
 * WebDAV DELETE sur une collection est récursif. Utilisé par l'annulation de
 * capture clipper (suppression du .md et de son dossier d'assets).
 * @param {string} fullPath - chemin complet du fichier ou dossier
 */
export async function deletePath(fullPath) {
  const client = getClient()
  await client.deleteFile(await resolveWsPath(client, fullPath))
}

/**
 * Liste les fichiers dans l'inbox (dossier de dépôt).
 * Même que listFiles mais path inbox séparé pour clarté sémantique.
 * @param {string} inboxPath - chemin inbox (depuis env), ex: /Apps_data/JourDoc/inbox
 * @returns {Array}
 */
export async function listInbox(inboxPath) {
  return listFiles(inboxPath)
}

/**
 * Déplace un fichier de l'inbox vers le dossier uploads (après traitement).
 * @param {string} inboxPath  - chemin inbox source
 * @param {string} filename   - nom du fichier à déplacer
 * @param {string} destPath   - chemin destination (uploads)
 * @param {string} destName   - nouveau nom (UUID) dans la destination
 * @returns {string}          - chemin complet destination
 */
export async function moveFromInbox(inboxPath, filename, destPath, destName) {
  const client = getClient()
  const realDest = await resolveWsPath(client, destPath)
  const realInbox = await resolveWsPath(client, inboxPath)
  await ensureDir(client, realDest)
  await client.moveFile(joinPath(realInbox, filename), joinPath(realDest, destName))
  return joinPath(destPath, destName)   // chemin CANONIQUE (numérique) pour la DB
}

/**
 * Récupère un fichier texte (GPX, MD…) depuis WebDAV en tant que string.
 * @param {string} fullPath - chemin complet du fichier
 * @returns {string}
 */
export async function getTextFile(fullPath) {
  const client = getClient()
  const content = await client.getFileContents(await resolveWsPath(client, fullPath), { format: 'text' })
  return content
}

/**
 * Écrit ou remplace un fichier texte sur WebDAV (ex: GPX enrichi, MD de stats).
 * @param {string} fullPath - chemin complet
 * @param {string} content  - contenu texte
 */
export async function putTextFile(fullPath, content) {
  const client = getClient()
  const realPath = await resolveWsPath(client, fullPath)
  await ensureDir(client, realPath.substring(0, realPath.lastIndexOf('/')))
  await client.putFileContents(realPath, content, { overwrite: true })
}
