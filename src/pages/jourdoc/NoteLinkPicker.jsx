import { useState, useEffect, useRef } from 'react'
import { API_ROUTES } from '@pogil/shared'
import { authHeader, noteVisual } from './hooks'

const NATURE_KEY = n => n.nature ?? n.type ?? 'journal'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function NoteLinkPicker({ wsId, token, currentNoteId, onSelect, onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (q.length < 1) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const url = `${API_ROUTES.JD_NOTES_SEARCH(wsId)}?q=${encodeURIComponent(q)}&exclude=${currentNoteId}`
        const data = await fetch(url, { headers: authHeader(token) }).then(r => r.json())
        setResults(data.notes ?? [])
      } finally { setLoading(false) }
    }, 220)
  }, [q, wsId, token, currentNoteId])

  return (
    <div className="note-link-picker" onKeyDown={e => e.key === 'Escape' && onClose()}>
      <div className="note-link-picker__header">
        <input
          ref={inputRef}
          className="input"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Rechercher une note par titre…"
          style={{ flex: 1 }}
        />
        <button className="btn btn-ghost" style={{ padding: '.4rem .75rem' }} onClick={onClose}>Annuler</button>
      </div>

      {loading && <p className="note-link-picker__empty">Recherche…</p>}

      {!loading && q.length > 0 && results.length === 0 && (
        <p className="note-link-picker__empty">Aucune note trouvée pour « {q} »</p>
      )}

      {results.length > 0 && (
        <ul className="note-link-picker__list">
          {results.map(n => (
            <li key={n.id}>
              <button className={`note-link-picker__item note-link-picker__item--${NATURE_KEY(n)}`} onClick={() => onSelect(n)}>
                <span className="note-link-picker__icon">{noteVisual(n).icon}</span>
                <span className="note-link-picker__title">{n.titre}</span>
                {n.titre_alt && <span className="note-link-picker__alt">{n.titre_alt}</span>}
                <span className="note-link-picker__date">{fmtDate(n.date)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {q.length === 0 && (
        <p className="note-link-picker__hint">Tapez quelques lettres pour rechercher une note…</p>
      )}
    </div>
  )
}
