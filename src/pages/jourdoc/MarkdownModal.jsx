import { useState, useEffect, useRef, useMemo } from 'react'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'
import { buildToc } from './toc'
import { mdToHtmlView, mdToHtmlEdit, htmlToMd } from './mdConvert'
import RichTextEditor from './RichTextEditor'
import RichTextView from './RichTextView'

// Réécrit les images relatives d'un MD vers le proxy « relatif au média »
// (marche que le doc soit lié/external ou importé/uploads).
function resolveImages(html, wsId, mediaId, token) {
  if (typeof window === 'undefined' || !html || mediaId == null) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('img').forEach(img => {
    const raw = img.getAttribute('src') || ''
    if (/^(https?:|data:|blob:|\/)/i.test(raw)) return // absolu/externe : on laisse
    // Le lien Markdown encode les espaces (%20…) : décoder avant de bâtir le chemin
    let rel = raw
    try { rel = decodeURIComponent(raw) } catch { /* garder tel quel */ }
    img.setAttribute('src', `${API_ROUTES.JD_MEDIA_RELFILE(wsId, mediaId)}?rel=${encodeURIComponent(rel)}&t=${token}`)
    img.setAttribute('loading', 'lazy')
  })
  return doc.body.innerHTML
}

// Inverse : proxy relatif → chemin relatif encodé (pour réenregistrer le .md)
function unresolveImages(html, wsId, mediaId) {
  if (typeof window === 'undefined' || !html || mediaId == null) return html
  const prefix = API_ROUTES.JD_MEDIA_RELFILE(wsId, mediaId)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || ''
    if (!src.startsWith(prefix)) return
    try {
      const qs = new URLSearchParams(src.slice(src.indexOf('?') + 1))
      const rel = qs.get('rel') || '' // déjà décodé → "Test MD/image.png"
      img.removeAttribute('loading')
      img.setAttribute('src', rel.split('/').map(encodeURIComponent).join('/')) // → "Test%20MD/image.png"
    } catch { /* laisser tel quel */ }
  })
  return doc.body.innerHTML
}

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
  const [md, setMd]       = useState('')         // source Markdown (unique source de vérité)
  const [externe, setExterne] = useState(false) // doc lié (fichier externe)
  const [loading, setLoading] = useState(!isCreate)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const editorHtmlRef = useRef('')
  const downTargetRef = useRef(null) // pour distinguer un vrai clic backdrop d'un drag de sélection
  const bodyRef = useRef(null)

  // Vue lecture : KaTeX rendu + callouts, images résolues + table des matières
  const { html: viewHtml, items: toc } = useMemo(
    () => buildToc(resolveImages(mdToHtmlView(md), wsId, currentId, token)), [md, currentId, wsId, token])
  // Édition : formules en placeholders (nœuds Tiptap), images résolues (reconverties au save)
  const editHtml = useMemo(
    () => resolveImages(mdToHtmlEdit(md), wsId, currentId, token), [md, wsId, currentId, token])
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
        setMd(d.content || '')
        setExterne(!!d.externe)
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
    // Reconvertir les URLs proxy en chemins relatifs avant la sérialisation Markdown
    const content = htmlToMd(unresolveImages(editorHtmlRef.current || '', wsId, currentId))
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
        // Doc lié : ne PAS renommer le fichier externe (on n'envoie pas `nom`)
        await fetch(API_ROUTES.JD_MEDIA_CONTENT(wsId, currentId), {
          method: 'PUT', headers: authHeader(token),
          body: JSON.stringify(externe ? { content } : { nom: name, content }),
        })
        onSaved?.()
      }
      setMd(content)
      setDirty(false)
      setMode('view')
    } finally { setSaving(false) }
  }

  return (
    <div className="md-modal"
      onMouseDown={e => { downTargetRef.current = e.target }}
      onClick={e => { if (e.target === e.currentTarget && downTargetRef.current === e.currentTarget) requestClose() }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>

      <div className="md-modal__panel" onClick={e => e.stopPropagation()}>
        <div className="md-modal__bar">
          {mode === 'edit' && !externe ? (
            <input className="input md-modal__name" value={name}
              onChange={e => setName(e.target.value)} placeholder="Nom du document" />
          ) : (
            <span className="md-modal__title">📝 {name}</span>
          )}
          <div className="md-modal__actions">
            {externe && <span className="md-modal__ext" title="Document lié (fichier externe)">🔗 lié</span>}
            {mode === 'view' ? (
              <button type="button" className="btn btn-ghost"
                onClick={() => { editorHtmlRef.current = editHtml; setMode('edit') }}>✏️ Éditer</button>
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
            <RichTextEditor key={`md-${currentId ?? 'new'}`} initialContent={editHtml}
              onChange={h => { editorHtmlRef.current = h; setDirty(true) }}
              htmlToSource={h => htmlToMd(unresolveImages(h || '', wsId, currentId))}
              sourceToHtml={s => resolveImages(mdToHtmlEdit(s), wsId, currentId, token)}
              placeholder="Rédigez votre document Markdown…" />
          ) : md.trim() ? (
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
