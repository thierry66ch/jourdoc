import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader, useJdData } from './hooks'
import { getRange, shiftAnchor, rangeLabel, todayISO, getRelated } from './calUtils'
import CalendarMonth from './CalendarMonth'
import CalendarWeek from './CalendarWeek'
import CalendarYear from './CalendarYear'
import ObjectMatrix from './ObjectMatrix'
import HierarchyPicker from './HierarchyPicker'

const MODES = [
  { key: 'year',   label: '📅 Année',   period: 'year'   },
  { key: 'month',  label: '📅 Mois',    period: 'month'  },
  { key: 'week',   label: '📆 Semaine', period: 'week'   },
  { key: 'last7',  label: '📋 7 jours', period: 'last7'  },
  { key: 'matrix', label: '📊 Matrice', period: 'month'  },
]

const DIR_OPTS = [['both','↕ Les deux'],['down','↓ Descendants'],['up','↑ Ancêtres']]

export default function CalendarView() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const { objets, themes, searchDepth, pickerMode } = useJdData(wsId, token)
  const [searchParams, setSearchParams] = useSearchParams()

  const [mode,   setModeState]   = useState(searchParams.get('mode')   ?? 'month')
  const [anchor, setAnchorState] = useState(searchParams.get('anchor') ?? todayISO())
  const [notes,  setNotes]  = useState([])
  const [loading, setLoading] = useState(true)

  // Filtres
  const [objetFilter,    setObjetFilter]    = useState(null)
  const [objetDirection, setObjetDirection] = useState('both')
  const [themeFilter,    setThemeFilter]    = useState(null)
  const [themeDirection, setThemeDirection] = useState('both')

  function setMode(m) {
    setModeState(m)
    setSearchParams({ mode: m, anchor }, { replace: true })
  }
  function setAnchor(a) {
    const val = typeof a === 'function' ? a(anchor) : a
    setAnchorState(val)
    setSearchParams({ mode, anchor: val }, { replace: true })
  }

  const currentMode = MODES.find(m => m.key === mode) ?? MODES[0]
  const { from, to } = useMemo(() => getRange(anchor, currentMode.period), [anchor, currentMode])
  const refDate = new Date(anchor + 'T00:00:00')
  const year  = refDate.getFullYear()
  const month = refDate.getMonth()
  const period = currentMode.period

  useEffect(() => {
    setLoading(true)
    fetch(`${API_ROUTES.JD_NOTES(wsId)}?date_from=${from}&date_to=${to}`, { headers: authHeader(token) })
      .then(r => r.json())
      .then(d => setNotes(d.notes ?? []))
      .finally(() => setLoading(false))
  }, [wsId, token, from, to])

  const filteredNotes = useMemo(() => {
    let result = notes
    if (objetFilter) {
      const ids = getRelated(objets, Number(objetFilter), objetDirection, searchDepth)
      result = result.filter(n => n.objets?.some(o => ids.has(o.id)))
    }
    if (themeFilter) {
      const ids = getRelated(themes, Number(themeFilter), themeDirection, searchDepth)
      result = result.filter(n => n.themes?.some(t => ids.has(t.id)))
    }
    return result
  }, [notes, objets, themes, objetFilter, objetDirection, themeFilter, themeDirection])

  const showFilters = mode === 'month' || mode === 'year'

  // Swipe tactile pour naviguer entre périodes (hors matrix)
  const swipeX = useRef(null)
  function onTouchStart(e) { swipeX.current = e.touches[0].clientX }
  function onTouchEnd(e) {
    if (swipeX.current === null || mode === 'matrix') return
    const dx = e.changedTouches[0].clientX - swipeX.current
    swipeX.current = null
    if (Math.abs(dx) < 50) return
    setAnchor(a => shiftAnchor(a, period, dx > 0 ? -1 : 1))
  }

  return (
    <div className="cal-view" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="cal-view__toolbar">
        <div className="period-nav">
          <button className="period-nav__arrow" onClick={() => setAnchor(a => shiftAnchor(a, period, -1))}>‹</button>
          <span className="period-nav__label">{rangeLabel(anchor, period)}</span>
          <button className="period-nav__arrow" onClick={() => setAnchor(a => shiftAnchor(a, period, 1))}>›</button>
          <button className="btn btn-ghost" style={{ padding: '.3rem .6rem', fontSize: '.8rem' }}
            onClick={() => setAnchor(todayISO())}>Aujourd'hui</button>
        </div>
        <div className="cal-mode-tabs">
          {MODES.map(m => (
            <button key={m.key}
              className={`cal-mode-tab${mode === m.key ? ' active' : ''}`}
              onClick={() => setMode(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtres objets + thèmes — uniquement sur vue mois et année */}
      {showFilters && (
        <div className="cal-filters">
          {/* Filtre objet */}
          <div className="cal-filter-row">
            <span className="cal-filter-label">Objet</span>
            <div className="cal-filter-picker">
              <HierarchyPicker
                items={objets}
                value={objetFilter}
                onChange={v => { setObjetFilter(v); if (!v) setObjetDirection('both') }}
                nullable nullLabel="— Tous —"
                placeholder="Rechercher un objet…"
                filterMode={pickerMode}
              />
            </div>
            {objetFilter && (
              <div className="jd-segmented cal-filter-dir">
                {DIR_OPTS.map(([v, l]) => (
                  <button key={v} type="button"
                    className={`jd-seg-btn${objetDirection === v ? ' active' : ''}`}
                    onClick={() => setObjetDirection(v)}>{l}</button>
                ))}
              </div>
            )}
          </div>

          {/* Filtre thème */}
          <div className="cal-filter-row">
            <span className="cal-filter-label">Thème</span>
            <div className="cal-filter-picker">
              <HierarchyPicker
                items={themes}
                value={themeFilter}
                onChange={v => { setThemeFilter(v); if (!v) setThemeDirection('both') }}
                nullable nullLabel="— Tous —"
                placeholder="Rechercher un thème…"
                filterMode={pickerMode}
              />
            </div>
            {themeFilter && (
              <div className="jd-segmented cal-filter-dir">
                {DIR_OPTS.map(([v, l]) => (
                  <button key={v} type="button"
                    className={`jd-seg-btn${themeDirection === v ? ' active' : ''}`}
                    onClick={() => setThemeDirection(v)}>{l}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && filteredNotes.length > 0 && (
        <div className="cal-view__summary">
          <span>{filteredNotes.length} note{filteredNotes.length > 1 ? 's' : ''} sur la période</span>
          <span>·</span>
          <span>{filteredNotes.filter(n => n.nature === 'observation').length} obs.</span>
          <span>·</span>
          <span>{filteredNotes.filter(n => n.nature === 'activite').length} act.</span>
          {filteredNotes.some(n => n.medias?.length) && (
            <><span>·</span><span>{filteredNotes.reduce((s, n) => s + (n.medias?.length ?? 0), 0)} médias</span></>
          )}
        </div>
      )}

      {loading ? (
        <div className="jd-loading">Chargement…</div>
      ) : (
        <>
          {mode === 'year'   && <CalendarYear  notes={filteredNotes} year={year} />}
          {mode === 'month'  && <CalendarMonth notes={filteredNotes} year={year} month={month} />}
          {mode === 'week'   && <CalendarWeek  notes={filteredNotes} anchor={anchor} />}
          {mode === 'last7'  && <CalendarWeek  notes={filteredNotes} anchor={anchor} mode="last7" />}
          {mode === 'matrix' && <ObjectMatrix  notes={filteredNotes} objets={objets} year={year} month={month} />}
        </>
      )}
    </div>
  )
}
