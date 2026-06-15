import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'
import { sortedIds } from './calUtils'
import NoteCard from './NoteCard'

function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function isoToday() { return localISO(new Date()) }
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function shiftDate(iso, days) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return localISO(d)
}

export default function JourDocJournal() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [date, setDate] = useState(isoToday())
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const touchX = useRef(null)

  function onTouchStart(e) { touchX.current = e.touches[0].clientX }
  function onTouchEnd(e) {
    if (touchX.current === null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (dx > 50) setDate(d => shiftDate(d, -1))
    else if (dx < -50) setDate(d => { const next = shiftDate(d, 1); return next <= isoToday() ? next : d })
  }

  useEffect(() => {
    setLoading(true)
    const url = API_ROUTES.JD_NOTES(wsId) + `?date_from=${date}&date_to=${date}`
    fetch(url, { headers: authHeader(token) })
      .then(r => r.json())
      .then(data => setNotes(data.notes ?? []))
      .finally(() => setLoading(false))
  }, [wsId, token, date])

  return (
    <div className="jd-journal" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Sélecteur de date */}
      <div className="jd-journal__nav">
        <button className="jd-date-arrow" onClick={() => setDate(d => shiftDate(d, -1))}>‹</button>
        <div className="jd-journal__date-wrap">
          <span className="jd-journal__date">{fmtDate(date)}</span>
          <input type="date" className="jd-date-hidden" value={date}
            onChange={e => setDate(e.target.value)} />
        </div>
        <button className="jd-date-arrow" onClick={() => setDate(d => shiftDate(d, 1))}
          disabled={date >= isoToday()}>›</button>
        {date !== isoToday() && (
          <button className="btn btn-ghost" style={{ fontSize: '.8rem', padding: '.3rem .6rem' }}
            onClick={() => setDate(isoToday())}>Aujourd'hui</button>
        )}
      </div>

      {/* Liste des notes */}
      {loading ? (
        <div className="jd-loading">Chargement…</div>
      ) : notes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📔</div>
          <p>Aucune note ce jour.</p>
        </div>
      ) : (
        <div className="jd-notes-list">
          {notes.map(note => <NoteCard key={note.id} note={note} contextNoteIds={sortedIds(notes)} />)}
        </div>
      )}

      {/* FAB nouvelle note */}
      <button className="jd-fab" onClick={() => navigate(`/jourdoc/${wsId}/new`)} title="Nouvelle note">
        +
      </button>
    </div>
  )
}
