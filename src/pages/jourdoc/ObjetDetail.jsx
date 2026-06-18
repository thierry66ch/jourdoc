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

export default function ObjetDetail() {
  const { wsId, objetId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const { objets, themes, docCategories } = useJdData(wsId, token)

  const [notes, setNotes] = useState([])
  const [direction, setDirection] = useState('both')
  const [themeFilter, setThemeFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const objet = objets.find(o => o.id === Number(objetId))

  function newNoteForObjet() {
    navigate(`/jourdoc/${wsId}/new`, { state: { objet_ids: [Number(objetId)] } })
  }

  useEffect(() => {
    setLoading(true)
    fetch(API_ROUTES.JD_OBJET_NOTES(wsId, objetId) + `?direction=${direction}`, {
      headers: authHeader(token)
    })
      .then(r => r.json())
      .then(data => setNotes(data.notes ?? []))
      .finally(() => setLoading(false))
  }, [wsId, objetId, token, direction])

  const pathMap = buildPathMap(objets)
  const path = pathMap.get(Number(objetId)) ?? ''

  const filteredNotes = notes
    .filter(n => !themeFilter || n.themes?.some(t => getDescendants(themes, Number(themeFilter)).has(t.id)))
    .filter(n => typeFilter === 'all' || n.type === typeFilter)
    .filter(n => {
      if (!catFilter) return true
      if (catFilter === '__none__') return n.type === 'documentation' && !n.doc_categorie
      return n.doc_categorie?.id === Number(catFilter)
    })

  // Thèmes présents dans les notes (pour le filtre)
  const themesInNotes = themes.filter(t => notes.some(n => n.themes?.some(nt => nt.id === t.id)))
  // Catégories de doc présentes dans les notes (pour le filtre)
  const catsInNotes = docCategories.filter(c => notes.some(n => n.doc_categorie?.id === c.id))
  const hasUncatDoc = notes.some(n => n.type === 'documentation' && !n.doc_categorie)
  const showCatFilter = typeFilter !== 'journal' && (catsInNotes.length > 0 || hasUncatDoc)

  return (
    <div className="jd-objet-detail">
      <div className="jd-form-header">
        <button className="btn btn-ghost" style={{ padding: '.35rem .6rem', fontSize: '.875rem' }}
          onClick={() => navigate(-1)}>← Retour</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ marginBottom: '.125rem' }}>{objet?.nom ?? `Objet #${objetId}`}</h2>
          {path && <span className="jd-path-label">{path}</span>}
        </div>
        <button className="btn btn-primary" style={{ padding: '.4rem .875rem', fontSize: '.8125rem', flexShrink: 0 }}
          onClick={newNoteForObjet}>+ Note</button>
      </div>

      {objet?.description && <p className="jd-objet-desc">{objet.description}</p>}

      <div className="jd-direction-ctrl">
        <span className="form-label" style={{ marginRight: '.5rem' }}>Portée :</span>
        <div className="jd-segmented" style={{ display: 'inline-flex' }}>
          {[['both', '↕ Les deux'], ['down', '↓ Descendants'], ['up', '↑ Ancêtres']].map(([v, l]) => (
            <button key={v} type="button"
              className={`jd-seg-btn${direction === v ? ' active' : ''}`}
              onClick={() => setDirection(v)}>{l}</button>
          ))}
        </div>
        {themesInNotes.length > 0 && (
          <select value={themeFilter} onChange={e => setThemeFilter(e.target.value)}
            className="jd-filter-select" style={{ marginLeft: '.75rem' }}>
            <option value="">Tous les thèmes</option>
            {themesInNotes.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
          </select>
        )}
        {showCatFilter && (
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="jd-filter-select" style={{ marginLeft: '.75rem' }}>
            <option value="">Toutes catégories</option>
            {catsInNotes.map(c => <option key={c.id} value={c.id}>{c.icon} {c.nom}</option>)}
            {hasUncatDoc && <option value="__none__">— Sans catégorie</option>}
          </select>
        )}
        <div className="jd-segmented" style={{ marginLeft: 'auto' }}>
          {[['all','Tout'],['journal','📔 Journal'],['documentation','📄 Doc.']].map(([v,l]) => (
            <button key={v} type="button"
              className={`jd-seg-btn${typeFilter === v ? ' active' : ''}`}
              onClick={() => { setTypeFilter(v); if (v === 'journal') setCatFilter('') }}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="jd-loading">Chargement…</div>
      ) : filteredNotes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📋</div>
          <p>{themeFilter ? 'Aucune note pour ce filtre.' : 'Aucune note pour cet objet.'}</p>
        </div>
      ) : (
        <div className="jd-notes-list">
          {filteredNotes.map(note => <NoteCard key={note.id} note={note} showDate contextNoteIds={sortedIds(filteredNotes)} />)}
        </div>
      )}
    </div>
  )
}
