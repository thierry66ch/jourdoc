import { useState, useEffect, useCallback, useRef } from 'react'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'

function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['md', 'markdown'].includes(ext)) return '📝'
  if (ext === 'pdf') return '📄'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'heic', 'heif'].includes(ext)) return '🖼️'
  return '📎'
}

/**
 * Navigateur de l'arborescence externe (WEBDAV_PATH_EXTDOCS) pour LIER un fichier
 * (référence, sans copie). onPick reçoit le média créé.
 */
export default function ExtDocsBrowser({ wsId, token, onPick, onClose }) {
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const downRef = useRef(null)

  const load = useCallback((p) => {
    setLoading(true); setError('')
    fetch(`${API_ROUTES.JD_EXTDOCS_TREE(wsId)}?path=${encodeURIComponent(p)}`, { headers: authHeader(token) })
      .then(r => r.json())
      .then(d => { setEntries(d.entries ?? []); if (d.error) setError(d.error) })
      .catch(() => setError('Lecture impossible'))
      .finally(() => setLoading(false))
  }, [wsId, token])

  useEffect(() => { load(path) }, [path, load])

  async function pickFile(name) {
    if (busy) return
    setBusy(true); setError('')
    const full = path ? `${path}/${name}` : name
    try {
      const res = await fetch(API_ROUTES.JD_MEDIA_LINK(wsId), {
        method: 'POST', headers: authHeader(token), body: JSON.stringify({ path: full }),
      })
      const d = await res.json()
      if (!res.ok || d.error) { setError(d.error || 'Échec du lien'); return }
      onPick?.(d)
    } finally { setBusy(false) }
  }

  async function createDoc() {
    if (busy) return
    const input = window.prompt('Nom du nouveau document Markdown :', 'Document.md')
    if (input == null) return
    const name = input.trim()
    if (!name) return
    setBusy(true); setError('')
    try {
      const res = await fetch(API_ROUTES.JD_EXTDOCS_CREATE(wsId), {
        method: 'POST', headers: authHeader(token), body: JSON.stringify({ path, name }),
      })
      const d = await res.json()
      if (!res.ok || d.error) { setError(d.error || 'Création impossible'); return }
      onPick?.(d)
    } finally { setBusy(false) }
  }

  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  // Masquer les fichiers/dossiers cachés (commençant par « . »)
  const visible = entries.filter(e => !e.name.startsWith('.'))
  const folders = visible.filter(e => e.dir)
  const files = visible.filter(e => !e.dir)

  return (
    <div className="md-modal"
      onMouseDown={e => { downRef.current = e.target }}
      onClick={e => { if (e.target === e.currentTarget && downRef.current === e.currentTarget) onClose?.() }}>
      <div className="md-modal__panel extdocs" onClick={e => e.stopPropagation()}>
        <div className="md-modal__bar">
          <span className="md-modal__title">🔗 Lier un fichier externe</span>
          <button type="button" className="btn btn-ghost md-modal__close" onClick={onClose} title="Fermer">✕</button>
        </div>
        <div className="extdocs__path">
          <span>📁 external/{path}</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
            onClick={createDoc} title="Créer un document Markdown dans ce dossier">＋ Nouveau document</button>
        </div>
        <div className="md-modal__body">
          {error && <p className="msg msg-error">{error}</p>}
          <ul className="extdocs__list">
            {path && (
              <li><button type="button" className="extdocs__row" onClick={() => setPath(parent)}>↩︎ ..</button></li>
            )}
            {folders.map(f => (
              <li key={`d-${f.name}`}>
                <button type="button" className="extdocs__row"
                  onClick={() => setPath(path ? `${path}/${f.name}` : f.name)}>📁 {f.name}</button>
              </li>
            ))}
            {files.map(f => (
              <li key={`f-${f.name}`}>
                <button type="button" className="extdocs__row extdocs__file" disabled={busy}
                  onClick={() => pickFile(f.name)}>{fileIcon(f.name)} {f.name}</button>
              </li>
            ))}
            {loading && <li className="extdocs__empty">Chargement…</li>}
            {!loading && visible.length === 0 && <li className="extdocs__empty">Dossier vide.</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}
