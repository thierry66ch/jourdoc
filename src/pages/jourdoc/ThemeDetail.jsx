import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { useJdData, authHeader, buildPathMap } from './hooks'
import { sortedIds } from './calUtils'
import NoteCard from './NoteCard'

function getDescendants(items, rootId) {
  const ids = new Set([rootId])
  let added = true
  while (added) {
    added = false
    for (const item of items) {
      if (!ids.has(item.id) && ids.has(item.parent_id)) { ids.add(item.id); added = true }
    }
  }
  return ids
}

export default function ThemeDetail() {
  const { wsId, themeId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const { objets, themes } = useJdData(wsId, token)

  const [notes, setNotes] = useState([])
  const [direction, setDirection] = useState('both')
  const [objetFilter, setObjetFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const theme = themes.find(t => t.id === Number(themeId))
  const pathMap = buildPathMap(themes)
  const path = pathMap.get(Number(themeId)) ?? ''

  useEffect(() => {
    setLoading(true)
    fetch(API_ROUTES.JD_THEME_NOTES(wsId, themeId) + `?direction=${direction}`, {
      headers: authHeader(token)
    })
      .then(r => r.json())
      .then(data => setNotes(data.notes ?? []))
      .finally(() => setLoading(false))
  }, [wsId, themeId, token, direction])

  const filteredNotes = notes
    .filter(n => !objetFilter || n.objets?.some(o => getDescendants(objets, Number(objetFilter)).has(o.id)))
    .filter(n => typeFilter === 'all' || n.type === typeFilter)

  const objetsInNotes = objets.filter(o => notes.some(n => n.objets?.some(no => no.id === o.id)))

  return (
    <div className="jd-objet-detail">
      <div className="jd-form-header">
        <button className="btn btn-ghost" style={{ padding: '.35rem .6rem', fontSize: '.875rem' }}
          onClick={() => navigate(-1)}>← Retour</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ marginBottom: '.125rem' }}>🏷️ {theme?.nom ?? `Thème #${themeId}`}</h2>
          {path && <span className="jd-path-label">{path}</span>}
        </div>
      </div>

      <div className="jd-direction-ctrl">
        <span className="form-label" style={{ marginRight: '.5rem' }}>Portée :</span>
        <div className="jd-segmented" style={{ display: 'inline-flex' }}>
          {[['both', '↕ Les deux'], ['down', '↓ Descendants'], ['up', '↑ Ancêtres']].map(([v, l]) => (
            <button key={v} type="button"
              className={`jd-seg-btn${direction === v ? ' active' : ''}`}
              onClick={() => setDirection(v)}>{l}</button>
          ))}
        </div>
        {objetsInNotes.length > 0 && (
          <select value={objetFilter} onChange={e => setObjetFilter(e.target.value)}
            className="jd-filter-select" style={{ marginLeft: '.75rem' }}>
            <option value="">Tous les objets</option>
            {objetsInNotes.map(o => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        )}
        <div className="jd-segmented" style={{ marginLeft: 'auto' }}>
          {[['all','Tout'],['journal','📔 Journal'],['documentation','📄 Doc.']].map(([v,l]) => (
            <button key={v} type="button"
              className={`jd-seg-btn${typeFilter === v ? ' active' : ''}`}
              onClick={() => setTypeFilter(v)}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="jd-loading">Chargement…</div>
      ) : filteredNotes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📋</div>
          <p>{objetFilter ? 'Aucune note pour ce filtre.' : 'Aucune note pour ce thème.'}</p>
        </div>
      ) : (
        <div className="jd-notes-list">
          {filteredNotes.map(note => <NoteCard key={note.id} note={note} showDate contextNoteIds={sortedIds(filteredNotes)} />)}
        </div>
      )}
    </div>
  )
}
