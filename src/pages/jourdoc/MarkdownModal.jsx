import { useState, useEffect, useRef, useMemo } from 'react'
import { marked } from 'marked'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'
import { buildToc } from './toc'
import RichTextEditor from './RichTextEditor'
import RichTextView from './RichTextView'

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
td.use(gfm) // tableaux, barré, listes de tâches → Markdown GFM
// Encadrés → alertes GFM (> [!TIP]) pour préserver le contenu en Markdown
const ALERT = { info: 'NOTE', tip: 'TIP', warning: 'WARNING', success: 'IMPORTANT' }
td.addRule('callout', {
  filter: node => node.nodeName === 'DIV' && node.hasAttribute?.('data-callout'),
  replacement: (content, node) => {
    const label = ALERT[node.getAttribute('data-variant')] || 'NOTE'
    const body = content.trim().split('\n').map(l => `> ${l}`.trimEnd()).join('\n')
    return `\n> [!${label}]\n${body}\n\n`
  },
})
const mdToHtml = md => marked.parse(md || '', { breaks: true, gfm: true })

/**
 * Modal plein écran pour visualiser / éditer un document Markdown (pièce jointe).
 * - mediaId fourni → charge le contenu, mode lecture par défaut.
 * - mediaId null    → création (mode édition, vierge).
 * Édition WYSIWYG via Tiptap (RichTextEditor) ; conversion md↔html (marked/turndown).
 */
export default function MarkdownModal({ wsId, token, mediaId = null, initialName = '', onClose, onCreated, onSaved }) {
  const isCreate = mediaId == null
  const [currentId, setCurrentId] = useState(mediaId)
  const [mode, setMode]   = useState(isCreate ? 'edit' : 'view')
  const [name, setName]   = useState((initialName || 'Document').replace(/\.md$/i, ''))
  const [html, setHtml]   = useState('')
  const [loading, setLoading] = useState(!isCreate)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const editorHtmlRef = useRef('')
  const downTargetRef = useRef(null) // pour distinguer un vrai clic backdrop d'un drag de sélection
  const bodyRef = useRef(null)

  // Table des matières (vue lecture) — titres avec id + liste cliquable
  const { html: viewHtml, items: toc } = useMemo(() => buildToc(html), [html])
  function gotoHeading(id) {
    const target = bodyRef.current?.querySelector(`#${CSS.escape(id)}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function requestClose() {
    if (dirty && !window.confirm('Modifications non enregistrées. Fermer sans enregistrer ?')) return
    onClose?.()
  }

  useEffect(() => {
    if (isCreate) return
    setLoading(true)
    fetch(API_ROUTES.JD_MEDIA_CONTENT(wsId, mediaId), { headers: authHeader(token) })
      .then(r => r.json())
      .then(d => {
        const h = mdToHtml(d.content)
        setHtml(h); editorHtmlRef.current = h
        if (d.nom_original) setName(d.nom_original.replace(/\.md$/i, ''))
      })
      .finally(() => setLoading(false))
  }, [wsId, token, mediaId, isCreate])

  // Fermeture au clavier (Échap) — avec confirmation si modifié
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // pas de deps : on veut toujours la dernière valeur de `dirty`

  async function save() {
    setSaving(true)
    const content = td.turndown(editorHtmlRef.current || '')
    try {
      if (currentId == null) {
        const res = await fetch(API_ROUTES.JD_MEDIA_MARKDOWN(wsId), {
          method: 'POST', headers: authHeader(token),
          body: JSON.stringify({ nom: name, content }),
        })
        const media = await res.json()
        setCurrentId(media.id)
        onCreated?.(media)
      } else {
        await fetch(API_ROUTES.JD_MEDIA_CONTENT(wsId, currentId), {
          method: 'PUT', headers: authHeader(token),
          body: JSON.stringify({ nom: name, content }),
        })
        onSaved?.()
      }
      setHtml(editorHtmlRef.current)
      setDirty(false)
      setMode('view')
    } finally { setSaving(false) }
  }

  return (
    <div className="md-modal"
      onMouseDown={e => { downTargetRef.current = e.target }}
      onClick={e => { if (e.target === e.currentTarget && downTargetRef.current === e.currentTarget) requestClose() }}>
      <div className="md-modal__panel" onClick={e => e.stopPropagation()}>
        <div className="md-modal__bar">
          {mode === 'edit' ? (
            <input className="input md-modal__name" value={name}
              onChange={e => setName(e.target.value)} placeholder="Nom du document" />
          ) : (
            <span className="md-modal__title">📝 {name}</span>
          )}
          <div className="md-modal__actions">
            {mode === 'view' ? (
              <button type="button" className="btn btn-ghost"
                onClick={() => { editorHtmlRef.current = html; setMode('edit') }}>✏️ Éditer</button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? '…' : '💾 Enregistrer'}
              </button>
            )}
            <button type="button" className="btn btn-ghost md-modal__close" onClick={requestClose} title="Fermer">✕</button>
          </div>
        </div>
        <div className="md-modal__body" ref={bodyRef}>
          {loading ? (
            <div className="jd-loading">Chargement…</div>
          ) : mode === 'edit' ? (
            <RichTextEditor key={`md-${currentId ?? 'new'}`} initialContent={html}
              onChange={h => { editorHtmlRef.current = h; setDirty(true) }}
              htmlToSource={h => td.turndown(h || '')}
              sourceToHtml={s => mdToHtml(s)}
              placeholder="Rédigez votre document Markdown…" />
          ) : html ? (
            <>
              {toc.length >= 2 && (
                <details className="md-toc" open>
                  <summary>📑 Sommaire</summary>
                  <ul>
                    {toc.map(item => (
                      <li key={item.id} className={`md-toc__l${item.level}`}>
                        <button type="button" onClick={() => gotoHeading(item.id)}>{item.text}</button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <RichTextView content={viewHtml} className="md-modal__view" />
            </>
          ) : (
            <p className="md-modal__empty">Document vide.</p>
          )}
        </div>
      </div>
    </div>
  )
}
