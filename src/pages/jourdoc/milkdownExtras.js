import { $markSchema, $nodeSchema, $command, $inputRule, $remark } from '@milkdown/kit/utils'
import { markRule } from '@milkdown/kit/prose'
import { toggleMark, wrapIn } from '@milkdown/kit/prose/commands'
import { deleteRow, deleteColumn, deleteTable } from '@milkdown/kit/prose/tables'
import { visit } from 'unist-util-visit'

// Extensions Milkdown : surlignage (==texte==) et encadrés/callouts (> [!TIP]).
// Côté markdown (remark) : parse + stringify (round-trip validé en Node).
// Côté éditeur : markSchema / nodeSchema (rendu + commandes).

// ── Surlignage : ==texte== ↔ <mark> ──────────────────────────────────────────
const HL_RE = /==(?=\S)([\s\S]+?)==/g
function splitHighlightText(node, index, parent) {
  if (!parent || index == null || !node.value.includes('==')) return
  const parts = []; let last = 0; HL_RE.lastIndex = 0; let m
  while ((m = HL_RE.exec(node.value))) {
    if (m.index > last) parts.push({ type: 'text', value: node.value.slice(last, m.index) })
    parts.push({ type: 'highlight', children: [{ type: 'text', value: m[1] }] })
    last = HL_RE.lastIndex
  }
  if (!parts.length) return
  if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) })
  parent.children.splice(index, 1, ...parts)
  return index + parts.length
}
function highlightAttacher() {
  const data = this.data()
  ;(data.toMarkdownExtensions ??= []).push({
    handlers: {
      highlight: (node, _p, state, info) => {
        const tracker = state.createTracker(info)
        let value = tracker.move('==')
        value += state.containerPhrasing(node, { ...tracker.current(), before: '=', after: '=' })
        value += tracker.move('==')
        return value
      },
    },
  })
  return tree => { visit(tree, 'text', splitHighlightText) }
}
export const highlightRemark = $remark('jdHighlight', () => highlightAttacher)
export const highlightSchema = $markSchema('highlight', () => ({
  parseDOM: [{ tag: 'mark' }],
  toDOM: () => ['mark', { class: 'milkdown-highlight' }],
  parseMarkdown: {
    match: node => node.type === 'highlight',
    runner: (state, node, markType) => { state.openMark(markType); state.next(node.children); state.closeMark(markType) },
  },
  toMarkdown: {
    match: mark => mark.type.name === 'highlight',
    runner: (state, mark) => { state.withMark(mark, 'highlight') },
  },
}))
export const toggleHighlightCommand = $command('ToggleHighlight', ctx => () => toggleMark(highlightSchema.type(ctx)))
export const highlightInputRule = $inputRule(ctx => markRule(/(?:==)([^=]+)(?:==)$/, highlightSchema.type(ctx)))

// ── Callouts : > [!TIP] ↔ <div data-callout> ─────────────────────────────────
const ALERT_VARIANT = {
  NOTE: 'info', INFO: 'info', TIP: 'tip', HINT: 'tip',
  WARNING: 'warning', CAUTION: 'warning', IMPORTANT: 'success', SUCCESS: 'success',
}
const VARIANT_LABEL = { info: 'NOTE', tip: 'TIP', warning: 'WARNING', success: 'IMPORTANT' }
function calloutTransform(tree) {
  visit(tree, 'blockquote', node => {
    const first = node.children?.[0]
    const t = first?.type === 'paragraph' && first.children?.[0]
    if (!(t && t.type === 'text')) return
    const m = /^\s*\[!(\w+)\]\s*\n?/.exec(t.value)
    if (!m) return
    const variant = ALERT_VARIANT[m[1].toUpperCase()] || 'info'
    t.value = t.value.slice(m[0].length)
    if (!t.value) first.children.shift()
    if (first.children.length === 0) node.children.shift()
    node.type = 'callout'
    node.data = { ...(node.data || {}), variant }
  })
}
function calloutAttacher() {
  const data = this.data()
  ;(data.toMarkdownExtensions ??= []).push({
    handlers: {
      callout: (node, _p, state, info) => {
        const variant = node.data?.variant || 'info'
        const label = VARIANT_LABEL[variant] || 'NOTE'
        const inner = state.containerFlow({ type: 'root', children: node.children }, state.createTracker(info).current())
        const body = inner.split('\n').map(l => (l ? `> ${l}` : '>')).join('\n')
        return `> [!${label}]\n${body}`
      },
    },
  })
  return calloutTransform
}
export const calloutRemark = $remark('jdCallout', () => calloutAttacher)
export const calloutSchema = $nodeSchema('callout', () => ({
  content: 'block+',
  group: 'block',
  defining: true,
  attrs: { variant: { default: 'info' } },
  parseDOM: [{ tag: 'div[data-callout]', getAttrs: dom => ({ variant: dom.getAttribute('data-variant') || 'info' }) }],
  toDOM: node => ['div', { 'data-callout': '', 'data-variant': node.attrs.variant, class: `jd-callout jd-callout--${node.attrs.variant}` }, 0],
  parseMarkdown: {
    match: node => node.type === 'callout',
    runner: (state, node, type) => { state.openNode(type, { variant: node.data?.variant || 'info' }); state.next(node.children); state.closeNode() },
  },
  toMarkdown: {
    match: node => node.type.name === 'callout',
    runner: (state, node) => { state.openNode('callout', undefined, { data: { variant: node.attrs.variant } }); state.next(node.content); state.closeNode() },
  },
}))
export const wrapInCalloutCommand = $command('WrapInCallout', ctx => (variant = 'info') => wrapIn(calloutSchema.type(ctx), { variant }))

// ── Effacer la mise en forme (marks + bloc → paragraphe) ─────────────────────
export const clearFormattingCommand = $command('JdClearFormatting', () => () => (state, dispatch) => {
  const { from, to, empty } = state.selection
  const tr = state.tr
  if (!empty) tr.removeMark(from, to)          // retire toutes les marks de la sélection
  const para = state.schema.nodes.paragraph
  if (para) tr.setBlockType(from, to, para)    // titre/bloc → paragraphe
  if (dispatch) dispatch(tr.scrollIntoView())
  return true
})

// ── Tableau : suppression ligne/colonne/tableau (prosemirror-tables) ─────────
export const deleteRowCommand = $command('JdDeleteRow', () => () => deleteRow)
export const deleteColumnCommand = $command('JdDeleteColumn', () => () => deleteColumn)
export const deleteTableCommand = $command('JdDeleteTable', () => () => deleteTable)

// Tous les plugins à brancher (les $… sont soit un plugin, soit un tuple → flat profond)
export const milkdownExtras = [
  highlightRemark, highlightSchema, highlightInputRule, toggleHighlightCommand,
  calloutRemark, calloutSchema, wrapInCalloutCommand,
  clearFormattingCommand, deleteRowCommand, deleteColumnCommand, deleteTableCommand,
].flat(Infinity)
