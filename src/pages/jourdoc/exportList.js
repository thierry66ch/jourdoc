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
.toc-sec{font-weight:700;margin-top:.6rem;color:#333;list-style:none}
h2.sec{font-size:1.15rem;margin:1.8rem 0 .4rem;padding-bottom:.2rem;border-bottom:2px solid #e3e5ec;color:#4f46e5}
article h3{font-size:1.25rem;margin:.2rem 0 .5rem}
article{border-top:1px solid #e3e5ec;padding-top:1.4rem;margin-top:1.4rem}
.meta{background:#f1f2f6;border:1px solid #e3e5ec;border-radius:8px;padding:.6rem .85rem;font-size:.83rem;color:#555;margin:.4rem 0 1rem}
.contenu img{max-width:100%;height:auto;border-radius:6px}
.contenu blockquote{border-left:3px solid #6366f1;margin:.6rem 0;padding:.2rem 0 .2rem .85rem;color:#555}
.contenu table{border-collapse:collapse}.contenu td,.contenu th{border:1px solid #ccc;padding:.3rem .5rem}
.annexes{margin-top:1.2rem;border-top:1px dashed #ddd;padding-top:.8rem}
.annexes figure{margin:0 0 1rem}.annexes img{max-width:100%;height:auto;border-radius:6px}
.annexes figcaption{font-size:.8rem;color:#888;margin-top:.25rem}
table.donnees{border-collapse:collapse;margin:.2rem 0 1rem;font-size:.9rem;width:100%}
table.donnees th,table.donnees td{border:1px solid #ddd;padding:.35rem .6rem;text-align:left;vertical-align:top}
table.donnees th{width:35%;background:#f7f7fa;font-weight:600;color:#555}
@media print{body{max-width:none}h2.sec{break-before:page}article{break-inside:avoid;border-top:none}.toc{break-after:page}a{color:#1f2430;text-decoration:none}}`

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
  // Données étendues : avant le corps (données structurées d'abord, comme en fiche).
  const donneesHtml = (n.donnees ?? []).length
    ? `<table class="donnees">${(n.donnees).map(([l, v]) =>
        `<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`
    : ''

  return `<article id="note-${n.id}"><h3>${esc(n.titre || '(sans titre)')}</h3>
<div class="meta">${meta.map(esc).join('<br>')}</div>
${donneesHtml}
<div class="contenu">${rewriteImg(n.contenu, mediaById, 'medias/')}</div>
${annexHtml}</article>`
}

// secs : [{ titre, notes }] — les intertitres (null = pas de section nommée) reflètent
// l'affichage (catégories, sous-groupes de la Bibliothèque).
function documentHtml({ wsName, secs, mediaById, sub }) {
  const total = secs.reduce((s, x) => s + x.notes.length, 0)
  const toc = secs.map(sec => {
    const items = sec.notes.map(n =>
      `<li><a href="#note-${n.id}">${esc(n.titre || '(sans titre)')}</a>${shownDate(n) ? `<span class="d">${esc(shownDate(n))}</span>` : ''}</li>`
    ).join('')
    return sec.titre ? `<li class="toc-sec">${esc(sec.titre)}</li>${items}` : items
  }).join('')
  const body = secs.map(sec =>
    (sec.titre ? `<h2 class="sec">${esc(sec.titre)}</h2>` : '')
    + sec.notes.map(n => articleHtml(n, mediaById, sub.withAttachments)).join('\n')
  ).join('\n')
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(wsName)} — liste exportée</title><style>${STYLE}</style></head>
<body><h1>${esc(wsName)} — liste exportée</h1><p class="sub">${esc(`${total} fiche(s) · ${sub.txt}`)}</p>
<nav class="toc"><ul>${toc}</ul></nav>
${body}
</body></html>`
}

// ── Markdown (document unique) ───────────────────────────────
function documentMarkdown({ wsName, secs, mediaById, sub }) {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' })
  td.use(gfm)
  const total = secs.reduce((s, x) => s + x.notes.length, 0)
  const parts = []
  parts.push(`# ${wsName} — liste exportée`)
  parts.push(`> ${total} fiche(s) · ${sub.txt}`)

  for (const sec of secs) {
   if (sec.titre) parts.push(`## ${sec.titre}`)
   for (const n of sec.notes) {
    const block = [`### ${n.titre || '(sans titre)'}`]
    block.push(metaLines(n, sub.withLinks).map(m => `> ${m}`).join('  \n'))
    // Données étendues en tableau Markdown, avant le corps.
    if ((n.donnees ?? []).length) {
      block.push(['| | |', '|---|---|', ...n.donnees.map(([l, v]) =>
        `| **${String(l).replace(/\|/g, '\\|')}** | ${String(v).replace(/\|/g, '\\|')} |`)].join('\n'))
    }
    const bodyHtml = rewriteImg(n.contenu, mediaById, 'medias/')
    const bodyMd = bodyHtml ? td.turndown(bodyHtml) : '_(vide)_'
    block.push(bodyMd)
    if (sub.withAttachments) {
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
  }
  return parts.join('\n\n---\n\n') + '\n'
}

// ── CSV (données en colonnes) ────────────────────────────────
// Colonnes fixes + une colonne par clé de donnée étendue rencontrée. Pas de corps de note,
// pas de référence aux pièces jointes (seulement leur nombre). Séparateur virgule (comme
// l'export complet), listes intra-cellule jointes par « | », BOM UTF-8 pour Excel.
const csvCell = s => {
  const t = String(s ?? '')
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}
function fmtDonneeCsv(meta, v) {
  if (v == null || String(v).trim() === '') return ''
  if (meta?.type === 'booleen') return String(v) === 'true' ? 'Oui' : 'Non'
  if (meta?.type === 'echelle') return `${v}/${meta.max ?? 5}`
  if (meta?.unite) return `${v} ${meta.unite}`
  return String(v)
}
function documentCsv({ wsId, secs, champsDonnees }) {
  const notes = secs.flatMap(s => s.notes)
  const LI = ' | '  // séparateur de liste intra-cellule

  // Colonnes de données étendues : clés présentes (valeur non vide), schéma d'abord.
  const presents = new Set()
  for (const n of notes) for (const [k, v] of Object.entries(n.donnees_brut || {}))
    if (String(v ?? '').trim() !== '') presents.add(k)
  const cols = []
  for (const k of Object.keys(champsDonnees || {})) if (presents.has(k)) { cols.push(k); presents.delete(k) }
  for (const k of presents) cols.push(k)  // hors-schéma / imprévus, dans l'ordre d'apparition

  const entetes = [
    'ID', 'Titre', 'Titre court', 'Date de création', 'Date (journal)', 'Type', 'Catégorie',
    'Objets', 'Éléments', 'Thèmes', 'Auteur', 'Source', 'Référence', 'URL de la note',
    'Liens (IDs)', 'Nb pièces jointes',
    ...cols.map(k => (champsDonnees?.[k]?.label) || k),
  ]

  const origin = (typeof location !== 'undefined' && location.origin) || ''
  const ligne = n => [
    n.id, n.titre || '', n.titre_alt || '',
    (n.created_at || '').slice(0, 10), n.date || '', n.type || '', n.categorie || '',
    (n.objets || []).join(LI), (n.elements || []).join(LI), (n.themes || []).join(LI),
    n.doc_auteur || '', n.source_url || '', n.doc_reference || '',
    `${origin}/jourdoc/${wsId}/notes/${n.id}`,
    (n.liens || []).map(l => l.id).join(LI), (n.medias || []).length,
    ...cols.map(k => fmtDonneeCsv(champsDonnees?.[k], n.donnees_brut?.[k])),
  ]

  const lignes = [entetes, ...notes.map(ligne)].map(r => r.map(csvCell).join(','))
  return '﻿' + lignes.join('\r\n') + '\r\n'  // BOM UTF-8 (Excel)
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
  await Promise.all(Array.from({ length: Math.min(8, total || 1) }, worker))
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
// Deux entrées : `sections` [{titre, ids}] (ordre/groupes de l'affichage préservés) OU
// `ids` (liste plate re-triée par date). opts : { dir, withAttachments, withLinks }.
// onProgress({ phase, done, total }) : phase ∈ 'manifest' | 'download' | 'zip' | 'done'
export async function buildListExport({ wsId, token, ids, sections, opts, onProgress }) {
  const allIds = Array.isArray(sections) ? sections.flatMap(s => s.ids) : (ids ?? [])
  if (!allIds.length) throw new Error('Aucune note à exporter')
  onProgress?.({ phase: 'manifest' })
  const res = await fetch(API_ROUTES.JD_WS_EXPORT_MANIFEST_IDS(wsId), {
    method: 'POST',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: allIds }),
  })
  if (!res.ok) throw new Error(`Manifeste (${res.status})`)
  const manifest = await res.json()

  const wsName = manifest.workspace.name
  const mediaById = new Map(manifest.medias.map(m => [m.id, m]))
  const generatedAt = manifest.generatedAt

  // Sections à rendre : soit l'affichage tel quel, soit une section unique triée par date.
  const noteById = new Map(manifest.notes.map(n => [n.id, n]))
  const secs = Array.isArray(sections)
    ? sections.map(s => ({ titre: s.titre, notes: s.ids.map(id => noteById.get(id)).filter(Boolean) }))
    : [{ titre: null, notes: sortNotes(manifest.notes, opts.dir) }]

  const sub = {
    txt: (Array.isArray(sections) ? 'ordre de l\'affichage' : `tri ${opts.dir === 'asc' ? 'date ↑' : 'date ↓'}`)
      + `${opts.withAttachments ? ' · pièces jointes' : ''}${opts.withLinks ? ' · notes liées' : ''}`
      + ` · généré le ${generatedAt.slice(0, 10)}`,
    withAttachments: opts.withAttachments, withLinks: opts.withLinks,
  }

  const files = {}
  files['liste.html'] = strToU8(documentHtml({ wsName, secs, mediaById, sub }))
  files['liste.md']   = strToU8(documentMarkdown({ wsName, secs, mediaById, sub }))
  if (opts.withCsv !== false)
    files['liste.csv'] = strToU8(documentCsv({ wsId, secs, champsDonnees: manifest.champsDonnees }))

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

  const count = secs.reduce((s, x) => s + x.notes.length, 0)
  onProgress?.({ phase: 'done', count, mediaOk, mediaTotal })
  return { blob, filename, count, mediaOk, mediaTotal }
}
