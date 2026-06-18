import { Node, mergeAttributes } from '@tiptap/core'

const VARIANTS = ['info', 'tip', 'warning', 'success']

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
        default: 'info',
        parseHTML: el => el.getAttribute('data-variant') || 'info',
        renderHTML: attrs => ({ 'data-variant': VARIANTS.includes(attrs.variant) ? attrs.variant : 'info' }),
      },
    }
  },

  parseHTML() { return [{ tag: 'div[data-callout]' }] },

  renderHTML({ HTMLAttributes }) {
    const variant = HTMLAttributes['data-variant'] || 'info'
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '', class: `jd-callout jd-callout--${variant}` }), 0]
  },

  addCommands() {
    return {
      toggleCallout: (variant = 'info') => ({ commands, editor }) =>
        editor.isActive('callout')
          ? commands.lift('callout')
          : commands.wrapIn('callout', { variant }),
    }
  },
})
