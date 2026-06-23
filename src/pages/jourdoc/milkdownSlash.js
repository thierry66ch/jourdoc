import { slashFactory, SlashProvider } from '@milkdown/kit/plugin/slash'
import { callCommand } from '@milkdown/kit/utils'
import {
  wrapInHeadingCommand, wrapInBlockquoteCommand, createCodeBlockCommand, insertHrCommand,
} from '@milkdown/kit/preset/commonmark'
import { insertTableCommand } from '@milkdown/kit/preset/gfm'
import {
  wrapInCalloutCommand, toggleBulletListCommand, toggleOrderedListCommand, toggleTaskCommand,
} from './milkdownExtras'

// Menu « / » : insertion de blocs/formats. slashFactory fournit la mécanique
// (déclencheur, positionnement floating-ui) ; on gère le rendu + la sélection.
export const slash = slashFactory('jdSlash')

const ITEMS = [
  { title: 'Titre 1', icon: 'H1', cmd: wrapInHeadingCommand, payload: 1, kw: 'titre heading h1' },
  { title: 'Titre 2', icon: 'H2', cmd: wrapInHeadingCommand, payload: 2, kw: 'titre heading h2 sous' },
  { title: 'Titre 3', icon: 'H3', cmd: wrapInHeadingCommand, payload: 3, kw: 'titre heading h3 sous' },
  { title: 'Liste à puces', icon: '•', cmd: toggleBulletListCommand, kw: 'liste puce bullet ul' },
  { title: 'Liste numérotée', icon: '1.', cmd: toggleOrderedListCommand, kw: 'liste numero ordered ol' },
  { title: 'Liste à cocher', icon: '☑', cmd: toggleTaskCommand, kw: 'liste cocher case checkbox task todo tache' },
  { title: 'Citation', icon: '❝', cmd: wrapInBlockquoteCommand, kw: 'citation quote blockquote' },
  { title: 'Bloc de code', icon: '{ }', cmd: createCodeBlockCommand, kw: 'code bloc pre' },
  { title: 'Tableau', icon: '▦', cmd: insertTableCommand, kw: 'tableau table grille' },
  { title: 'Ligne horizontale', icon: '―', cmd: insertHrCommand, kw: 'ligne hr separateur divider' },
  { title: 'Encadré info', icon: 'ℹ️', cmd: wrapInCalloutCommand, payload: 'info', kw: 'encadre callout info note' },
  { title: 'Encadré astuce', icon: '💡', cmd: wrapInCalloutCommand, payload: 'tip', kw: 'encadre callout astuce tip conseil' },
  { title: 'Encadré attention', icon: '⚠️', cmd: wrapInCalloutCommand, payload: 'warning', kw: 'encadre callout attention warning danger' },
  { title: 'Encadré succès', icon: '✅', cmd: wrapInCalloutCommand, payload: 'success', kw: 'encadre callout succes success important' },
]

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Configure le slash plugin avec le ctx Milkdown (appelé dans .config()).
export function configureSlash(ctx) {
  const content = document.createElement('div')
  content.className = 'milkdown-slash'

  let provider
  let view = null
  let query = ''
  let active = 0
  let filtered = ITEMS

  function highlight() {
    ;[...content.children].forEach((el, i) => el.classList.toggle('is-active', i === active))
  }
  function render() {
    const q = norm(query)
    filtered = q ? ITEMS.filter(it => norm(it.title).includes(q) || norm(it.kw).includes(q)) : ITEMS
    if (active >= filtered.length) active = 0
    content.innerHTML = ''
    filtered.forEach((it, i) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'milkdown-slash__item' + (i === active ? ' is-active' : '')
      b.innerHTML = `<span class="milkdown-slash__ic">${it.icon}</span><span>${it.title}</span>`
      b.addEventListener('mousedown', e => { e.preventDefault(); select(it) })
      content.appendChild(b)
    })
  }
  function move(d) {
    if (!filtered.length) return
    active = (active + d + filtered.length) % filtered.length
    highlight()
  }
  function select(it) {
    if (!view) return
    const { from } = view.state.selection
    const del = query.length + 1 // requête + le « / »
    view.dispatch(view.state.tr.delete(from - del, from))
    view.focus()
    callCommand(it.cmd.key, it.payload)(ctx)
    provider.hide()
  }

  provider = new SlashProvider({
    content,
    trigger: '/',
    debounce: 0,
    shouldShow(v) {
      // matchNode élargi : autorise le « / » dans les paragraphes ET les titres (pas les blocs de code)
      const text = provider.getContent(v, n => n.isTextblock && n.type.name !== 'code_block') || ''
      const m = /(?:^|\s)\/([\p{L}\p{N}]*)$/u.exec(text)
      if (!m) return false
      query = m[1]
      active = 0
      render()
      return filtered.length > 0
    },
  })

  ctx.set(slash.key, {
    view: () => ({
      update: (v, prev) => { view = v; provider.update(v, prev) },
      destroy: () => provider.destroy(),
    }),
    props: {
      handleKeyDown: (_v, event) => {
        if (content.dataset.show !== 'true') return false
        switch (event.key) {
          case 'ArrowDown': move(1); return true
          case 'ArrowUp': move(-1); return true
          case 'Enter': if (filtered[active]) { select(filtered[active]); return true } return false
          case 'Escape': provider.hide(); return true
          default: return false
        }
      },
    },
  })
}
