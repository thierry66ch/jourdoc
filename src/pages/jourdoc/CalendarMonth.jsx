import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { daysOfMonth, fmtDay, fmtDayShort, toISO, sortedIds } from './calUtils'
import NoteCard from './NoteCard'
import { noteVisual } from './hooks'

const WEEKDAYS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']

export default function CalendarMonth({ notes, year, month }) {
  const { wsId } = useParams()
  const navigate = useNavigate()
  const [selectedDay, setSelectedDay] = useState(null)

  const days     = daysOfMonth(year, month)
  const todayISO = toISO(new Date())

  const noteMap = new Map()
  for (const n of notes) {
    if (!noteMap.has(n.date)) noteMap.set(n.date, [])
    noteMap.get(n.date).push(n)
  }

  const firstDow = (new Date(`${year}-${String(month + 1).padStart(2, '0')}-01`).getDay() + 6) % 7
  const cells = [...Array(firstDow).fill(null), ...days]
  const selectedNotes = selectedDay ? (noteMap.get(selectedDay) ?? []) : []

  return (
    <div className="cal-month">
      <div className="cal-weekdays">
        {WEEKDAYS.map(d => <span key={d} className="cal-wd">{d}</span>)}
      </div>

      <div className="cal-grid">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`e-${i}`} className="cal-cell cal-cell--empty" />

          const dayNotes = noteMap.get(iso) ?? []
          const isToday    = iso === todayISO
          const isSelected = iso === selectedDay
          const hasMedia   = dayNotes.some(n => n.medias?.length > 0)
          const dayNum     = new Date(iso + 'T00:00:00').getDate()

          return (
            <div
              key={iso}
              className={[
                'cal-cell',
                isToday    ? 'cal-cell--today'    : '',
                isSelected ? 'cal-cell--selected'  : '',
                dayNotes.length ? 'cal-cell--has-notes' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setSelectedDay(isSelected ? null : iso)}
            >
              <span className="cal-cell__num">{dayNum}</span>
              {hasMedia && <span className="cal-cell__media">📷</span>}

              <div className="cal-cell__dots">
                {dayNotes.slice(0, 6).map((n, idx) => (
                  <span key={idx} className="cal-dot" style={{ background: noteVisual(n).couleur }} />
                ))}
                {dayNotes.length > 6 && <span className="cal-dot-more">+{dayNotes.length - 6}</span>}
              </div>

              {/* Popup au survol — CSS :hover, z-index hors grille */}
              {dayNotes.length > 0 && (
                <div
                  className="cal-cell__popup"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="cal-cell__popup-date">{fmtDayShort(iso)}</div>
                  {dayNotes.slice(0, 6).map(n => (
                    <button
                      key={n.id}
                      className="cal-cell__popup-item"
                      onClick={() => navigate(`/jourdoc/${wsId}/notes/${n.id}`, { state: { noteIds: sortedIds(notes) } })}
                    >
                      <span>{noteVisual(n).icon}</span>
                      <span className="cal-cell__popup-title">{n.titre_alt ?? n.titre}</span>
                    </button>
                  ))}
                  {dayNotes.length > 6 && (
                    <span className="cal-cell__popup-more">+{dayNotes.length - 6} autres</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Panneau jour sélectionné */}
      {selectedDay && (
        <div className="cal-day-panel">
          <div className="cal-day-panel__header">
            <h3>{fmtDay(selectedDay)}</h3>
            <button
              className="btn btn-primary"
              style={{ padding: '.35rem .75rem', fontSize: '.8125rem' }}
              onClick={() => navigate(`/jourdoc/${wsId}/new`, { state: { note_date: selectedDay } })}
            >+ Nouvelle note</button>
          </div>
          {selectedNotes.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>Aucune note ce jour.</p>
          ) : (
            <div className="jd-notes-list">
              {selectedNotes.map(n => <NoteCard key={n.id} note={n} contextNoteIds={sortedIds(notes)} />)}
            </div>
          )}
        </div>
      )}

      <div className="cal-legend">
        <span className="cal-legend__item"><span className="cal-dot cal-dot--obs" />Observation</span>
        <span className="cal-legend__item"><span className="cal-dot cal-dot--act" />Activité</span>
        <span className="cal-legend__item"><span className="cal-dot cal-dot--mix" />Obs.→Act.</span>
        <span className="cal-legend__item"><span className="cal-dot cal-dot--doc" />Documentation</span>
      </div>
    </div>
  )
}
