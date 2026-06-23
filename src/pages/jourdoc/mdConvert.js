import { Marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import 'katex/dist/katex.min.css'

// Conversion Markdown ↔ HTML pour les documents (MarkdownModal).
// Deux sens HTML :
//   • VIEW  → KaTeX rendu (lecture seule, RichTextView)
//   • EDIT  → formules en placeholders <span/div data-math…> (nœuds Tiptap, voir math.js)
// Plus : encadrés (alertes GFM ↔ callouts) et surlignage (==texte== ↔ <mark>).

function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Surlignage : ==texte== (jaune) / ==texte=={pink} (couleur) → <mark> ───────
const HL_COLORS = 'yellow|pink|green|blue|orange'
const HL_TOKEN_RE = new RegExp(`^==(?=\\S)([\\s\\S]+?)==(?:\\{(${HL_COLORS})\\})?`)
const highlightExt = {
  name: 'highlight', level: 'inline',
  start(src) { const i = src.indexOf('=='); return i < 0 ? undefined : i },
  tokenizer(src) {
    const m = HL_TOKEN_RE.exec(src)
    if (m) return { type: 'highlight', raw: m[0], text: m[1], color: m[2] || '', tokens: this.lexer.inlineTokens(m[1]) }
  },
  renderer(token) {
    const cls = token.color && token.color !== 'yellow' ? ` class="hl-${token.color}"` : ''
    return `<mark${cls}>${this.parser.parseInline(token.tokens)}</mark>`
  },
}

// ── Formules → placeholders (éditeur) ─────────────────────────────────────────
const mathBlockExt = {
  name: 'mathBlockPH', level: 'block',
  start(src) { const i = src.indexOf('$$'); return i < 0 ? undefined : i },
  tokenizer(src) {
    const m = /^\$\$([\s\S]+?)\$\$/.exec(src)
    if (m) return { type: 'mathBlockPH', raw: m[0], text: m[1].trim() }
  },
  renderer(t) { return `<div data-math-block data-latex="${escAttr(t.text)}">$$${escAttr(t.text)}$$</div>` },
}
const mathInlineExt = {
  name: 'mathInlinePH', level: 'inline',
  start(src) { const i = src.indexOf('$'); return i < 0 ? undefined : i },
  tokenizer(src) {
    const m = /^\$(?!\$)((?:\\.|[^$\\\n])+?)\$/.exec(src)
    if (m) return { type: 'mathInlinePH', raw: m[0], text: m[1].trim() }
  },
  renderer(t) { return `<span data-math-inline data-latex="${escAttr(t.text)}">$${escAttr(t.text)}$</span>` },
}

const OPTS = { breaks: true, gfm: true }

const markedView = new Marked(OPTS)
markedView.use(markedKatex({ throwOnError: false, nonStandard: true }))
markedView.use({ extensions: [highlightExt] })

const markedEdit = new Marked(OPTS)
markedEdit.use({ extensions: [mathBlockExt, mathInlineExt, highlightExt] })

// ── Alertes GFM (> [!TIP]) → callouts (div data-callout) ──────────────────────
const LABEL_TO_VARIANT = {
  NOTE: 'info', INFO: 'info', TIP: 'tip', HINT: 'tip',
  WARNING: 'warning', CAUTION: 'warning', IMPORTANT: 'success', SUCCESS: 'success',
}
function alertsToCallouts(html) {
  if (typeof window === 'undefined' || !html) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('blockquote').forEach(bq => {
    const m = /^\s*\[!(\w+)\]/.exec(bq.textContent || '')
    if (!m) return
    const variant = LABEL_TO_VARIANT[m[1].toUpperCase()] || 'info'
    const div = doc.createElement('div')
    div.setAttribute('data-callout', '')
    div.setAttribute('data-variant', variant)
    div.className = `jd-callout jd-callout--${variant}`
    // retirer le marqueur [!XXX] (+ <br> éventuel) en tête
    div.innerHTML = bq.innerHTML.replace(/\[!\w+\]\s*(<br\s*\/?>\s*)?/i, '')
    bq.replaceWith(div)
  })
  return doc.body.innerHTML
}

export function mdToHtmlView(md) { return alertsToCallouts(markedView.parse(md || '')) }
export function mdToHtmlEdit(md) { return alertsToCallouts(markedEdit.parse(md || '')) }

// ── HTML (éditeur) → Markdown ─────────────────────────────────────────────────
const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
td.use(gfm) // tableaux, barré, listes de tâches → GFM

const VARIANT_TO_LABEL = { info: 'NOTE', tip: 'TIP', warning: 'WARNING', success: 'IMPORTANT' }
td.addRule('callout', {
  filter: node => node.nodeName === 'DIV' && node.hasAttribute?.('data-callout'),
  replacement: (content, node) => {
    const label = VARIANT_TO_LABEL[node.getAttribute('data-variant')] || 'NOTE'
    const body = content.trim().split('\n').map(l => `> ${l}`.trimEnd()).join('\n')
    return `\n> [!${label}]\n${body}\n\n`
  },
})
td.addRule('mathInline', {
  filter: node => node.nodeName === 'SPAN' && node.hasAttribute?.('data-math-inline'),
  replacement: (_, node) => `$${node.getAttribute('data-latex') || ''}$`,
})
td.addRule('mathBlock', {
  filter: node => node.nodeName === 'DIV' && node.hasAttribute?.('data-math-block'),
  replacement: (_, node) => `\n\n$$${node.getAttribute('data-latex') || ''}$$\n\n`,
})
td.addRule('highlight', {
  filter: 'mark',
  replacement: content => `==${content}==`,
})

// Tableaux → GFM, sérialisés nous-mêmes (la détection d'en-tête de turndown-plugin-gfm
// est fragile et garde en HTML brut les tableaux sans <th> ; Tiptap emballe en plus les
// cellules dans <p>, ce qui injecte des retours ligne cassant le tableau). On remplace
// chaque <table> par un jeton, on le convertit après coup : 1re ligne = en-tête, contenu
// de cellule via turndown inline (gras/liens/maths/surlignage) aplati sur une ligne.
function cellToMd(innerHTML) {
  return td.turndown(innerHTML || '').replace(/\s*\n+\s*/g, ' ').replace(/\|/g, '\\|').trim()
}
function tableToGfm(table) {
  const rows = Array.from(table.rows)
  if (!rows.length) return ''
  const matrix = rows.map(r => Array.from(r.cells).map(c => cellToMd(c.innerHTML)))
  const cols = Math.max(...matrix.map(r => r.length))
  const pad = r => { const x = r.slice(); while (x.length < cols) x.push(''); return x }
  const line = cells => `| ${cells.join(' | ')} |`
  const sep = `| ${Array(cols).fill('---').join(' | ')} |`
  return ['', line(pad(matrix[0])), sep, ...matrix.slice(1).map(r => line(pad(r))), ''].join('\n')
}
function extractTables(html) {
  if (typeof window === 'undefined' || !html.includes('<table')) return { html, tables: [] }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const tables = []
  doc.querySelectorAll('table').forEach((table, i) => {
    tables.push(tableToGfm(table))
    const ph = doc.createElement('p')
    ph.textContent = `XJDTABLE${i}X`
    table.replaceWith(ph)
  })
  return { html: doc.body.innerHTML, tables }
}

export function htmlToMd(html) {
  const { html: prepared, tables } = extractTables(html || '')
  let md = td.turndown(prepared)
  // remplacement par fonction → pas d'interprétation de `$` (formules dans le tableau)
  tables.forEach((t, i) => { md = md.replace(`XJDTABLE${i}X`, () => t) })
  return md
}
