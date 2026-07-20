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
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import sql from '../../db/db.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { putTextFile, deletePath } from '../../packages/storage/index.js'
import { extractArticle, extractMeta } from '../lib/clipper/readability.js'
import { htmlToMarkdown } from '../lib/clipper/turndown.js'
import { downloadAndReplaceImages } from '../lib/clipper/images.js'
import { fetchPage } from '../lib/clipper/fetchPage.js'
import { slugify, domainSlug } from '../lib/clipper/slug.js'

const clip = new Hono()

const MAX_HTML = 4 * 1024 * 1024 // 4 Mo (sous la limite de payload Vercel ~4,5 Mo)
const EXTDOCS = () => (process.env.WEBDAV_PATH_EXTDOCS || '').trim()
const extdocsRoot = (wsId) => `${EXTDOCS()}/${wsId}`
const today = () => new Date().toISOString().slice(0, 10)

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function frDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// En-tête de métadonnées en BLOC CITATION (cadre discret), pas en frontmatter YAML :
// Milkdown ne parse pas le YAML `---…---` → le `---` final crée un titre setext.
// Lignes séparées par un saut dur (deux espaces avant le \n) dans la même citation.
function buildMarkdown({ title, url, article, markdown }) {
  const meta = [`🔗 **Source :** <${url}>`]
  if (article.siteName) meta.push(`🌐 **Site :** ${article.siteName}`)
  if (article.byline)   meta.push(`✍️ **Auteur :** ${article.byline}`)
  meta.push(`🗓 **Capturé le :** ${frDate(today())}`)
  const quote = meta.map((l) => `> ${l}`).join('  \n')
  const body = markdown || article.textContent || ''
  return `# ${title}\n\n${quote}\n\n${body}\n`
}

// Cœur de capture partagé (bookmarklet ET capture serveur de lien) :
// HTML → markdown → rapatriement images → .md sur KDrive (EXTDOCS) → média markdown.
// Retourne { media (ligne complète), article, title, images } ou null si Readability
// n'extrait rien. Peut throw (erreur Readability ou upload) — géré par l'appelant.
async function captureToMd({ workspaceId, url, html, titleOverride }) {
  let article = await extractArticle(html, url)
  let partial = false
  let markdown

  if (article) {
    markdown = await htmlToMarkdown(article.content)
  } else {
    // Fallback : pas d'article exploitable → métadonnées (OG/meta/JSON-LD).
    const meta = await extractMeta(html, url)
    if (!meta.title && !meta.description) return null // vraiment rien à sauvegarder
    partial = true
    article = {
      title: meta.title || '', excerpt: meta.description || '', description: meta.description || '',
      siteName: meta.siteName || null, byline: null, textContent: meta.description || '',
    }
    markdown = [meta.description, meta.image ? `![](${meta.image})` : '']
      .filter(Boolean).join('\n\n')
  }

  const title = (titleOverride || article.title || 'Page web').trim()

  // Chemin EXTDOCS : clipper/{domaine}/{slug}.md (suffixe timestamp si collision)
  const slug = slugify(title)
  const dir = `${extdocsRoot(workspaceId)}/clipper/${domainSlug(url)}`
  let name = `${slug}.md`
  let full = `${dir}/${name}`
  const [clash] = await sql`SELECT id FROM jd_medias WHERE workspace_id = ${workspaceId} AND fichier = ${full}`
  if (clash) { name = `${slug}-${Date.now()}.md`; full = `${dir}/${name}` }

  // Rapatriement des images dans le dossier d'assets, à côté du .md (non bloquant).
  const base = name.replace(/\.md$/i, '')
  let images = { uploadedCount: 0, failedCount: 0 }
  try {
    const res = await downloadAndReplaceImages(markdown, `${dir}/_${base}.assets`, `_${base}.assets`)
    markdown = res.markdown
    images = res
  } catch (e) {
    console.error('[capture] images:', e?.message)
  }

  await putTextFile(full, buildMarkdown({ title, url, article, markdown }))

  const [media] = await sql`
    INSERT INTO jd_medias (workspace_id, fichier, nom_original, type_media, mime_type, externe, date_prise)
    VALUES (${workspaceId}, ${full}, ${name}, 'markdown', 'text/markdown', TRUE, ${today()})
    RETURNING *
  `
  return { media, article, title, partial, images: { uploaded: images.uploadedCount, failed: images.failedCount } }
}

// ── PUBLIC : mini-login intégré ──────────────────────────────
// Doit rester AVANT le authMiddleware. Même logique que /api/auth/login, mais sous
// /api/clip/* pour bénéficier du CORS tiers (l'overlay tourne sur des pages tierces).
clip.post('/login', async (c) => {
  const { identifier, password } = await c.req.json().catch(() => ({}))
  if (!identifier || !password) return c.json({ error: 'Identifiants requis' }, 400)
  const [user] = await sql`
    SELECT * FROM users WHERE (email = ${identifier} OR username = ${identifier}) AND is_active = TRUE
  `
  if (!user) return c.json({ error: 'Identifiants invalides' }, 401)
  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return c.json({ error: 'Identifiants invalides' }, 401)
  const token = jwt.sign(
    { sub: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
  )
  return c.json({ token })
})

// ── PROTÉGÉ ──────────────────────────────────────────────────
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

// Taxonomie d'un workspace pour la classification (objets, thèmes, doc-catégories).
clip.get('/ws/:wsId/taxonomy', async (c) => {
  const userId = c.get('userId')
  const wsId = Number(c.req.param('wsId'))
  const [ok] = await sql`SELECT 1 FROM user_workspace_access WHERE user_id = ${userId} AND workspace_id = ${wsId}`
  if (!ok) return c.json({ error: 'Forbidden' }, 403)

  const [objets, themes, docCategories] = await Promise.all([
    sql`SELECT id, nom, nom_court, parent_id FROM jd_objets WHERE workspace_id = ${wsId} ORDER BY nom`,
    sql`SELECT id, nom, nom_court, parent_id FROM jd_themes WHERE workspace_id = ${wsId} ORDER BY nom`,
    sql`SELECT id, nom, icon, couleur FROM jd_doc_categorie WHERE workspace_id = ${wsId} ORDER BY ordre, nom`,
  ])
  return c.json({ objets, themes, docCategories })
})

// Notes déjà clippées avec la même URL source dans ce workspace (avertissement).
clip.get('/ws/:wsId/exists', async (c) => {
  const userId = c.get('userId')
  const wsId = Number(c.req.param('wsId'))
  const url = c.req.query('url')
  if (!url) return c.json({ existing: [] })
  const [ok] = await sql`SELECT 1 FROM user_workspace_access WHERE user_id = ${userId} AND workspace_id = ${wsId}`
  if (!ok) return c.json({ error: 'Forbidden' }, 403)
  const existing = await sql`
    SELECT id, titre, date FROM jd_notes
    WHERE workspace_id = ${wsId} AND source_url = ${url}
    ORDER BY created_at DESC
  `
  return c.json({ existing: existing.map((n) => ({ ...n, date: n.date ? String(n.date).slice(0, 10) : null })) })
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
    return c.json({ error: 'HTML absent ou trop volumineux (max 4 Mo)' }, 413)
  }

  // Accès workspace
  const [ok] = await sql`
    SELECT 1 FROM user_workspace_access WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
  `
  if (!ok) return c.json({ error: 'Forbidden' }, 403)

  // Extraction + .md + images + média (cœur partagé)
  let cap
  try {
    cap = await captureToMd({ workspaceId, url, html, titleOverride: body.title })
  } catch (e) {
    console.error('[clip] capture:', e?.stack || e?.message) // détail en logs serveur uniquement
    return c.json({ error: 'Extraction échouée' }, 500)
  }
  if (!cap) return c.json({ error: 'Contenu illisible (Readability)' }, 422)

  const { media, article, title, images } = cap
  const mediaId = media.id

  // Note documentation
  const theme_ids   = Array.isArray(body.theme_ids) ? body.theme_ids : []
  const objet_ids   = Array.isArray(body.objet_ids) ? body.objet_ids : []
  const element_ids = Array.isArray(body.element_ids) ? body.element_ids : []
  const docCategorieId = body.doc_categorie_id ?? null
  // Body de la note : description de la page en bloc citation (en-tête).
  const desc = article.description || article.excerpt || ''
  const contenu = desc ? `<blockquote><p>${escapeHtml(desc)}</p></blockquote>` : null

  const titreAlt = (body.titre_alt || '').trim() || null
  const [note] = await sql`
    INSERT INTO jd_notes (workspace_id, type, theme_id, doc_categorie_id, titre, titre_alt, contenu, date, source_url)
    VALUES (${workspaceId}, 'documentation', ${theme_ids[0] ?? null}, ${docCategorieId}, ${title}, ${titreAlt}, ${contenu}, ${today()}, ${url})
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
    images,
    partial: cap.partial,
  }, 201)
})

// Annuler une capture fraîchement créée : supprime la note ET le(s) .md clipper
// joint(s) + leur dossier d'assets sur KDrive (contrairement à la suppression normale
// d'un média « externe » qui préserve les fichiers). Réservé aux médias sous /clipper/
// pour ne jamais toucher un document lié par l'utilisateur.
clip.delete('/ws/:wsId/note/:noteId', async (c) => {
  const userId = c.get('userId')
  const workspaceId = Number(c.req.param('wsId'))
  const noteId = Number(c.req.param('noteId'))

  const [ok] = await sql`SELECT 1 FROM user_workspace_access WHERE user_id = ${userId} AND workspace_id = ${workspaceId}`
  if (!ok) return c.json({ error: 'Forbidden' }, 403)

  const [note] = await sql`SELECT id FROM jd_notes WHERE id = ${noteId} AND workspace_id = ${workspaceId}`
  if (!note) return c.json({ error: 'Not found' }, 404)

  // Médias markdown liés à la note (candidats à suppression physique).
  const medias = await sql`
    SELECT m.id, m.fichier FROM jd_note_media nm JOIN jd_medias m ON m.id = nm.media_id
    WHERE nm.note_id = ${noteId} AND m.workspace_id = ${workspaceId} AND m.type_media = 'markdown'
  `

  // Supprime la note d'abord (le cascade FK retire les liaisons jd_note_media…).
  await sql`DELETE FROM jd_notes WHERE id = ${noteId} AND workspace_id = ${workspaceId}`

  // Puis nettoie les .md clipper devenus orphelins (fichier + dossier d'assets).
  for (const m of medias) {
    if (!m.fichier || !m.fichier.includes('/clipper/')) continue
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM jd_note_media WHERE media_id = ${m.id}`
    if (n > 0) continue // encore lié à une autre note → on préserve
    try { await deletePath(m.fichier) } catch (e) { console.error('[clip-undo] md:', e?.message) }
    const lastSlash = m.fichier.lastIndexOf('/')
    const dir = m.fichier.slice(0, lastSlash)
    const base = m.fichier.slice(lastSlash + 1).replace(/\.md$/i, '')
    try { await deletePath(`${dir}/_${base}.assets`) } catch { /* pas d'assets */ }
    await sql`DELETE FROM jd_medias WHERE id = ${m.id}`
  }

  return c.json({ ok: true })
})

// Capture serveur d'un LIEN (bouton « Capturer » de la fiche, future cible de partage).
// Télécharge l'URL côté serveur (HTML brut, sans JS), extrait, crée le .md média.
// Ne crée PAS de note : retourne le média à attacher (la fiche gère la liaison).
clip.post('/ws/:wsId/capture-url', async (c) => {
  const userId = c.get('userId')
  if (!EXTDOCS()) return c.json({ error: 'EXTDOCS non configuré' }, 400)
  const workspaceId = Number(c.req.param('wsId'))
  const [ok] = await sql`SELECT 1 FROM user_workspace_access WHERE user_id = ${userId} AND workspace_id = ${workspaceId}`
  if (!ok) return c.json({ error: 'Forbidden' }, 403)

  const { url } = await c.req.json().catch(() => ({}))
  if (!url) return c.json({ error: 'URL requise' }, 400)

  let page
  try {
    page = await fetchPage(url)
  } catch (e) {
    return c.json({ error: `Téléchargement impossible : ${e.message}` }, 422)
  }

  let cap
  try {
    cap = await captureToMd({ workspaceId, url: page.finalUrl, html: page.html })
  } catch (e) {
    console.error('[capture-url] capture:', e?.stack || e?.message)
    return c.json({ error: 'Extraction échouée' }, 500)
  }
  if (!cap) return c.json({ error: 'Page sans article exploitable (souvent une page rendue en JavaScript).' }, 422)

  const m = cap.media
  return c.json({
    media: { ...m, date_prise: m.date_prise ? String(m.date_prise).slice(0, 10) : null },
    title: cap.title,
    excerpt: cap.article.excerpt,
    description: cap.article.description || cap.article.excerpt || '',
    images: cap.images,
    partial: cap.partial,
  })
})

export default clip
