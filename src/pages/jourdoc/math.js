import { Node, mergeAttributes } from '@tiptap/core'
import katex from 'katex'

// Nœuds Tiptap pour les formules KaTeX ($…$ inline, $$…$$ bloc).
//
// Pourquoi des nœuds dédiés : si on injecte le HTML KaTeX rendu directement dans
// l'éditeur, Tiptap ne le reconnaît pas et l'aplatit en texte (la formule est
// détruite au save). Ici la formule est un **atome** : la source LaTeX vit dans
// l'attribut `data-latex`, le rendu KaTeX est fait dans un NodeView (non sérialisé),
// et `renderHTML` ne ressort que `<span data-latex="…">` → turndown reconstitue `$…$`.

function renderInto(el, latex, displayMode) {
  try {
    el.innerHTML = katex.renderToString(latex, { throwOnError: false, displayMode })
  } catch {
    el.textContent = displayMode ? `$$${latex}$$` : `$${latex}$`
  }
}

const latexAttr = {
  latex: {
    default: '',
    parseHTML: el => el.getAttribute('data-latex') || '',
    renderHTML: attrs => ({ 'data-latex': attrs.latex }),
  },
}

// Double-clic → édition rapide de la source LaTeX
function editLatex(getPos, editor, current) {
  const next = window.prompt('Formule LaTeX :', current)
  if (next == null) return
  const pos = getPos()
  if (typeof pos !== 'number') return
  editor.chain().focus().command(({ tr }) => {
    tr.setNodeAttribute(pos, 'latex', next)
    return true
  }).run()
}

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() { return latexAttr },
  parseHTML() { return [{ tag: 'span[data-math-inline]' }] },
  renderHTML({ node, HTMLAttributes }) {
    // Texte source `$…$` inclus → le nœud n'est pas « blank » pour turndown
    // (sinon il serait supprimé avant que la règle math ne s'applique).
    return ['span', mergeAttributes(HTMLAttributes, { 'data-math-inline': '' }), `$${node.attrs.latex}$`]
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('span')
      dom.setAttribute('data-math-inline', '')
      dom.setAttribute('data-latex', node.attrs.latex)
      dom.className = 'tiptap-math'
      dom.title = 'Double-clic pour éditer la formule'
      renderInto(dom, node.attrs.latex, false)
      dom.addEventListener('dblclick', e => { e.preventDefault(); editLatex(getPos, editor, node.attrs.latex) })
      return { dom }
    }
  },
})

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() { return latexAttr },
  parseHTML() { return [{ tag: 'div[data-math-block]' }] },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-math-block': '' }), `$$${node.attrs.latex}$$`]
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div')
      dom.setAttribute('data-math-block', '')
      dom.setAttribute('data-latex', node.attrs.latex)
      dom.className = 'tiptap-math tiptap-math--block'
      dom.title = 'Double-clic pour éditer la formule'
      renderInto(dom, node.attrs.latex, true)
      dom.addEventListener('dblclick', e => { e.preventDefault(); editLatex(getPos, editor, node.attrs.latex) })
      return { dom }
    }
  },
})
