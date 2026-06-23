import { $markSchema, $nodeSchema, $command, $inputRule, $remark } from '@milkdown/kit/utils'
import { markRule, findParentNode } from '@milkdown/kit/prose'
import { toggleMark, wrapIn } from '@milkdown/kit/prose/commands'
import { deleteRow, deleteColumn, deleteTable } from '@milkdown/kit/prose/tables'
import { wrapInList, liftListItem } from '@milkdown/kit/prose/schema-list'
import { Fragment } from '@milkdown/kit/prose/model'
import { visit } from 'unist-util-visit'

// Extensions Milkdown : surlignage couleur (==texte=={c}), callouts (> [!TIP]),
// conversions de listes, listes à cocher, effacer-format, édition de tableaux.
// Côté markdown (remark) : parse + stringify (round-trip validé en Node).

export const HL_COLORS = ['yellow', 'pink', 'green', 'blue', 'orange']

// ── Surlignage : ==texte== (jaune) / ==texte=={pink} (couleur) ↔ <mark> ──────
const HL_RE = new RegExp(`==(?=\\S)([\\s\\S]+?)==(?:\\{(${HL_COLORS.join('|')})\\})?`, 'g')
function splitHighlightText(node, index, parent) {
  if (!parent || index == null || !node.value.includes('==')) return
  const parts = []; let last = 0; HL_RE.lastIndex = 0; let m
  while ((m = HL_RE.exec(node.value))) {
    if (m.index > last) parts.push({ type: 'text', value: node.value.slice(last, m.index) })
    parts.push({ type: 'highlight', color: m[2] || '', children: [{ type: 'text', value: m[1] }] })
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
        if (node.color && node.color !== 'yellow') value += tracker.move(`{${node.color}}`)
        return value
      },
    },
  })
  return tree => { visit(tree, 'text', splitHighlightText) }
}
export const highlightRemark = $remark('jdHighlight', () => highlightAttacher)
export const highlightSchema = $markSchema('highlight', () => ({
  attrs: { color: { default: '' } },
  parseDOM: [{ tag: 'mark', getAttrs: dom => ({ color: dom.getAttribute('data-color') || '' }) }],
  toDOM: mark => {
    const color = mark.attrs.color
    return ['mark', { class: `milkdown-highlight${color && color !== 'yellow' ? ` hl-${color}` : ''}`, 'data-color': color || '' }]
  },
  parseMarkdown: {
    match: node => node.type === 'highlight',
    runner: (state, node, markType) => { state.openMark(markType, { color: node.color || '' }); state.next(node.children); state.closeMark(markType) },
  },
  toMarkdown: {
    match: mark => mark.type.name === 'highlight',
    runner: (state, mark) => { state.withMark(mark, 'highlight', undefined, { color: mark.attrs.color || undefined }) },
  },
}))
export const toggleHighlightCommand = $command('ToggleHighlight', ctx => () => toggleMark(highlightSchema.type(ctx)))
export const setHighlightColorCommand = $command('SetHighlightColor', ctx => (color = '') => (state, dispatch) => {
  const type = highlightSchema.type(ctx)
  const { from, to, empty } = state.selection
  const mark = type.create({ color })
  if (empty) { if (dispatch) dispatch(state.tr.addStoredMark(mark)); return true }
  if (dispatch) dispatch(state.tr.removeMark(from, to, type).addMark(from, to, mark))
  return true
})
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

// ── Listes : convertir puces ↔ numéros, basculer en liste à cocher ───────────
// Le marqueur (puce/numéro/case) est rendu par listItemBlockComponent à partir des
// attrs DU list_item (label/listType/checked) — la conversion doit donc les mettre à jour.
const isList = n => n.type.name === 'bullet_list' || n.type.name === 'ordered_list'
const setListType = targetName => () => () => (state, dispatch) => {
  const targetType = state.schema.nodes[targetName]
  const isOrdered = targetName === 'ordered_list'
  const inAny = findParentNode(isList)(state.selection)
  if (inAny && inAny.node.type.name === targetName) {
    return liftListItem(state.schema.nodes.list_item)(state, dispatch) // déjà ce type → délister
  }
  if (!inAny) {
    return wrapInList(targetType, isOrdered ? { order: 1 } : {})(state, dispatch) // hors liste → créer
  }
  // dans une liste de l'autre type (+ sous-listes de la sélection) → convertir
  const { from, to } = state.selection
  const tr = state.tr
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!isList(node)) return
    if (node.type.name !== targetName) {
      tr.setNodeMarkup(pos, targetType, isOrdered ? { order: 1, spread: node.attrs.spread } : { spread: node.attrs.spread })
    }
    node.forEach((li, off) => {
      if (li.type.name === 'list_item') {
        tr.setNodeMarkup(pos + 1 + off, undefined, {
          ...li.attrs, listType: isOrdered ? 'ordered' : 'bullet', label: isOrdered ? '1.' : '•', checked: null,
        })
      }
    })
  })
  if (dispatch) dispatch(tr)
  return true
}
export const toggleBulletListCommand = $command('JdBulletList', setListType('bullet_list'))
export const toggleOrderedListCommand = $command('JdOrderedList', setListType('ordered_list'))

// Liste à cocher : bascule l'attribut `checked` de tous les list_item de la sélection
export const toggleTaskCommand = $command('JdTaskList', () => () => (state, dispatch) => {
  const { from, to } = state.selection
  const items = []
  state.doc.nodesBetween(from, to, (node, pos) => { if (node.type.name === 'list_item') items.push({ node, pos }) })
  if (!items.length) {
    // hors liste → envelopper en liste puis cocher le 1er item
    return wrapInList(state.schema.nodes.bullet_list)(state, tr => {
      let liPos = null
      tr.doc.nodesBetween(Math.max(0, tr.selection.from - 2), tr.selection.to + 2, (n, p) => {
        if (n.type.name === 'list_item' && liPos == null) liPos = p
      })
      if (liPos != null) tr.setNodeMarkup(liPos, undefined, { ...tr.doc.nodeAt(liPos).attrs, checked: false })
      dispatch?.(tr)
    })
  }
  const anyNotTask = items.some(it => it.node.attrs.checked == null)
  const tr = state.tr
  items.forEach(it => tr.setNodeMarkup(it.pos, undefined, { ...it.node.attrs, checked: anyNotTask ? false : null }))
  if (dispatch) dispatch(tr)
  return true
})

// ── Aplatir une liste (sous-listes incluses) en paragraphes ──────────────────
// Remplace la liste la plus externe contenant le curseur par tous ses blocs de contenu
// (paragraphes/titres), à plat — robuste sur les listes imbriquées.
export const flattenListCommand = $command('JdFlattenList', () => () => (state, dispatch) => {
  const $f = state.selection.$from
  let depth = -1
  for (let d = $f.depth; d > 0; d--) {
    if (isList($f.node(d))) depth = d
  }
  if (depth < 0) return false
  const listNode = $f.node(depth)
  const start = $f.before(depth)
  const end = $f.after(depth)
  const blocks = []
  const collect = n => n.forEach(child => {
    const name = child.type.name
    if (name === 'list_item' || isList(child)) collect(child)
    else blocks.push(child)
  })
  collect(listNode)
  if (!blocks.length) return false
  if (dispatch) dispatch(state.tr.replaceWith(start, end, Fragment.fromArray(blocks)).scrollIntoView())
  return true
})

// ── Effacer la mise en forme (marks + bloc → paragraphe) ─────────────────────
export const clearFormattingCommand = $command('JdClearFormatting', () => () => (state, dispatch) => {
  const { from, to, empty } = state.selection
  const tr = state.tr
  if (!empty) tr.removeMark(from, to)
  const para = state.schema.nodes.paragraph
  if (para) tr.setBlockType(from, to, para)
  if (dispatch) dispatch(tr.scrollIntoView())
  return true
})

// ── Tableau : suppression ligne/colonne/tableau ──────────────────────────────
export const deleteRowCommand = $command('JdDeleteRow', () => () => deleteRow)
export const deleteColumnCommand = $command('JdDeleteColumn', () => () => deleteColumn)
export const deleteTableCommand = $command('JdDeleteTable', () => () => deleteTable)

// Tous les plugins à brancher (les $… sont soit un plugin, soit un tuple → flat profond)
export const milkdownExtras = [
  highlightRemark, highlightSchema, highlightInputRule, toggleHighlightCommand, setHighlightColorCommand,
  calloutRemark, calloutSchema, wrapInCalloutCommand,
  toggleBulletListCommand, toggleOrderedListCommand, toggleTaskCommand,
  flattenListCommand, clearFormattingCommand, deleteRowCommand, deleteColumnCommand, deleteTableCommand,
].flat(Infinity)
