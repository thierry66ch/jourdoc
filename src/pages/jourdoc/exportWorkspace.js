// Export workspace « complet » généré côté navigateur.
// Le serveur ne renvoie qu'un manifeste léger ; le navigateur télécharge les
// médias un par un (petites requêtes → pas de cap serverless) et assemble le
// ZIP localement avec fflate, en exposant une vraie progression par fichier.

import { zip, strToU8 } from 'fflate'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'

const TYPE_LABEL = { journal: 'Journal', documentation: 'Documentation' }
const IMG_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function slugify(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'note'
}

const noteFile = n => `notes/${n.id}-${slugify(n.titre)}.html`

// Réécrit les <img> média (URL proxy) du contenu vers les fichiers locaux du ZIP.
function rewriteContenu(html, mediaById) {
  return String(html || '').replace(
    /\/api\/jourdoc\/\d+\/medias\/(\d+)\/file(?:\?[^"'\s)]*)?/g,
    (full, id) => { const m = mediaById.get(Number(id)); return m ? `../medias/${m.filename}` : full },
  )
}

const STYLE = `*{box-sizing:border-box}body{font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif;
color:#1f2430;background:#fafafa;max-width:840px;margin:0 auto;padding:1.5rem 1rem 4rem}
a{color:#4f46e5}nav{margin-bottom:1rem;font-size:.85rem}h1{font-size:1.6rem;margin:.2rem 0 .6rem}
.meta{background:#f1f2f6;border:1px solid #e3e5ec;border-radius:8px;padding:.7rem .9rem;font-size:.85rem;color:#555;margin-bottom:1.2rem}
.contenu img{max-width:100%;height:auto;border-radius:6px}
.contenu blockquote{border-left:3px solid #6366f1;margin:.6rem 0;padding:.2rem 0 .2rem .85rem;color:#555}
.contenu table{border-collapse:collapse}.contenu td,.contenu th{border:1px solid #ccc;padding:.3rem .5rem}
.annexes{margin-top:2rem;border-top:1px solid #ddd;padding-top:1rem}
.annexes figure{margin:0 0 1rem}.annexes img{max-width:100%;height:auto;border-radius:6px}
.annexes figcaption{font-size:.8rem;color:#888;margin-top:.25rem}
.toc h2{font-size:1.05rem;margin:1.4rem 0 .4rem;border-bottom:1px solid #e3e5ec;padding-bottom:.2rem}
.toc ul{list-style:none;padding-left:0;margin:.3rem 0}.toc li{padding:.15rem 0}
.toc .d{color:#999;font-size:.8rem;margin-left:.4rem}.muted{color:#888;font-size:.85rem}`

function noteHtml(n, mediaById, wsName) {
  const meta = []
  meta.push(`<b>Type</b> : ${esc(TYPE_LABEL[n.type] || n.type)}${n.nature ? ` · ${esc(n.nature)}` : ''}`)
  if (n.date)          meta.push(`<b>Date</b> : ${esc(n.date)}`)
  if (n.categorie)     meta.push(`<b>Catégorie</b> : ${esc(n.categorie)}`)
  if (n.statut)        meta.push(`<b>Statut</b> : ${esc(n.statut)}`)
  if (n.doc_auteur)    meta.push(`<b>Auteur</b> : ${esc(n.doc_auteur)}`)
  if (n.doc_reference) meta.push(`<b>Référence</b> : ${esc(n.doc_reference)}`)
  if (n.objets?.length)   meta.push(`<b>Objets</b> : ${esc(n.objets.join(', '))}`)
  if (n.themes?.length)   meta.push(`<b>Thèmes</b> : ${esc(n.themes.join(', '))}`)
  if (n.elements?.length) meta.push(`<b>Éléments</b> : ${esc(n.elements.join(', '))}`)
  if (n.source_url)    meta.push(`<b>Source</b> : <a href="${esc(n.source_url)}">${esc(n.source_url)}</a>`)
  if (n.liens?.length) meta.push(`<b>Liens</b> : ${n.liens.map(l =>
    esc(`${l.titre || ('#' + l.id)}${l.type_lien ? ` (${l.type_lien})` : ''}`)).join(', ')}`)

  const annexes = (n.medias || []).filter(m => m.type_media !== 'markdown')
  const annexHtml = annexes.length ? `<section class="annexes"><h3>Annexes</h3>\n${
    annexes.map(m => IMG_EXT.test(m.filename)
      ? `<figure><img src="../medias/${esc(m.filename)}" alt="${esc(m.nom_original || '')}"><figcaption>${esc(m.nom_original || m.filename)}</figcaption></figure>`
      : `<p><a href="../medias/${esc(m.filename)}">📎 ${esc(m.nom_original || m.filename)}</a></p>`,
    ).join('\n')}</section>` : ''

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(n.titre || '(sans titre)')} — ${esc(wsName)}</title>
<link rel="stylesheet" href="../style.css"></head>
<body><nav><a href="../index.html">← Sommaire</a></nav>
<article><h1>${esc(n.titre || '(sans titre)')}</h1>
<div class="meta">${meta.join('<br>')}</div>
<div class="contenu">${rewriteContenu(n.contenu, mediaById)}</div>
${annexHtml}</article></body></html>`
}

function indexHtml(manifest) {
  const { workspace, filter, notes, generatedAt } = manifest
  const wsName = workspace.name
  const link = n => `<li><a href="${noteFile(n)}">${esc(n.titre || '(sans titre)')}</a>${n.date ? `<span class="d">${esc(n.date)}</span>` : ''}</li>`

  const journal = notes.filter(n => n.type === 'journal')
  const docs    = notes.filter(n => n.type === 'documentation')
  const sections = []

  if (journal.length) {
    const byYear = new Map()
    for (const n of journal) {
      const y = (n.date || '').slice(0, 4) || '(sans date)'
      if (!byYear.has(y)) byYear.set(y, [])
      byYear.get(y).push(n)
    }
    const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a))
    sections.push(`<h2>Journal</h2>${years.map(y =>
      `<h3>${esc(y)}</h3><ul>${byYear.get(y).map(link).join('')}</ul>`).join('')}`)
  }
  if (docs.length) {
    const byCat = new Map()
    for (const n of docs) {
      const k = n.categorie || '(sans catégorie)'
      if (!byCat.has(k)) byCat.set(k, [])
      byCat.get(k).push(n)
    }
    const cats = [...byCat.keys()].sort((a, b) => a.localeCompare(b))
    sections.push(`<h2>Documentation</h2>${cats.map(k =>
      `<h3>${esc(k)}</h3><ul>${byCat.get(k).map(link).join('')}</ul>`).join('')}`)
  }

  const scope = filter.type === 'all' ? 'tout le contenu'
    : `${TYPE_LABEL[filter.type] || filter.type}${filter.year ? ` — ${filter.year}` : ''}`

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(wsName)} — export</title><link rel="stylesheet" href="style.css"></head>
<body><h1>${esc(wsName)}</h1>
<p class="muted">Export ${esc(scope)} · ${notes.length} note(s) · généré le ${esc(generatedAt.slice(0, 10))}</p>
<div class="toc">${sections.join('\n') || '<p class="muted">Aucune note.</p>'}</div></body></html>`
}

// Télécharge les médias avec un petit pool de concurrence et une progression par fichier.
async function downloadMedias({ wsId, token, medias, files, onProgress }) {
  const total = medias.length
  let done = 0
  const queue = [...medias]
  async function worker() {
    while (queue.length) {
      const m = queue.shift()
      try {
        const res = await fetch(API_ROUTES.JD_MEDIA_FILE(wsId, m.id), { headers: authHeader(token) })
        if (res.ok) files[`medias/${m.filename}`] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }]
      } catch { /* média manquant → ignoré */ }
      done++
      onProgress?.({ phase: 'download', done, total })
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, total || 1) }, worker))
}

function zipAsync(files) {
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (err, data) => err ? reject(err) : resolve(data))
  })
}

// Génère le ZIP complet. onProgress({ phase, done, total }) :
//   phase ∈ 'manifest' | 'download' | 'zip' | 'done'
export async function buildWorkspaceExport({ wsId, token, type = 'all', year = '', onProgress }) {
  onProgress?.({ phase: 'manifest' })
  const res = await fetch(API_ROUTES.JD_WS_EXPORT_MANIFEST(wsId, type, year), { headers: authHeader(token) })
  if (!res.ok) throw new Error(`Manifeste (${res.status})`)
  const manifest = await res.json()

  const mediaById = new Map(manifest.medias.map(m => [m.id, m]))
  const wsName = manifest.workspace.name

  const files = {}
  files['index.html'] = strToU8(indexHtml(manifest))
  files['style.css']  = strToU8(STYLE)
  files['data.json']  = strToU8(JSON.stringify(manifest, null, 2))
  for (const n of manifest.notes) files[noteFile(n)] = strToU8(noteHtml(n, mediaById, wsName))

  await downloadMedias({ wsId, token, medias: manifest.medias, files, onProgress })

  onProgress?.({ phase: 'zip' })
  const data = await zipAsync(files)
  const blob = new Blob([data], { type: 'application/zip' })

  const date = manifest.generatedAt.slice(0, 10)
  const scope = type === 'all' ? 'complet' : `${type}${year ? `-${year}` : ''}`
  const filename = `${manifest.workspace.slug}-${scope}-${date}.zip`

  onProgress?.({ phase: 'done', count: manifest.notes.length })
  return { blob, filename, count: manifest.notes.length }
}
