// server/lib/clipper/images.js — rapatriement des images d'un clip sur KDrive.
//
// Repère les images du Markdown (`![alt](url)`), les télécharge (URLs absolues ou
// data: URIs), les upload dans le dossier d'assets du document (`_<base>.assets/`,
// convention partagée avec medias/:id/asset) et réécrit les chemins en relatif.
// Échec (timeout, 404, non-image, trop gros) → URL d'origine conservée.

import { uploadFile } from '../../../packages/storage/index.js'

const TIMEOUT_MS = 8000
const MAX_BYTES = 8 * 1024 * 1024

const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'image/bmp': 'bmp',
}

// ![alt](url) ou ![alt](<url> "titre") — capture alt (1) et url (2).
const IMG_RE = /!\[([^\]]*)\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)/g

function extFromUrl(u) {
  try {
    const e = (new URL(u).pathname.split('.').pop() || '').toLowerCase()
    if (/^(jpe?g|png|gif|webp|avif|svg|bmp)$/.test(e)) return e === 'jpeg' ? 'jpg' : e
  } catch { /* ignore */ }
  return null
}
function pickExt(mime, u) {
  return MIME_EXT[mime] || extFromUrl(u) || 'jpg'
}

async function fetchImage(u) {
  if (/^data:image\//i.test(u)) {
    const m = u.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i)
    if (!m) throw new Error('data uri illisible')
    const mime = m[1].toLowerCase()
    const buffer = Buffer.from(m[2], 'base64')
    if (!buffer.length || buffer.length > MAX_BYTES) throw new Error('taille')
    return { buffer, mime }
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(u, { signal: ctrl.signal, redirect: 'follow' })
    if (!res.ok) throw new Error(`http ${res.status}`)
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (ct && !ct.startsWith('image/')) throw new Error(`non-image (${ct})`)
    const buffer = Buffer.from(await res.arrayBuffer())
    if (!buffer.length || buffer.length > MAX_BYTES) throw new Error('taille')
    return { buffer, mime: ct || 'application/octet-stream' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Télécharge et réécrit les images du markdown.
 * @param {string} markdown   corps markdown (images en URLs absolues / data:)
 * @param {string} assetDir   chemin WebDAV du dossier d'assets (`…/_base.assets`)
 * @param {string} relPrefix  préfixe relatif inséré dans le .md (`_base.assets`)
 * @returns {Promise<{markdown, uploadedCount, failedCount}>}
 */
export async function downloadAndReplaceImages(markdown, assetDir, relPrefix) {
  const urls = []
  const seen = new Set()
  for (const m of markdown.matchAll(IMG_RE)) {
    const u = m[2]
    if (!u || seen.has(u)) continue
    if (!/^https?:\/\//i.test(u) && !/^data:image\//i.test(u)) continue // déjà relatif
    seen.add(u); urls.push(u)
  }
  if (urls.length === 0) return { markdown, uploadedCount: 0, failedCount: 0 }

  const map = new Map() // url d'origine → chemin relatif
  const results = await Promise.allSettled(urls.map(async (u, i) => {
    const { buffer, mime } = await fetchImage(u)
    const filename = `img-${String(i + 1).padStart(3, '0')}.${pickExt(mime, u)}`
    await uploadFile(assetDir, filename, buffer, mime)
    map.set(u, `${relPrefix}/${filename}`)
  }))
  const failedCount = results.filter((r) => r.status === 'rejected').length

  const out = markdown.replace(IMG_RE, (full, alt, url) => {
    const rel = map.get(url)
    return rel ? `![${alt}](${rel})` : full
  })
  return { markdown: out, uploadedCount: map.size, failedCount }
}
