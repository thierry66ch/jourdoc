import { Hono } from 'hono'
import { randomUUID } from 'crypto'
import { authMiddleware } from '../middleware/authMiddleware.js'
import sql from '../../db/db.js'
import { listInbox, downloadFile, moveFromInbox } from '../../packages/storage/index.js'

const inbox = new Hono()

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
  const files = await listInbox(process.env.WEBDAV_PATH_INBOX)
  return c.json({ files })
})

inbox.post('/:wsId/inbox/scan', async (c) => {
  const wsId  = c.get('wsId')
  const files = await listInbox(process.env.WEBDAV_PATH_INBOX)

  const integrated = []
  const errors = []

  for (const file of files) {
    try {
      let buffer = await downloadFile(process.env.WEBDAV_PATH_INBOX, file.filename)
      let mimetype = file.mime || 'application/octet-stream'
      const origExt = file.filename.includes('.') ? file.filename.split('.').pop().toLowerCase() : 'bin'
      let outExt = origExt === 'heic' || origExt === 'heif' ? 'jpg' : origExt
      let typeMedia = mimetype.startsWith('image/') || ['jpg','jpeg','png','gif','webp','heic','heif','avif'].includes(origExt) ? 'photo' : 'pdf'

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
        try {
          const { default: sharp } = await import('sharp')
          const meta = await sharp(buffer).metadata()
          const needsResize = (meta.width ?? 0) > 1600 || (meta.height ?? 0) > 1600
          if (needsResize || origExt === 'heic' || origExt === 'heif') {
            const pipeline = sharp(buffer)
            if (needsResize) pipeline.resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
            buffer = await pipeline.jpeg({ quality: 85 }).withMetadata().toBuffer()
            mimetype = 'image/jpeg'; outExt = 'jpg'
          }
        } catch { /* conserver buffer original si sharp échoue */ }
      }

      const destName = `${randomUUID()}.${outExt}`
      const fichier = await moveFromInbox(
        process.env.WEBDAV_PATH_INBOX,
        file.filename,
        process.env.WEBDAV_PATH_UPLOADS,
        destName
      )

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
