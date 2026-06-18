import Mention from '@tiptap/extension-mention'

const TYPE_ICON = { objet: '🌿', theme: '🏷️', note: '📔' }

function makeRenderer() {
  let el, items = [], selected = 0, command

  function ensureEl() {
    if (el) return
    el = document.createElement('div'); el.className = 'slash-menu'
    document.body.appendChild(el)
  }
  function destroyEl() { el?.remove(); el = null }

  function paint() {
    if (!el) return
    el.innerHTML = ''
    items.forEach((item, i) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'slash-menu__item' + (i === selected ? ' is-sel' : '')
      const icon = document.createElement('span'); icon.className = 'slash-menu__icon'; icon.textContent = item.icon || '@'
      const label = document.createElement('span'); label.textContent = item.label
      b.append(icon, label)
      b.addEventListener('mousedown', e => { e.preventDefault(); pick(i) })
      el.appendChild(b)
    })
  }

  function pick(i) { const item = items[i]; if (item && command) command({ id: item.id, label: item.label }) }

  function position(rect) {
    if (!el || !rect) return
    const w = 240
    el.style.left = `${Math.min(rect.left, window.innerWidth - w - 8)}px`
    el.style.top = `${rect.bottom + 4}px`
  }

  function sync(p) {
    command = p.command; items = p.items; selected = 0
    if (items.length === 0) { destroyEl(); return } // pas de popup sans résultat (ex. @ dans un email)
    ensureEl(); paint(); position(p.clientRect?.())
  }

  return {
    onStart: sync,
    onUpdate: sync,
    onKeyDown: p => {
      if (!el || !items.length) return false // laisser « @ » se comporter normalement
      if (p.event.key === 'ArrowDown') { selected = (selected + 1) % items.length; paint(); return true }
      if (p.event.key === 'ArrowUp')   { selected = (selected - 1 + items.length) % items.length; paint(); return true }
      if (p.event.key === 'Enter')     { pick(selected); return true }
      if (p.event.key === 'Escape')    { destroyEl(); return true }
      return false
    },
    onExit: destroyEl,
  }
}

/**
 * Mention « @ » vers objets / thèmes / notes.
 * getItems() renvoie la fonction de recherche courante (async (query) => items[]),
 * lue via une ref pour rester fraîche sans recréer l'éditeur.
 * Chaque item : { id: 'objet:123', label, type, icon }. L'id encode le type pour la navigation.
 */
export function buildMention(getItems) {
  return Mention.configure({
    HTMLAttributes: { class: 'jd-mention' },
    renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
    suggestion: {
      char: '@',
      items: async ({ query }) => {
        const fn = getItems()
        if (!fn) return []
        try { return await fn(query) } catch { return [] }
      },
      render: makeRenderer,
      command: ({ editor, range, props }) => {
        editor.chain().focus().insertContentAt(range, [
          { type: 'mention', attrs: { id: props.id, label: props.label } },
          { type: 'text', text: ' ' },
        ]).run()
      },
    },
  })
}

export { TYPE_ICON }
