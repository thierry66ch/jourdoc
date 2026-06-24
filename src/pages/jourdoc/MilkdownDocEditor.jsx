import { useEffect, useRef } from 'react'
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { history } from '@milkdown/kit/plugin/history'
import { math } from '@milkdown/plugin-math'
import { upload, uploadConfig } from '@milkdown/kit/plugin/upload'
import { getMarkdown } from '@milkdown/kit/utils'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { milkdownExtras } from './milkdownExtras'
import { slash, configureSlash } from './milkdownSlash'
import MilkdownToolbar from './MilkdownToolbar'
import 'katex/dist/katex.min.css'
import '@milkdown/kit/prose/view/style/prosemirror.css'
import '@milkdown/kit/prose/tables/style/tables.css'

// Éditeur WYSIWYG **markdown-natif** (Milkdown / remark) pour les documents .md liés.
// Le modèle interne EST du markdown : pas d'aller-retour marked↔turndown, donc pas de
// divergence de dialecte. CommonMark + GFM (tables, biffé, cases) + maths KaTeX.
//
// Images : le markdown conserve le chemin **relatif** ; seul l'affichage est réécrit vers
// le proxy authentifié (resolveSrc) via un nodeView — la source markdown reste inchangée.

function imageNodeView(resolveSrc) {
  return (node) => {
    const dom = document.createElement('img')
    dom.className = 'milkdown-img'
    const apply = n => {
      dom.setAttribute('src', resolveSrc ? resolveSrc(n.attrs.src || '') : (n.attrs.src || ''))
      if (n.attrs.alt) dom.setAttribute('alt', n.attrs.alt); else dom.removeAttribute('alt')
      if (n.attrs.title) dom.setAttribute('title', n.attrs.title); else dom.removeAttribute('title')
    }
    apply(node)
    return {
      dom,
      update: updated => {
        if (updated.type.name !== 'image') return false
        apply(updated)
        return true
      },
    }
  }
}

// NodeView du list_item : marqueur maîtrisé (puce / numéro via compteur CSS / case à cocher).
// Le composant Vue officiel ne reflétait pas l'attribut `checked` → on rend nous-mêmes.
function listItemNodeView() {
  return (node, view, getPos) => {
    const dom = document.createElement('li')
    dom.className = 'jd-li'
    const marker = document.createElement('span')
    marker.className = 'jd-li__marker'
    marker.setAttribute('contenteditable', 'false')
    const content = document.createElement('div')
    content.className = 'jd-li__content'
    dom.append(marker, content)
    const render = n => {
      dom.dataset.listType = n.attrs.listType || 'bullet'
      marker.textContent = ''
      const { checked } = n.attrs
      if (checked == null) {
        dom.removeAttribute('data-checked') // marqueur puce/numéro via CSS
        return
      }
      dom.dataset.checked = String(!!checked)
      const box = document.createElement('span')
      box.className = 'jd-check'
      box.textContent = checked ? '☑' : '☐'
      box.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation()
        const pos = getPos()
        if (typeof pos !== 'number') return
        const cur = view.state.doc.nodeAt(pos)
        if (cur) view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, checked: !cur.attrs.checked }))
      })
      marker.appendChild(box)
    }
    render(node)
    return {
      dom,
      contentDOM: content,
      update: n => { if (n.type.name !== 'list_item') return false; render(n); return true },
      ignoreMutation: m => m.target === marker || marker.contains(m.target),
    }
  }
}

// Double-clic sur une formule → édition de la source LaTeX (les nœuds math sont des atomes)
function editMathOnDblClick(view, _pos, node, nodePos) {
  const name = node?.type?.name
  if (name !== 'math_inline' && name !== 'math_block') return false
  const current = name === 'math_block' ? (node.attrs.value || '') : (node.textContent || '')
  const next = window.prompt('Formule LaTeX :', current)
  if (next == null) return true
  let tr = view.state.tr
  if (name === 'math_block') {
    tr = tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, value: next })
  } else {
    const content = next ? view.state.schema.text(next) : null
    tr = tr.replaceWith(nodePos, nodePos + node.nodeSize, node.type.create(node.attrs, content))
  }
  view.dispatch(tr)
  return true
}

// Uploader Milkdown : images collées/déposées → uploadImage (assets externes), insérées
// avec leur chemin relatif (l'affichage passe par le nodeView image → proxy).
function makeUploader(uploadImage) {
  return async (files, schema) => {
    const nodes = []
    for (const file of Array.from(files)) {
      if (!file.type?.startsWith('image/')) continue
      let src = null
      try { src = uploadImage ? await uploadImage(file) : null } catch { src = null }
      if (!src) continue
      const node = schema.nodes.image.createAndFill({ src, alt: (file.name || '').replace(/\.[^.]+$/, '') })
      if (node) nodes.push(node)
    }
    return nodes
  }
}

function InnerEditor({ initialMarkdown, onChange, resolveSrc, getMarkdownRef, uploadImage }) {
  const { get } = useEditor(root =>
    Editor.make()
      .config(ctx => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, initialMarkdown || '')
        ctx.update(editorViewOptionsCtx, prev => ({
          ...prev,
          nodeViews: { ...(prev?.nodeViews || {}), image: imageNodeView(resolveSrc), list_item: listItemNodeView() },
          handleDoubleClickOn: editMathOnDblClick,
        }))
        ctx.update(uploadConfig.key, prev => ({ ...prev, uploader: makeUploader(uploadImage), enableHtmlFileUploader: false }))
        ctx.get(listenerCtx).markdownUpdated((_, md) => onChange?.(md))
        configureSlash(ctx)
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .use(math)
      .use(upload)
      .use(milkdownExtras)
      .use(slash)
  )

  // Expose une lecture synchrone du markdown courant (pour l'enregistrement)
  useEffect(() => {
    if (!getMarkdownRef) return
    getMarkdownRef.current = () => {
      const ed = get()
      return ed ? ed.action(getMarkdown()) : (initialMarkdown || '')
    }
    return () => { if (getMarkdownRef) getMarkdownRef.current = null }
  }, [get, getMarkdownRef, initialMarkdown])

  return <Milkdown />
}

export default function MilkdownDocEditor({ initialMarkdown, onChange, resolveSrc, getMarkdownRef, uploadImage }) {
  // clé stable : Milkdown ne re-parse pas defaultValueCtx après le montage
  const keyRef = useRef(0)
  return (
    <div className="milkdown-wrap">
      <MilkdownProvider>
        <MilkdownToolbar />
        <InnerEditor key={keyRef.current} initialMarkdown={initialMarkdown}
          onChange={onChange} resolveSrc={resolveSrc} getMarkdownRef={getMarkdownRef} uploadImage={uploadImage} />
      </MilkdownProvider>
    </div>
  )
}
