import { Hono } from 'hono'
import { randomUUID } from 'crypto'
import { authMiddleware } from '../middleware/authMiddleware.js'
import sql from '../../db/db.js'
import { listInbox, downloadFile, uploadFile, deleteFile, moveFromInbox } from '../../packages/storage/index.js'

const inbox = new Hono()

const MIME = {
  md: 'text/markdown', markdown: 'text/markdown', pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif',
  svg: 'image/svg+xml', txt: 'text/plain',
}
function mimeForName(name) {
  const e = (name.split('.').pop() || '').toLowerCase()
  return MIME[e] || 'application/octet-stream'
}

const today = () => new Date().toISOString().slice(0, 10)

// Fichiers parasites macOS / système à ignorer dans un zip
function isJunkEntry(entryName) {
  const rel = entryName.replace(/\\/g, '/')
  const segs = rel.split('/').filter(Boolean)
  if (segs.some(s => s === '__MACOSX')) return true
  const base = segs[segs.length - 1] || ''
  return base === '.DS_Store' || base === 'Thumbs.db' || base.startsWith('._')
}

// Aplatit récursivement un .zip en liste de fichiers {path, data}.
// Les .zip imbriqués (export Notion = zip d'un zip « ExportBlock-…-Part-N.zip ») sont
// dépliés en place (sans préfixer leur propre nom) → l'arborescence interne réelle
// (et donc les liens d'images relatifs) est conservée. Parasites macOS ignorés.
function collectZipFiles(buffer, AdmZip, prefix = '') {
  const zip = new AdmZip(buffer)
  const out = []
  for (const e of zip.getEntries()) {
    if (e.isDirectory || isJunkEntry(e.entryName)) continue
    const rel = e.entryName.replace(/\\/g, '/')
    if (/\.zip$/i.test(rel)) {
      out.push(...collectZipFiles(e.getData(), AdmZip, prefix)) // déplier en place
    } else {
      out.push({ path: prefix ? `${prefix}/${rel}` : rel, data: e.getData() })
    }
  }
  return out
}

// Décompresse un bundle .zip (MD + images) dans uploads/{wsId}/{uuid}/ en préservant
// l'arborescence interne, puis crée un média markdown GÉRÉ (non externe) par fichier .md.
// Les images relatives sont alors résolues via /medias/:id/relfile (dossier réel du MD).
// Robuste : zips imbriqués dépliés, parasites macOS ignorés, l'échec d'un asset n'annule pas le doc.
async function importZipBundle({ wsId, inboxPath, file }) {
  const buffer = await downloadFile(inboxPath, file.filename)
  const { default: AdmZip } = await import('adm-zip')
  const files = collectZipFiles(buffer, AdmZip)
  const mdFiles = files.filter(f => /\.(md|markdown)$/i.test(f.path))
  if (!mdFiles.length) throw new Error('archive .zip sans fichier .md (après dépliage des zips imbriqués)')

  const bundleFolder = randomUUID()
  const destBase = `${process.env.WEBDAV_PATH_UPLOADS}/${wsId}/${bundleFolder}`

  const split = (p) => {
    const slash = p.lastIndexOf('/')
    return {
      dir:  slash >= 0 ? `${destBase}/${p.slice(0, slash)}` : destBase,
      name: slash >= 0 ? p.slice(slash + 1) : p,
    }
  }

  // Upload de toutes les entrées (structure interne conservée → images relatives intactes)
  const failed = []
  for (const f of files) {
    const { dir, name } = split(f.path)
    try {
      await uploadFile(dir, name, f.data, mimeForName(name))
    } catch (err) {
      failed.push(`${f.path} (${err.message})`)
    }
  }

  // Un média markdown par .md (chemin réel ⇒ images résolues relativement à son dossier)
  const out = []
  for (const md of mdFiles) {
    const { dir, name } = split(md.path)
    const fichier = `${dir}/${name}`
    const [media] = await sql`
      INSERT INTO jd_medias (workspace_id, fichier, nom_original, type_media, mime_type, taille, date_prise, lie)
      VALUES (${wsId}, ${fichier}, ${name}, 'markdown', 'text/markdown', ${md.data.length}, ${today()}, FALSE)
      RETURNING id`
    out.push({ original: file.filename, media_id: media.id, destName: name, ...(failed.length ? { warnings: failed } : {}) })
  }
  await deleteFile(inboxPath, file.filename)
  return out
}

inbox.use('/:wsId/*', authMiddleware)

async function wsCheck(c, next) {
  const userId = c.get('userId')
  const wsId = Number(c.req.param('wsId'))
  if (!wsId) return c.json({ error: 'Invalid workspace' }, 400)
  const [ok] = await sql`
    SELECT 1 FROM user_workspace_access WHERE user_id = ${userId} AND workspace_id = ${wsId}
  `
  if (!ok) return c.json({ error: 'Forbidden' }, 403)
  c.set('wsId', wsId)
  return next()
}

inbox.use('/:wsId/*', wsCheck)

inbox.get('/:wsId/inbox', async (c) => {
  const wsId = c.get('wsId')
  const files = await listInbox(`${process.env.WEBDAV_PATH_INBOX}/${wsId}`)
  return c.json({ files })
})

inbox.post('/:wsId/inbox/scan', async (c) => {
  const wsId  = c.get('wsId')
  const inboxPath = `${process.env.WEBDAV_PATH_INBOX}/${wsId}`
  const files = await listInbox(inboxPath)

  const integrated = []
  const errors = []

  for (const file of files) {
    try {
      const ext0 = file.filename.includes('.') ? file.filename.split('.').pop().toLowerCase() : ''

      // ── Bundle ZIP (MD + images) → décompressé dans uploads, média markdown géré ──
      if (ext0 === 'zip') {
        integrated.push(...await importZipBundle({ wsId, inboxPath, file }))
        continue
      }

      // ── Markdown autonome → uploads (média géré, éditable in-app) ──
      if (ext0 === 'md' || ext0 === 'markdown') {
        const destName = `${randomUUID()}.md`
        const destPath = `${process.env.WEBDAV_PATH_UPLOADS}/${wsId}`
        const fichier = await moveFromInbox(inboxPath, file.filename, destPath, destName)
        const [media] = await sql`
          INSERT INTO jd_medias (workspace_id, fichier, nom_original, type_media, mime_type, taille, date_prise, lie)
          VALUES (${wsId}, ${fichier}, ${file.filename}, 'markdown', 'text/markdown', ${file.size || 0}, ${today()}, FALSE)
          RETURNING id`
        integrated.push({ original: file.filename, media_id: media.id, destName })
        continue
      }

      let buffer = await downloadFile(inboxPath, file.filename)
      let mimetype = file.mime || 'application/octet-stream'
      const origExt = ext0 || 'bin'
      let outExt = origExt === 'heic' || origExt === 'heif' ? 'jpg' : origExt
      let typeMedia = mimetype.startsWith('image/') || ['jpg','jpeg','png','gif','webp','heic','heif','avif'].includes(origExt) ? 'photo' : 'pdf'
      let transformed = false

      // Extraction date EXIF avant traitement
      let datePrise = null
      try {
        const { default: ExifReader } = await import('exifreader')
        const tags = ExifReader.load(buffer, { expanded: false })
        const raw = (tags['DateTimeOriginal'] ?? tags['DateTime'])?.description
        if (raw && /^\d{4}:\d{2}:\d{2}/.test(raw)) datePrise = raw.slice(0, 10).replace(/:/g, '-')
      } catch { /* EXIF optionnel */ }
      if (!datePrise) datePrise = new Date().toISOString().slice(0, 10)

      // Traitement image
      if (typeMedia === 'photo') {
        const isHeic = origExt === 'heic' || origExt === 'heif'

        // 1. Conversion HEIC → JPEG via heic-convert (sharp ne supporte pas HEIC sur Vercel)
        if (isHeic) {
          try {
            const { default: heicConvert } = await import('heic-convert')
            buffer = Buffer.from(await heicConvert({ buffer, format: 'JPEG', quality: 0.85 }))
            mimetype = 'image/jpeg'; outExt = 'jpg'; transformed = true
          } catch (e) {
            console.error('[inbox] heic-convert failed:', e.message)
          }
        }

        // 2. Resize si nécessaire (fonctionne sur JPEG converti ou image native)
        try {
          const { default: sharp } = await import('sharp')
          const meta = await sharp(buffer).metadata()
          const needsResize = (meta.width ?? 0) > 1600 || (meta.height ?? 0) > 1600
          if (needsResize) {
            buffer = await sharp(buffer)
              .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 85 }).withMetadata().toBuffer()
            mimetype = 'image/jpeg'; outExt = 'jpg'; transformed = true
          }
        } catch { /* pas de resize si sharp indisponible */ }
      }

      const destName = `${randomUUID()}.${outExt}`
      const destPath = `${process.env.WEBDAV_PATH_UPLOADS}/${wsId}`
      let fichier
      if (transformed) {
        // Buffer modifié : upload du nouveau contenu + suppression de l'original
        fichier = await uploadFile(destPath, destName, buffer, mimetype)
        await deleteFile(inboxPath, file.filename)
      } else {
        // Pas de transformation : simple déplacement WebDAV
        fichier = await moveFromInbox(inboxPath, file.filename, destPath, destName)
      }

      const [media] = await sql`
        INSERT INTO jd_medias (workspace_id, fichier, nom_original, type_media, mime_type, taille, date_prise, lie)
        VALUES (${wsId}, ${fichier}, ${file.filename}, ${typeMedia}, ${mimetype}, ${buffer.length}, ${datePrise}, FALSE)
        RETURNING id
      `

      integrated.push({ original: file.filename, media_id: media.id, destName })
    } catch (err) {
      errors.push({ file: file.filename, error: err.message })
    }
  }

  return c.json({ integrated, errors, total: files.length })
})

export default inbox
