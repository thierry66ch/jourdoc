import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader, useJdData } from './hooks'
import { weekBucket, monthSpansFor52 } from './calUtils'
import HierarchyPicker from './HierarchyPicker'
import ExportListModal from './ExportListModal'
import NoteCard from './NoteCard'

const MONTHS_FR_SHORT = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc']
const NATURE_COLOR = { observation: 'var(--success)', activite: 'var(--accent)', mixte: '#db2777', documentation: '#f59e0b', journal: 'var(--text-muted)' }
const DIR_OPTS = [['both','↕'],['down','↓'],['up','↑']]

export default function AnalyseView() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const navigate  = useNavigate()
  const { objets, themes, pickerMode } = useJdData(wsId, token)
  const [params, setParams] = useSearchParams()

  // Filtres persistés dans l'URL → restaurés au retour depuis une note (comme la biblio).
  const [objetFilter,    setObjetFilter]    = useState(() => { const v = params.get('of'); return v ? Number(v) : null })
  const [objetDir,       setObjetDir]       = useState(() => params.get('od') || 'both')
  const [themeFilter,    setThemeFilter]    = useState(() => { const v = params.get('tf'); return v ? Number(v) : null })
  const [themeDir,       setThemeDir]       = useState(() => params.get('td') || 'both')
  const [nature,         setNature]         = useState(() => params.get('nat') || 'both')

  useEffect(() => {
    const p = {}
    if (objetFilter) { p.of = String(objetFilter); if (objetDir !== 'both') p.od = objetDir }
    if (themeFilter) { p.tf = String(themeFilter); if (themeDir !== 'both') p.td = themeDir }
    if (nature !== 'both') p.nat = nature
    setParams(p, { replace: true })
  }, [objetFilter, objetDir, themeFilter, themeDir, nature, setParams])
  const [notes,          setNotes]          = useState([])
  const [loading,        setLoading]        = useState(false)
  const [exportOpen,     setExportOpen]     = useState(false)

  // Popup via portal (position fixed pour échapper à overflow-x:auto) — aperçu au survol (desktop)
  const [popup, setPopup]       = useState(null)  // { notes, x, y, year, bucket }
  const [highlightCol, setHighlightCol] = useState(null)  // bucket index surligné
  const [selectedBucket, setSelectedBucket] = useState(null)  // { year, bucket, notes } — panneau liste sous la grille
  const [bucketLoading, setBucketLoading] = useState(false)
  const hideTimer               = useRef(null)

  // Clic sur une case → récupère les notes ENRICHIES de la semaine (objets/thèmes/médias,
  // absents de /analyse) pour afficher des fiches complètes comme le calendrier.
  async function openBucket(year, bucket, cellNotes) {
    setSelectedBucket({ year, bucket, notes: [] })
    setBucketLoading(true)
    try {
      const dates = cellNotes.map(n => n.date).filter(Boolean).sort()
      const from = dates[0], to = dates[dates.length - 1]
      const ids = new Set(cellNotes.map(n => n.id))
      const data = await fetch(`${API_ROUTES.JD_NOTES(wsId)}?date_from=${from}&date_to=${to}`, { headers: authHeader(token) }).then(r => r.json())
      const enriched = (data.notes ?? []).filter(n => ids.has(n.id))
      setSelectedBucket({ year, bucket, notes: enriched.length ? enriched : cellNotes })
    } catch {
      setSelectedBucket({ year, bucket, notes: cellNotes })  // repli : cartes minimales
    } finally {
      setBucketLoading(false)
    }
  }

  // Semaine courante (marqueur visuel)
  const todayBucket = useMemo(() => weekBucket(new Date().toISOString().slice(0, 10)).bucket, [])

  const showPopup = useCallback((e, cellNotes, year, bucket) => {
    clearTimeout(hideTimer.current)
    const rect = e.currentTarget.getBoundingClientRect()
    setPopup({ notes: cellNotes, x: rect.left, y: rect.bottom + 4, year, bucket })
  }, [])

  const hidePopup = useCallback(() => {
    hideTimer.current = setTimeout(() => setPopup(null), 150)
  }, [])

  const keepPopup = useCallback(() => {
    clearTimeout(hideTimer.current)
  }, [])

  const hasFilter = objetFilter != null || themeFilter != null

  useEffect(() => {
    if (!hasFilter) { setNotes([]); return }
    const params = new URLSearchParams()
    if (objetFilter) { params.set('objet_id', objetFilter); params.set('objet_dir', objetDir) }
    if (themeFilter) { params.set('theme_id', themeFilter); params.set('theme_dir', themeDir) }
    if (nature !== 'both') params.set('nature', nature)
    setLoading(true)
    fetch(`${API_ROUTES.JD_ANALYSE(wsId)}?${params}`, { headers: authHeader(token) })
      .then(r => r.json())
      .then(d => setNotes(d.notes ?? []))
      .finally(() => setLoading(false))
  }, [wsId, token, objetFilter, objetDir, themeFilter, themeDir, nature])

  const byYearBucket = useMemo(() => {
    const map = new Map()
    for (const n of notes) {
      if (!n.date) continue
      const { year, bucket } = weekBucket(n.date)
      const key = `${year}/${bucket}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(n)
    }
    return map
  }, [notes])

  const years = useMemo(() => {
    if (notes.length === 0) return []
    const ys = [...new Set(notes.map(n => weekBucket(n.date).year))].sort()
    const min = ys[0], max = ys[ys.length - 1]
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
  }, [notes])

  const refYear = new Date().getFullYear()
  const monthSpans = useMemo(() => monthSpansFor52(refYear), [refYear])

  const monthStarts = useMemo(() => {
    const jan1 = new Date(refYear, 0, 1)
    const starts = new Set()
    let cur = -1
    for (let b = 0; b < 52; b++) {
      const m = new Date(jan1.getTime() + b * 604800000).getMonth()
      if (m !== cur) { starts.add(b); cur = m }
    }
    return starts
  }, [refYear])

  const BUCKETS = 52

  return (
    <div className="jd-analyse">
      {/* Filtres */}
      <div className="jd-analyse__filters">
        <div className="jd-analyse__filter-row">
          <span className="jd-analyse__filter-label">Objet</span>
          <div className="jd-analyse__picker">
            <HierarchyPicker items={objets} value={objetFilter}
              onChange={v => { setObjetFilter(v); if (!v) setObjetDir('both') }}
              nullable nullLabel="— Tous —" placeholder="Rechercher un objet…" filterMode={pickerMode} />
          </div>
          {objetFilter && (
            <div className="jd-segmented">
              {DIR_OPTS.map(([v, l]) => (
                <button key={v} type="button" className={`jd-seg-btn${objetDir === v ? ' active' : ''}`}
                  onClick={() => setObjetDir(v)}>{l}</button>
              ))}
            </div>
          )}
        </div>

        <div className="jd-analyse__filter-row">
          <span className="jd-analyse__filter-label">Thème</span>
          <div className="jd-analyse__picker">
            <HierarchyPicker items={themes} value={themeFilter}
              onChange={v => { setThemeFilter(v); if (!v) setThemeDir('both') }}
              nullable nullLabel="— Tous —" placeholder="Rechercher un thème…" filterMode={pickerMode} />
          </div>
          {themeFilter && (
            <div className="jd-segmented">
              {DIR_OPTS.map(([v, l]) => (
                <button key={v} type="button" className={`jd-seg-btn${themeDir === v ? ' active' : ''}`}
                  onClick={() => setThemeDir(v)}>{l}</button>
              ))}
            </div>
          )}
        </div>

        <div className="jd-analyse__filter-row">
          <span className="jd-analyse__filter-label">Nature</span>
          <div className="jd-segmented">
            {[['both','↕ Tout'],['observation','👁 Obs.'],['activite','⚡ Act.']].map(([v, l]) => (
              <button key={v} type="button" className={`jd-seg-btn${nature === v ? ' active' : ''}`}
                onClick={() => setNature(v)}>{l}</button>
            ))}
          </div>
        </div>

        {hasFilter && notes.length > 0 && (
          <div className="jd-analyse__filter-row">
            <button type="button" className="jd-auto-btn" onClick={() => setExportOpen(true)}>
              📤 Exporter la liste ({notes.length})
            </button>
          </div>
        )}
      </div>

      {!hasFilter && (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <div className="empty-state__icon">📊</div>
          <p>Sélectionnez au moins un objet ou un thème pour visualiser l'historique pluriannuel.</p>
        </div>
      )}

      {loading && <div className="jd-loading">Chargement…</div>}

      {!loading && hasFilter && notes.length === 0 && (
        <div className="empty-state" style={{ marginTop: '1.5rem' }}>
          <p>Aucune note correspondant aux filtres.</p>
        </div>
      )}

      {!loading && years.length > 0 && (
        <div className="jd-analyse__wrap">
          <table className="jd-analyse__table">
            <colgroup>
              <col className="jd-analyse__col-year" />
              {Array.from({ length: BUCKETS }, (_, i) => <col key={i} />)}
            </colgroup>
            <thead>
              <tr>
                <th className="jd-analyse__th-year" />
                {monthSpans.map(({ month, count }, i) => (
                  <th key={i} colSpan={count} className="jd-analyse__th-month">
                    {MONTHS_FR_SHORT[month]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {years.map(year => (
                <tr key={year}>
                  <td className="jd-analyse__td-year">{year}</td>
                  {Array.from({ length: BUCKETS }, (_, b) => {
                    const cellNotes = byYearBucket.get(`${year}/${b}`) ?? []
                    const isMonthStart = monthStarts.has(b)
                    const isHighlighted = highlightCol === b
                    const isToday = b === todayBucket && year === new Date().getFullYear()
                    return (
                      <td key={b}
                        className={[
                          'jd-analyse__cell',
                          cellNotes.length ? 'jd-analyse__cell--has' : '',
                          isMonthStart ? 'jd-analyse__cell--month-start' : '',
                          isHighlighted ? 'jd-analyse__cell--hl' : '',
                          isToday ? 'jd-analyse__cell--today' : '',
                        ].filter(Boolean).join(' ')}
                        onMouseEnter={cellNotes.length ? e => showPopup(e, cellNotes, year, b) : undefined}
                        onMouseLeave={cellNotes.length ? hidePopup : undefined}
                        onClick={cellNotes.length
                          ? e => {
                              // Clic = popup (aperçu rapide, utile sur mobile) + liste des fiches
                              // sous la grille (complément, comme le calendrier).
                              setHighlightCol(b)
                              showPopup(e, cellNotes, year, b)
                              openBucket(year, b, cellNotes)
                            }
                          : () => { setHighlightCol(null); setSelectedBucket(null) }}
                      >
                        {cellNotes.length > 0 && (
                          <div className="jd-analyse__dots">
                            {cellNotes.slice(0, 4).map((n, i) => (
                              <span key={i} className="jd-analyse__dot"
                                style={{ background: NATURE_COLOR[n.nature ?? n.type] ?? NATURE_COLOR.journal }} />
                            ))}
                            {cellNotes.length > 4 && <span className="jd-analyse__dot-more">+{cellNotes.length - 4}</span>}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Panneau liste des fiches de la semaine cliquée (complément du popup, comme le calendrier) */}
      {selectedBucket && (
        <div className="cal-day-panel">
          <div className="cal-day-panel__header">
            <h3>{(() => {
              const jan1 = new Date(selectedBucket.year, 0, 1)
              const ws = new Date(jan1.getTime() + selectedBucket.bucket * 7 * 86400000)
              const we = new Date(ws.getTime() + 6 * 86400000)
              const fmt = d => d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })
              return `Semaine du ${fmt(ws)} – ${fmt(we)} ${selectedBucket.year}`
            })()}</h3>
            <button type="button" className="jd-auto-btn" onClick={() => setSelectedBucket(null)}>✕ Fermer</button>
          </div>
          {bucketLoading ? (
            <p style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>Chargement…</p>
          ) : (
            <div className="jd-notes-list">
              {selectedBucket.notes.map(n => (
                <NoteCard key={n.id} note={n} contextNoteIds={selectedBucket.notes.map(x => x.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Popup via portal — échappe overflow-x:auto de .jd-analyse__wrap */}
      {popup && createPortal(
        <div className="jd-analyse__popup"
          style={{ left: popup.x, top: popup.y }}
          onMouseEnter={keepPopup}
          onMouseLeave={hidePopup}
        >
          {/* En-tête : plage de dates de la semaine */}
          <div className="jd-analyse__popup-head">
            {(() => {
              const jan1 = new Date(popup.year, 0, 1)
              const ws = new Date(jan1.getTime() + popup.bucket * 7 * 86400000)
              const we = new Date(ws.getTime() + 6 * 86400000)
              const fmt = d => d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })
              return `${fmt(ws)} – ${fmt(we)} ${popup.year}`
            })()}
            {' · '}{popup.notes.length} note{popup.notes.length > 1 ? 's' : ''}
            <button type="button" className="jd-analyse__popup-close" onClick={() => setPopup(null)} title="Fermer">✕</button>
          </div>
          {popup.notes.slice(0, 6).map(n => (
            <button key={n.id} className="jd-analyse__popup-item"
              onClick={() => { setPopup(null); navigate(`/jourdoc/${wsId}/notes/${n.id}`) }}>
              <span className="jd-analyse__popup-dot"
                style={{ background: NATURE_COLOR[n.nature ?? n.type] ?? NATURE_COLOR.journal }} />
              <span className="jd-analyse__popup-date">
                {n.date ? new Date(n.date + 'T00:00:00').toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' }) : ''}
              </span>
              {n.titre_alt ?? n.titre}
            </button>
          ))}
          {popup.notes.length > 6 && <span className="jd-analyse__popup-more">+{popup.notes.length - 6} autres</span>}
        </div>,
        document.body
      )}

      {exportOpen && (
        <ExportListModal
          wsId={wsId} token={token}
          ids={notes.map(n => n.id)} count={notes.length}
          defaultDir="desc"
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  )
}
