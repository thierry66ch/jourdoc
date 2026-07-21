// Export d'une LISTE FILTRÉE de notes (vue en l'état) → ZIP contenant un document
// AGRÉGÉ (une fiche après l'autre) en deux formats : Markdown (.md) et HTML imprimable
// (→ « Enregistrer en PDF » via le navigateur), plus un dossier medias/ (optionnel).
//
// Réutilise le manifeste serveur (POST /export/manifest avec des ids) : notes enrichies
// + médias référencés, sans binaires. Le navigateur télécharge les médias un par un
// (pas de cap serverless) et assemble le ZIP localement (fflate).

import { zip, strToU8 } from 'fflate'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'

const TYPE_LABEL = { journal: 'Journal', documentation: 'Documentation' }
const NATURE_LABEL = { observation: 'Observation', activite: 'Activité', mixte: 'Observ.→Activité' }
const IMG_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function slugify(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'note'
}

// Date de tri : documentation → date de création ; journal → date de référence.
function sortDate(n) {
  return n.type === 'documentation' ? (n.created_at || n.date || '') : (n.date || n.created_at || '')
}
// Date affichée dans la fiche (même règle).
function shownDate(n) {
  const d = sortDate(n)
  return d ? String(d).slice(0, 10) : ''
}

function sortNotes(notes, dir) {
  return [...notes].sort((a, b) => {
    const cmp = String(sortDate(a)).localeCompare(String(sortDate(b))) || (a.id - b.id)
    return dir === 'asc' ? cmp : -cmp
  })
}

// Réécrit les <img> média (URL proxy) du contenu vers les fichiers locaux du ZIP.
function rewriteImg(html, mediaById, prefix) {
  return String(html || '').replace(
    /\/api\/jourdoc\/\d+\/medias\/(\d+)\/file(?:\?[^"'\s)]*)?/g,
    (full, id) => { const m = mediaById.get(Number(id)); return m ? `${prefix}${m.filename}` : full },
  )
}

function metaLines(n, withLinks) {
  const meta = []
  meta.push(`Type : ${TYPE_LABEL[n.type] || n.type}${n.nature ? ` · ${NATURE_LABEL[n.nature] || n.nature}` : ''}`)
  const d = shownDate(n)
  if (d)               meta.push(`Date : ${d}`)
  if (n.categorie)     meta.push(`Catégorie : ${n.categorie}`)
  if (n.statut)        meta.push(`Statut : ${n.statut}`)
  if (n.doc_auteur)    meta.push(`Auteur : ${n.doc_auteur}`)
  if (n.doc_reference) meta.push(`Référence : ${n.doc_reference}`)
  if (n.objets?.length) meta.push(`Objets : ${n.objets.join(', ')}`)
  if (n.themes?.length) meta.push(`Thèmes : ${n.themes.join(', ')}`)
  if (n.elements?.length) meta.push(`Éléments : ${n.elements.join(', ')}`)
  if (n.source_url)    meta.push(`Source : ${n.source_url}`)
  if (withLinks && n.liens?.length)
    meta.push(`Notes liées : ${n.liens.map(l => `${l.titre || ('#' + l.id)}${l.type_lien ? ` (${l.type_lien})` : ''}`).join(', ')}`)
  return meta
}

// ── HTML imprimable (document unique) ────────────────────────
const STYLE = `*{box-sizing:border-box}
body{font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2430;max-width:840px;margin:0 auto;padding:1.5rem 1rem 4rem}
h1{font-size:1.7rem;margin:.2rem 0 .3rem}h2{font-size:1.3rem;margin:.2rem 0 .5rem}
.sub{color:#888;font-size:.85rem;margin-bottom:1.5rem}
.toc{margin:0 0 2rem;padding:0 0 1rem;border-bottom:2px solid #e3e5ec}
.toc ul{list-style:none;padding-left:0;margin:.3rem 0}.toc li{padding:.15rem 0}
.toc a{color:#4f46e5;text-decoration:none}.toc .d{color:#999;font-size:.8rem;margin-left:.4rem}
article{border-top:1px solid #e3e5ec;padding-top:1.4rem;margin-top:1.4rem}
.meta{background:#f1f2f6;border:1px solid #e3e5ec;border-radius:8px;padding:.6rem .85rem;font-size:.83rem;color:#555;margin:.4rem 0 1rem}
.contenu img{max-width:100%;height:auto;border-radius:6px}
.contenu blockquote{border-left:3px solid #6366f1;margin:.6rem 0;padding:.2rem 0 .2rem .85rem;color:#555}
.contenu table{border-collapse:collapse}.contenu td,.contenu th{border:1px solid #ccc;padding:.3rem .5rem}
.annexes{margin-top:1.2rem;border-top:1px dashed #ddd;padding-top:.8rem}
.annexes figure{margin:0 0 1rem}.annexes img{max-width:100%;height:auto;border-radius:6px}
.annexes figcaption{font-size:.8rem;color:#888;margin-top:.25rem}
@media print{body{max-width:none}article{break-before:page;border-top:none}.toc{break-after:page}a{color:#1f2430;text-decoration:none}}`

const attachIcon = t => t === 'pdf' ? '📄' : t === 'markdown' ? '📝' : '📎'

function articleHtml(n, mediaById, withAttachments) {
  const meta = metaLines(n, true) // en HTML on montre toujours les liens si demandés en amont
  // Toutes les pièces jointes sont listées : images en figures, le reste (PDF, .md…) en lien.
  const annexes = withAttachments ? (n.medias || []) : []
  const annexHtml = annexes.length ? `<section class="annexes"><h3>Annexes</h3>\n${
    annexes.map(m => IMG_EXT.test(m.filename)
      ? `<figure><img src="medias/${esc(m.filename)}" alt="${esc(m.nom_original || '')}"><figcaption>${esc(m.nom_original || m.filename)}</figcaption></figure>`
      : `<p><a href="medias/${esc(m.filename)}">${attachIcon(m.type_media)} ${esc(m.nom_original || m.filename)}</a></p>`,
    ).join('\n')}</section>` : ''
  return `<article id="note-${n.id}"><h2>${esc(n.titre || '(sans titre)')}</h2>
<div class="meta">${meta.map(esc).join('<br>')}</div>
<div class="contenu">${rewriteImg(n.contenu, mediaById, 'medias/')}</div>
${annexHtml}</article>`
}

function documentHtml({ wsName, notes, mediaById, opts, generatedAt }) {
  const toc = notes.map(n =>
    `<li><a href="#note-${n.id}">${esc(n.titre || '(sans titre)')}</a>${shownDate(n) ? `<span class="d">${esc(shownDate(n))}</span>` : ''}</li>`
  ).join('')
  const sub = `${notes.length} fiche(s) · tri ${opts.dir === 'asc' ? 'date ↑' : 'date ↓'}`
    + `${opts.withAttachments ? ' · pièces jointes' : ''}${opts.withLinks ? ' · notes liées' : ''}`
    + ` · généré le ${generatedAt.slice(0, 10)}`
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(wsName)} — liste exportée</title><style>${STYLE}</style></head>
<body><h1>${esc(wsName)} — liste exportée</h1><p class="sub">${esc(sub)}</p>
<nav class="toc"><ul>${toc}</ul></nav>
${notes.map(n => articleHtml(n, mediaById, opts.withAttachments)).join('\n')}
</body></html>`
}

// ── Markdown (document unique) ───────────────────────────────
function documentMarkdown({ wsName, notes, mediaById, opts, generatedAt }) {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' })
  td.use(gfm)
  const parts = []
  parts.push(`# ${wsName} — liste exportée`)
  parts.push(`> ${notes.length} fiche(s) · tri ${opts.dir === 'asc' ? 'date ↑' : 'date ↓'} · généré le ${generatedAt.slice(0, 10)}`)

  for (const n of notes) {
    const block = [`## ${n.titre || '(sans titre)'}`]
    block.push(metaLines(n, opts.withLinks).map(m => `> ${m}`).join('  \n'))
    const bodyHtml = rewriteImg(n.contenu, mediaById, 'medias/')
    const bodyMd = bodyHtml ? td.turndown(bodyHtml) : '_(vide)_'
    block.push(bodyMd)
    if (opts.withAttachments) {
      const annexes = (n.medias || [])
      if (annexes.length) {
        block.push('**Annexes :**')
        block.push(annexes.map(m => IMG_EXT.test(m.filename)
          ? `![${m.nom_original || ''}](medias/${m.filename})`
          : `- [${attachIcon(m.type_media)} ${m.nom_original || m.filename}](medias/${m.filename})`).join('\n'))
      }
    }
    parts.push(block.join('\n\n'))
  }
  return parts.join('\n\n---\n\n') + '\n'
}

// Télécharge les médias avec un petit pool de concurrence + progression par fichier.
async function downloadMedias({ wsId, token, medias, files, onProgress }) {
  const total = medias.length
  let done = 0, ok = 0
  const queue = [...medias]
  async function worker() {
    while (queue.length) {
      const m = queue.shift()
      try {
        // Token en query (?t=) : le proxy média l'accepte, et pas d'en-tête Content-Type
        // JSON parasite sur un GET binaire.
        const res = await fetch(`${API_ROUTES.JD_MEDIA_FILE(wsId, m.id)}?t=${encodeURIComponent(token)}`)
        if (res.ok) { files[`medias/${m.filename}`] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }]; ok++ }
      } catch { /* média manquant → ignoré */ }
      done++
      onProgress?.({ phase: 'download', done, total })
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, total || 1) }, worker))
  return ok
}

// Extrait les références d'images RELATIVES d'un markdown (syntaxe MD + <img>).
// Ignore http(s)/data/absolu — seuls les assets locaux (ex. _base.assets/img.png) comptent.
function extractRelRefs(md) {
  const refs = new Set()
  let m
  const reMd = /!\[[^\]]*\]\(\s*([^)\s]+)/g
  while ((m = reMd.exec(md))) refs.add(m[1])
  const reImg = /<img[^>]+src=["']([^"']+)["']/gi
  while ((m = reImg.exec(md))) refs.add(m[1])
  return [...refs].filter(u => u && !/^(https?:|data:|mailto:|#|\/)/i.test(u))
}

// Rapatrie les images internes des .md joints : télécharge le contenu de chaque .md,
// résout ses refs relatives via le proxy /relfile, et les place dans le ZIP au MÊME
// chemin relatif (à côté du .md dans medias/) → les liens du .md restent valides.
async function downloadMdAssets({ wsId, token, mdMedias, files }) {
  let ok = 0
  for (const m of mdMedias) {
    let content = ''
    try {
      const r = await fetch(`${API_ROUTES.JD_MEDIA_CONTENT(wsId, m.id)}?t=${encodeURIComponent(token)}`)
      if (!r.ok) continue
      content = (await r.json()).content || ''
    } catch { continue }
    for (const ref of extractRelRefs(content)) {
      const rel = decodeURIComponent(ref.split('#')[0].split('?')[0])  // cf. piège %20
      if (!rel) continue
      const key = `medias/${rel}`
      if (files[key]) continue  // déjà rapatrié
      try {
        const res = await fetch(`${API_ROUTES.JD_MEDIA_RELFILE(wsId, m.id)}?rel=${encodeURIComponent(rel)}&t=${encodeURIComponent(token)}`)
        if (res.ok) { files[key] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }]; ok++ }
      } catch { /* asset manquant → ignoré */ }
    }
  }
  return ok
}

function zipAsync(files) {
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (err, data) => err ? reject(err) : resolve(data))
  })
}

// Génère le ZIP de la liste filtrée.
// ids : identifiants des notes de la vue courante (dans l'ordre voulu ou non : on re-trie).
// opts : { dir: 'asc'|'desc', withAttachments: bool, withLinks: bool }
// onProgress({ phase, done, total }) : phase ∈ 'manifest' | 'download' | 'zip' | 'done'
export async function buildListExport({ wsId, token, ids, opts, onProgress }) {
  if (!ids?.length) throw new Error('Aucune note à exporter')
  onProgress?.({ phase: 'manifest' })
  const res = await fetch(API_ROUTES.JD_WS_EXPORT_MANIFEST_IDS(wsId), {
    method: 'POST',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error(`Manifeste (${res.status})`)
  const manifest = await res.json()

  const wsName = manifest.workspace.name
  const notes = sortNotes(manifest.notes, opts.dir)
  const mediaById = new Map(manifest.medias.map(m => [m.id, m]))
  const generatedAt = manifest.generatedAt

  const files = {}
  files['liste.html'] = strToU8(documentHtml({ wsName, notes, mediaById, opts, generatedAt }))
  files['liste.md']   = strToU8(documentMarkdown({ wsName, notes, mediaById, opts, generatedAt }))

  let mediaTotal = 0, mediaOk = 0
  if (opts.withAttachments) {
    // On ne télécharge que les médias effectivement référencés par les notes exportées.
    mediaTotal = manifest.medias.length
    mediaOk = await downloadMedias({ wsId, token, medias: manifest.medias, files, onProgress })
    // Images internes des .md joints → rapatriées à côté du .md dans le ZIP.
    const mdMedias = manifest.medias.filter(m => m.type_media === 'markdown')
    if (mdMedias.length) await downloadMdAssets({ wsId, token, mdMedias, files })
  }

  onProgress?.({ phase: 'zip' })
  const data = await zipAsync(files)
  const blob = new Blob([data], { type: 'application/zip' })
  const filename = `${manifest.workspace.slug}-liste-${generatedAt.slice(0, 10)}.zip`

  onProgress?.({ phase: 'done', count: notes.length, mediaOk, mediaTotal })
  return { blob, filename, count: notes.length, mediaOk, mediaTotal }
}
