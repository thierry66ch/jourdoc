import { Node, mergeAttributes } from '@tiptap/core'

// 5 alertes GitHub, identiques à l'éditeur Markdown (Milkdown) : le CSS `.jd-callout--*`
// est partagé entre les deux éditeurs et les vues.
const VARIANTS = ['note', 'tip', 'important', 'warning', 'caution']
// Anciennes variantes → équivalent GitHub (contenu existant).
const LEGACY = { info: 'note', success: 'tip' }

/**
 * Encadré (callout / admonition) : bloc coloré avec icône selon la variante.
 * Rendu : <div data-callout data-variant="tip" class="jd-callout jd-callout--tip">…</div>
 * L'icône est ajoutée en CSS (::before) selon la variante.
 */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'note',
        parseHTML: el => {
          const v = el.getAttribute('data-variant') || 'note'
          return LEGACY[v] || v
        },
        renderHTML: attrs => ({ 'data-variant': VARIANTS.includes(attrs.variant) ? attrs.variant : 'note' }),
      },
    }
  },

  parseHTML() { return [{ tag: 'div[data-callout]' }] },

  renderHTML({ HTMLAttributes }) {
    const variant = HTMLAttributes['data-variant'] || 'note'
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '', class: `jd-callout jd-callout--${variant}` }), 0]
  },

  addCommands() {
    return {
      toggleCallout: (variant = 'note') => ({ commands, editor }) =>
        editor.isActive('callout')
          ? commands.lift('callout')
          : commands.wrapIn('callout', { variant }),
    }
  },
})
