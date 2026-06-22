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

// ── Surlignage : ==texte== → <mark> (inline) ──────────────────────────────────
const highlightExt = {
  name: 'highlight', level: 'inline',
  start(src) { const i = src.indexOf('=='); return i < 0 ? undefined : i },
  tokenizer(src) {
    const m = /^==(?=\S)([\s\S]+?)==/.exec(src)
    if (m) return { type: 'highlight', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) }
  },
  renderer(token) { return `<mark>${this.parser.parseInline(token.tokens)}</mark>` },
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

// Prépare les tableaux pour une sérialisation GFM propre.
// Tiptap emballe le contenu des cellules dans <p> (→ retours ligne qui CASSENT le
// tableau GFM) et tolère les tableaux sans en-tête (→ turndown les garde en HTML brut,
// donc non éditables dans le .md). On aplatit les cellules et on promeut la 1re ligne
// en en-tête si aucune cellule <th> n'existe.
function normalizeTablesForMd(html) {
  if (typeof window === 'undefined' || !html || !html.includes('<table')) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('table').forEach(table => {
    // 1. aplatir le contenu des cellules (retirer les <p>, paragraphes multiples → espace)
    table.querySelectorAll('th, td').forEach(cell => {
      cell.innerHTML = cell.innerHTML
        .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
        .replace(/<\/?p[^>]*>/gi, '')
        .trim()
    })
    // 2. GFM exige une ligne d'en-tête : sans <th>, promouvoir la 1re ligne
    if (!table.querySelector('th')) {
      const firstRow = table.querySelector('tr')
      firstRow?.querySelectorAll('td').forEach(tdCell => {
        const th = doc.createElement('th')
        for (const a of tdCell.attributes) th.setAttribute(a.name, a.value)
        th.innerHTML = tdCell.innerHTML
        tdCell.replaceWith(th)
      })
    }
  })
  return doc.body.innerHTML
}

export function htmlToMd(html) { return td.turndown(normalizeTablesForMd(html || '')) }
