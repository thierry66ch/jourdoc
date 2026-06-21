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
  await ensureDir(client, appPath)
  const fullPath = joinPath(appPath, filename)
  await client.putFileContents(fullPath, buffer, { overwrite: true })
  return fullPath
}

/**
 * Télécharge un fichier depuis WebDAV.
 * @param {string} appPath   - chemin dossier
 * @param {string} filename  - nom du fichier
 * @returns {Buffer}
 */
export async function downloadFile(appPath, filename) {
  const client = getClient()
  const fullPath = joinPath(appPath, filename)
  const buffer = await client.getFileContents(fullPath)
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
    const items = await client.getDirectoryContents(appPath)
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
    const items = await client.getDirectoryContents(appPath)
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
  const fullPath = joinPath(appPath, filename)
  await client.deleteFile(fullPath)
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
  await ensureDir(client, destPath)
  const src  = joinPath(inboxPath, filename)
  const dest = joinPath(destPath, destName)
  await client.moveFile(src, dest)
  return dest
}

/**
 * Récupère un fichier texte (GPX, MD…) depuis WebDAV en tant que string.
 * @param {string} fullPath - chemin complet du fichier
 * @returns {string}
 */
export async function getTextFile(fullPath) {
  const client = getClient()
  const content = await client.getFileContents(fullPath, { format: 'text' })
  return content
}

/**
 * Écrit ou remplace un fichier texte sur WebDAV (ex: GPX enrichi, MD de stats).
 * @param {string} fullPath - chemin complet
 * @param {string} content  - contenu texte
 */
export async function putTextFile(fullPath, content) {
  const client = getClient()
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'))
  await ensureDir(client, dir)
  await client.putFileContents(fullPath, content, { overwrite: true })
}
