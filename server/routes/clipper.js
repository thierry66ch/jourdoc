// server/routes/clipper.js — endpoint du web-clipper.
//
// Monté sur /api/clip (cf. app.js). Tout ce que l'overlay appelle depuis une page
// TIERCE vit sous /api/clip/* pour bénéficier du CORS permissif (le CORS global de
// app.js réfléchit l'origine pour ce préfixe ; il bloque les autres routes).
//
// Conventions alignées sur les routes EXTDOCS existantes (jourdoc.js) :
//   .md + assets sous WEBDAV_PATH_EXTDOCS/{wsId}/clipper/{domaine}/, média externe
//   type_media='markdown', note type='documentation'. Cf. docs/dev/clipper.md.

import { Hono } from 'hono'
import sql from '../../db/db.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { putTextFile } from '../../packages/storage/index.js'
import { extractArticle } from '../lib/clipper/readability.js'
import { htmlToMarkdown } from '../lib/clipper/turndown.js'
import { slugify, domainSlug } from '../lib/clipper/slug.js'

const clip = new Hono()

const MAX_HTML = 4 * 1024 * 1024 // 4 Mo (sous la limite de payload Vercel ~4,5 Mo)
const EXTDOCS = () => (process.env.WEBDAV_PATH_EXTDOCS || '').trim()
const extdocsRoot = (wsId) => `${EXTDOCS()}/${wsId}`
const today = () => new Date().toISOString().slice(0, 10)

function yaml(v) {
  return `"${String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildMarkdown({ title, url, article, markdown }) {
  const fm = ['---', `title: ${yaml(title)}`, `source: ${yaml(url)}`]
  if (article.byline)   fm.push(`author: ${yaml(article.byline)}`)
  if (article.siteName) fm.push(`site: ${yaml(article.siteName)}`)
  fm.push(`clipped: ${yaml(today())}`, '---', '')
  const body = markdown || article.textContent || ''
  return `${fm.join('\n')}\n# ${title}\n\n${body}\n`
}

clip.use('*', authMiddleware)

// Liste des workspaces JourDoc accessibles (pour l'étape 1 de l'overlay).
clip.get('/workspaces', async (c) => {
  const userId = c.get('userId')
  const workspaces = await sql`
    SELECT w.id, w.name
    FROM workspaces w
    JOIN user_workspace_access uwa ON uwa.workspace_id = w.id
    JOIN apps a ON a.id = w.app_id
    WHERE uwa.user_id = ${userId} AND a.slug = 'jourdoc'
    ORDER BY w.name
  `
  return c.json({ workspaces })
})

// Capture : extrait → markdown → upload EXTDOCS → note documentation + liaison.
clip.post('/', async (c) => {
  const userId = c.get('userId')
  if (!EXTDOCS()) return c.json({ error: 'EXTDOCS non configuré' }, 400)

  let body
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide' }, 400) }

  const { url, html } = body
  const workspaceId = Number(body.workspaceId)
  if (!url || !html || !workspaceId) {
    return c.json({ error: 'url, html, workspaceId requis' }, 400)
  }
  if (typeof html !== 'string' || html.length > MAX_HTML) {
    return c.json({ error: 'HTML absent ou trop volumineux (max 3 Mo)' }, 413)
  }

  // Accès workspace
  const [ok] = await sql`
    SELECT 1 FROM user_workspace_access WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
  `
  if (!ok) return c.json({ error: 'Forbidden' }, 403)

  // Extraction Readability
  let article
  try {
    article = await extractArticle(html, url)
  } catch (e) {
    console.error('[clip] readability:', e?.stack || e?.message)
    return c.json({ error: 'Extraction échouée', detail: String(e?.message || e).slice(0, 300) }, 500)
  }
  if (!article) return c.json({ error: 'Contenu illisible (Readability)' }, 422)

  const title = (body.title || article.title || 'Page web').trim()
  const markdown = await htmlToMarkdown(article.content)
  const fullMd = buildMarkdown({ title, url, article, markdown })

  // Chemin EXTDOCS : clipper/{domaine}/{slug}.md (suffixe timestamp si collision)
  const slug = slugify(title)
  const dir = `${extdocsRoot(workspaceId)}/clipper/${domainSlug(url)}`
  let name = `${slug}.md`
  let full = `${dir}/${name}`
  const [clash] = await sql`SELECT id FROM jd_medias WHERE workspace_id = ${workspaceId} AND fichier = ${full}`
  if (clash) { name = `${slug}-${Date.now()}.md`; full = `${dir}/${name}` }

  try {
    await putTextFile(full, fullMd)
  } catch (e) {
    console.error('[clip] putTextFile:', e?.message)
    return c.json({ error: 'Upload KDrive échoué' }, 500)
  }

  // Média markdown externe
  const [media] = await sql`
    INSERT INTO jd_medias (workspace_id, fichier, nom_original, type_media, mime_type, externe, date_prise)
    VALUES (${workspaceId}, ${full}, ${name}, 'markdown', 'text/markdown', TRUE, ${today()})
    RETURNING id
  `
  const mediaId = media.id

  // Note documentation
  const theme_ids   = Array.isArray(body.theme_ids) ? body.theme_ids : []
  const objet_ids   = Array.isArray(body.objet_ids) ? body.objet_ids : []
  const element_ids = Array.isArray(body.element_ids) ? body.element_ids : []
  const docCategorieId = body.doc_categorie_id ?? null
  const contenu = article.excerpt ? `<p>${escapeHtml(article.excerpt)}</p>` : null

  const [note] = await sql`
    INSERT INTO jd_notes (workspace_id, type, theme_id, doc_categorie_id, titre, contenu, date, source_url)
    VALUES (${workspaceId}, 'documentation', ${theme_ids[0] ?? null}, ${docCategorieId}, ${title}, ${contenu}, ${today()}, ${url})
    RETURNING id
  `
  const noteId = note.id

  for (const t of theme_ids)   await sql`INSERT INTO jd_note_theme   (note_id, theme_id)   VALUES (${noteId}, ${t})  ON CONFLICT DO NOTHING`
  for (const o of objet_ids)   await sql`INSERT INTO jd_note_objet   (note_id, objet_id)   VALUES (${noteId}, ${o})  ON CONFLICT DO NOTHING`
  for (const el of element_ids) await sql`INSERT INTO jd_note_element (note_id, element_id) VALUES (${noteId}, ${el}) ON CONFLICT DO NOTHING`
  await sql`INSERT INTO jd_note_media (note_id, media_id) VALUES (${noteId}, ${mediaId}) ON CONFLICT DO NOTHING`
  await sql`UPDATE jd_medias SET lie = TRUE WHERE id = ${mediaId}`

  return c.json({
    noteId,
    mediaId,
    title,
    noteUrl: `/jourdoc/${workspaceId}/notes/${noteId}`,
  }, 201)
})

export default clip
