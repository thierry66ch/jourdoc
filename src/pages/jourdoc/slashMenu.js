import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { positionMenu } from './menuPosition'

// Commandes du menu « / ». Chaque item supprime d'abord le texte « /query »
// puis exécute la commande Tiptap correspondante.
const ITEMS = [
  { title: 'Titre 1',        icon: 'H1', keywords: 'titre heading h1', run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 1 }).run() },
  { title: 'Titre 2',        icon: 'H2', keywords: 'titre heading h2', run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 2 }).run() },
  { title: 'Titre 3',        icon: 'H3', keywords: 'titre heading h3', run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 3 }).run() },
  { title: 'Liste à puces',  icon: '•',  keywords: 'liste puces bullet', run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: 'Liste numérotée',icon: '1.', keywords: 'liste numerotee ordered', run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { title: 'Case à cocher',  icon: '☑',  keywords: 'case cocher tache todo checkbox task', run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { title: 'Tableau',        icon: '▦',  keywords: 'tableau table grille', run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: 'Citation',       icon: '❝',  keywords: 'citation quote blockquote', run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { title: 'Bloc de code',   icon: '{ }', keywords: 'code bloc', run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { title: 'Encadré Note',      icon: 'ℹ️', keywords: 'callout encadre note info', run: (e, r) => e.chain().focus().deleteRange(r).toggleCallout('note').run() },
  { title: 'Encadré Tip',       icon: '💡', keywords: 'callout encadre astuce conseil tip', run: (e, r) => e.chain().focus().deleteRange(r).toggleCallout('tip').run() },
  { title: 'Encadré Important', icon: '💬', keywords: 'callout encadre important', run: (e, r) => e.chain().focus().deleteRange(r).toggleCallout('important').run() },
  { title: 'Encadré Warning',   icon: '⚠️', keywords: 'callout encadre attention avertissement warning', run: (e, r) => e.chain().focus().deleteRange(r).toggleCallout('warning').run() },
  { title: 'Encadré Caution',   icon: '🛑', keywords: 'callout encadre danger caution', run: (e, r) => e.chain().focus().deleteRange(r).toggleCallout('caution').run() },
]

function makeRenderer() {
  let el, items = [], selected = 0, command

  function paint() {
    if (!el) return
    el.innerHTML = ''
    if (items.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'slash-menu__empty'
      empty.textContent = 'Aucune commande'
      el.appendChild(empty)
      return
    }
    items.forEach((item, i) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'slash-menu__item' + (i === selected ? ' is-sel' : '')
      const icon = document.createElement('span'); icon.className = 'slash-menu__icon'; icon.textContent = item.icon
      const label = document.createElement('span'); label.textContent = item.title
      b.append(icon, label)
      b.addEventListener('mousedown', e => { e.preventDefault(); pick(i) })
      el.appendChild(b)
    })
  }

  function pick(i) { const item = items[i]; if (item && command) command(item) }

  function position(rect) { positionMenu(el, rect, { width: 220 }) }

  return {
    onStart: p => {
      command = p.command; items = p.items; selected = 0
      el = document.createElement('div')
      el.className = 'slash-menu'
      document.body.appendChild(el)
      paint(); position(p.clientRect?.())
    },
    onUpdate: p => {
      command = p.command; items = p.items; selected = 0
      paint(); position(p.clientRect?.())
    },
    onKeyDown: p => {
      if (!items.length) return p.event.key === 'Escape'
      if (p.event.key === 'ArrowDown') { selected = (selected + 1) % items.length; paint(); return true }
      if (p.event.key === 'ArrowUp')   { selected = (selected - 1 + items.length) % items.length; paint(); return true }
      if (p.event.key === 'Enter')     { pick(selected); return true }
      if (p.event.key === 'Escape')    { return true }
      return false
    },
    onExit: () => { el?.remove(); el = null },
  }
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        command: ({ editor, range, props }) => props.run(editor, range),
        items: ({ query }) => {
          const q = query.toLowerCase()
          return ITEMS.filter(i => (i.title + ' ' + i.keywords).toLowerCase().includes(q)).slice(0, 10)
        },
        render: makeRenderer,
      }),
    ]
  },
})
