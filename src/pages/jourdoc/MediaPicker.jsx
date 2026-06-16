import { useState, useEffect } from 'react'
import { API_ROUTES } from '@pogil/shared'
import { authHeader, mediaUrl } from './hooks'
import MediaCard from './MediaCard'

/**
 * Sélecteur compact de médias pour l'intégration dans NoteForm.
 * Affiche les médias du jour (ou tous si showAll) avec sélection multi.
 */
export default function MediaPicker({ wsId, token, date, selectedIds, onToggle }) {
  const [medias, setMedias] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [showLinked, setShowLinked] = useState(false)

  useEffect(() => {
    setLoading(true)
    let url = API_ROUTES.JD_MEDIAS(wsId)
    const params = new URLSearchParams()
    if (date && !showAll) { params.set('date_from', date); params.set('date_to', date) }
    if (!showLinked) params.set('lie', '0')
    const qs = params.toString()
    fetch(`${url}${qs ? '?' + qs : ''}`, { headers: authHeader(token) })
      .then(r => r.json())
      .then(d => setMedias(d.medias ?? []))
      .finally(() => setLoading(false))
  }, [wsId, token, date, showAll, showLinked])

  // Médias déjà sélectionnés mais pas dans la liste courante (ex. d'un autre jour)
  const extraIds = selectedIds.filter(id => !medias.find(m => m.id === id))

  return (
    <div className="media-picker">
      <div className="media-picker__toolbar">
        <label className="media-picker__toggle">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          Tous les médias
        </label>
        <label className="media-picker__toggle">
          <input type="checkbox" checked={showLinked} onChange={e => setShowLinked(e.target.checked)} />
          Inclure déjà liés
        </label>
        <span className="media-picker__count">{selectedIds.length} sélectionné{selectedIds.length > 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <p className="media-picker__empty">Chargement…</p>
      ) : medias.length === 0 && extraIds.length === 0 ? (
        <p className="media-picker__empty">
          {showAll ? 'Aucun média dans ce workspace.' : `Aucun média${showLinked ? '' : ' non lié'} ce jour.`}
        </p>
      ) : (
        <div className="media-picker__grid">
          {medias.map(m => (
            <MediaCard
              key={m.id}
              media={m}
              src={mediaUrl(wsId, m.id, token)}
              size="sm"
              selected={selectedIds.includes(m.id)}
              onSelect={() => onToggle(m.id, m)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
