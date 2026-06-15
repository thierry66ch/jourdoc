import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { daysOfWeek, daysOfLast7, fmtDay, fmtDayShort, fmtWeekday, toISO, sortedIds } from './calUtils'
import NoteCard from './NoteCard'

const NATURE_ICO = { observation: '👁', activite: '⚡', documentation: '📄', journal: '📔' }
const NATURE_KEY = n => n.nature ?? n.type ?? 'journal'

function WeekNoteItem({ note, contextNoteIds }) {
  const { wsId } = useParams()
  const navigate = useNavigate()
  const key = NATURE_KEY(note)
  const display = note.titre_alt ?? note.titre

  return (
    <div
      className={`week-note-item week-note-item--${key}`}
      title={note.titre}
      onClick={() => navigate(`/jourdoc/${wsId}/notes/${note.id}`,
        contextNoteIds?.length ? { state: { noteIds: contextNoteIds } } : undefined)}
    >
      <span className="week-note-item__icon">{NATURE_ICO[key] ?? '📔'}</span>
      <span className="week-note-item__title">{display}</span>
    </div>
  )
}

export default function CalendarWeek({ notes, anchor, mode = 'week' }) {
  const { wsId } = useParams()
  const navigate = useNavigate()
  const [selectedDay, setSelectedDay] = useState(null)
  const days = mode === 'last7' ? daysOfLast7(anchor) : daysOfWeek(anchor)
  const todayISO = toISO(new Date())

  const noteMap = new Map()
  for (const n of notes) {
    if (!noteMap.has(n.date)) noteMap.set(n.date, [])
    noteMap.get(n.date).push(n)
  }

  const selectedNotes = selectedDay ? (noteMap.get(selectedDay) ?? []) : []

  return (
    <>
      <div className="cal-week">
        {days.map(iso => {
          const dayNotes = noteMap.get(iso) ?? []
          const isToday    = iso === todayISO
          const isSelected = iso === selectedDay
          return (
            <div key={iso}
              className={`cal-week-col${isToday ? ' cal-week-col--today' : ''}${isSelected ? ' cal-week-col--selected' : ''}`}
              onClick={() => setSelectedDay(isSelected ? null : iso)}
              style={{ cursor: 'pointer' }}
            >
              <div className="cal-week-col__header">
                <span className="cal-week-col__wd">{fmtWeekday(iso)}</span>
                <span className={`cal-week-col__num${isToday ? ' today' : ''}`}>
                  {new Date(iso + 'T00:00:00').getDate()}
                </span>
                <span className="cal-week-col__mo">
                  {new Date(iso + 'T00:00:00').toLocaleDateString('fr-CH', { month: 'short' })}
                </span>
              </div>

              <div className="cal-week-col__notes" onClick={e => e.stopPropagation()}>
                {dayNotes.map(n => <WeekNoteItem key={n.id} note={n} contextNoteIds={sortedIds(notes)} />)}
                <button
                  className="cal-week-col__add"
                  onClick={e => { e.stopPropagation(); navigate(`/jourdoc/${wsId}/new`, { state: { note_date: iso } }) }}
                  title={`Nouvelle note · ${fmtDayShort(iso)}`}
                >+</button>
              </div>
            </div>
          )
        })}
      </div>

      {selectedDay && (
        <div className="cal-day-panel">
          <div className="cal-day-panel__header">
            <h3>{fmtDay(selectedDay)}</h3>
            <button className="btn btn-primary"
              style={{ padding: '.35rem .75rem', fontSize: '.8125rem' }}
              onClick={() => navigate(`/jourdoc/${wsId}/new`, { state: { note_date: selectedDay } })}>
              + Nouvelle note
            </button>
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
    </>
  )
}
