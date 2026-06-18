import { useState, useEffect, useRef } from 'react'
import { marked } from 'marked'
import TurndownService from 'turndown'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'
import RichTextEditor from './RichTextEditor'
import RichTextView from './RichTextView'

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
const mdToHtml = md => marked.parse(md || '', { breaks: true })

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
  const editorHtmlRef = useRef('')

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

  // Fermeture au clavier (Échap)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
      setMode('view')
    } finally { setSaving(false) }
  }

  return (
    <div className="md-modal" onClick={onClose}>
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
            <button type="button" className="btn btn-ghost md-modal__close" onClick={onClose} title="Fermer">✕</button>
          </div>
        </div>
        <div className="md-modal__body">
          {loading ? (
            <div className="jd-loading">Chargement…</div>
          ) : mode === 'edit' ? (
            <RichTextEditor key={`md-${currentId ?? 'new'}`} initialContent={html}
              onChange={h => { editorHtmlRef.current = h }}
              placeholder="Rédigez votre document Markdown…" />
          ) : html ? (
            <RichTextView content={html} className="md-modal__view" />
          ) : (
            <p className="md-modal__empty">Document vide.</p>
          )}
        </div>
      </div>
    </div>
  )
}
