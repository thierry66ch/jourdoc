import { useState, useEffect, useRef } from 'react'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'

/**
 * Lier un fichier externe par son chemin relatif au dossier `external/`.
 * (Le listing d'arborescence WebDAV n'est pas disponible sur ce partage Infomaniak :
 *  PROPFIND renvoie 404 ; seul l'accès fichier direct fonctionne. → saisie du chemin.)
 * onPick reçoit le média créé.
 */
export default function ExtDocsBrowser({ wsId, token, onPick, onClose }) {
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const downRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function link() {
    const p = path.trim().replace(/^\/+/, '')
    if (!p || busy) return
    setBusy(true); setError('')
    try {
      const res = await fetch(API_ROUTES.JD_MEDIA_LINK(wsId), {
        method: 'POST', headers: authHeader(token), body: JSON.stringify({ path: p }),
      })
      const d = await res.json()
      if (!res.ok || d.error) { setError(d.error || 'Échec du lien'); setBusy(false); return }
      onPick?.(d)
    } catch {
      setError('Erreur réseau'); setBusy(false)
    }
  }

  return (
    <div className="md-modal"
      onMouseDown={e => { downRef.current = e.target }}
      onClick={e => { if (e.target === e.currentTarget && downRef.current === e.currentTarget) onClose?.() }}>
      <div className="md-modal__panel extdocs" onClick={e => e.stopPropagation()}>
        <div className="md-modal__bar">
          <span className="md-modal__title">🔗 Lier un fichier externe</span>
          <button type="button" className="btn btn-ghost md-modal__close" onClick={onClose} title="Fermer">✕</button>
        </div>
        <div className="md-modal__body">
          <p className="extdocs__hint">
            Chemin du fichier, relatif au dossier <code>external/</code> de ta bibliothèque
            (KDrive). L'original reste en place : aucune copie, aucun déplacement.
          </p>
          <input ref={inputRef} className="input" value={path}
            onChange={e => setPath(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); link() } }}
            placeholder="ex : Jardin/maladies/traitements.md" />
          {error && <p className="msg msg-error" style={{ marginTop: '.5rem' }}>{error}</p>}
          <div style={{ marginTop: '.75rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary" onClick={link} disabled={!path.trim() || busy}>
              {busy ? 'Vérification…' : '🔗 Lier'}
            </button>
          </div>
          <p className="extdocs__base">Base : <code>external/</code> (sous-dossiers séparés par <code>/</code>)</p>
        </div>
      </div>
    </div>
  )
}
