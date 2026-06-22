import { useEffect, useRef } from 'react'
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { history } from '@milkdown/kit/plugin/history'
import { math } from '@milkdown/plugin-math'
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

function InnerEditor({ initialMarkdown, onChange, resolveSrc, getMarkdownRef }) {
  const { get } = useEditor(root =>
    Editor.make()
      .config(ctx => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, initialMarkdown || '')
        ctx.update(editorViewOptionsCtx, prev => ({
          ...prev,
          nodeViews: { ...(prev?.nodeViews || {}), image: imageNodeView(resolveSrc) },
        }))
        ctx.get(listenerCtx).markdownUpdated((_, md) => onChange?.(md))
        configureSlash(ctx)
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .use(math)
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

export default function MilkdownDocEditor({ initialMarkdown, onChange, resolveSrc, getMarkdownRef }) {
  // clé stable : Milkdown ne re-parse pas defaultValueCtx après le montage
  const keyRef = useRef(0)
  return (
    <div className="milkdown-wrap">
      <MilkdownProvider>
        <MilkdownToolbar />
        <InnerEditor key={keyRef.current} initialMarkdown={initialMarkdown}
          onChange={onChange} resolveSrc={resolveSrc} getMarkdownRef={getMarkdownRef} />
      </MilkdownProvider>
    </div>
  )
}
