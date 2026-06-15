import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { daysOfMonth, fmtDay, toISO, sortedIds } from './calUtils'

const OBJ_COL_W = 180   // largeur fixe colonne objet (px)
const DAY_COL_W = 34    // largeur fixe colonne jour (px)
const ROW_H     = 34    // hauteur fixe ligne (px)

const NATURE_FG = { observation: 'var(--success)', activite: 'var(--accent)', documentation: '#d97706' }
const NATURE_BG = { observation: 'rgba(16,185,129,.12)', activite: 'rgba(99,102,241,.12)', documentation: 'rgba(245,158,11,.1)' }
const NATURE_ICO = { observation: '👁', activite: '⚡', documentation: '📄' }

function CellDots({ dayNotes }) {
  const max = 4
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center', padding: '3px' }}>
      {dayNotes.slice(0, max).map((n, i) => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: NATURE_FG[n.nature ?? n.type] ?? 'var(--text-muted)',
        }} />
      ))}
      {dayNotes.length > max && (
        <span style={{ fontSize: '6px', color: 'var(--text-muted)', lineHeight: 1 }}>+{dayNotes.length - max}</span>
      )}
    </div>
  )
}

export default function ObjectMatrix({ notes, objets, year, month }) {
  const { wsId } = useParams()
  const navigate = useNavigate()
  const [popup, setPopup] = useState(null)

  const days = useMemo(() => daysOfMonth(year, month), [year, month])
  const todayISO = toISO(new Date())

  // matrice: Map<objId, Map<iso, Note[]>>
  const matrix = useMemo(() => {
    const m = new Map()
    for (const n of notes) {
      for (const obj of (n.objets ?? [])) {
        if (!m.has(obj.id)) m.set(obj.id, new Map())
        const dm = m.get(obj.id)
        if (!dm.has(n.date)) dm.set(n.date, [])
        dm.get(n.date).push(n)
      }
    }
    return m
  }, [notes])

  // Ids actifs + ancêtres
  const activeIds = useMemo(() => {
    const ids = new Set([...matrix.keys()])
    const objMap = new Map(objets.map(o => [o.id, o]))
    for (const id of [...ids]) {
      let o = objMap.get(id)
      while (o?.parent_id) { ids.add(o.parent_id); o = objMap.get(o.parent_id) }
    }
    return ids
  }, [matrix, objets])

  // Hiérarchie aplatie (actifs seulement)
  const flatObj = useMemo(() => {
    const objMap = new Map(objets.map(o => [o.id, { ...o, children: [] }]))
    const roots = []
    for (const node of objMap.values()) {
      if (node.parent_id && objMap.has(node.parent_id)) objMap.get(node.parent_id).children.push(node)
      else roots.push(node)
    }
    const result = []
    function traverse(node, depth) {
      if (!activeIds.has(node.id)) return
      result.push({ ...node, depth })
      node.children.slice().sort((a, b) => a.nom.localeCompare(b.nom)).forEach(c => traverse(c, depth + 1))
    }
    roots.sort((a, b) => a.nom.localeCompare(b.nom)).forEach(r => traverse(r, 0))
    return result
  }, [objets, activeIds])

  // Étiquettes de jours
  const dayLabels = days.map(iso => {
    const d = new Date(iso + 'T00:00:00')
    return { iso, num: d.getDate(), wd: ['Di','Lu','Ma','Me','Je','Ve','Sa'][d.getDay()] }
  })

  // Template colonnes CSS Grid
  const gridCols = `${OBJ_COL_W}px repeat(${days.length}, ${DAY_COL_W}px)`

  function openCell(obj, iso, dayNotes) {
    if (dayNotes.length === 0) {
      navigate(`/jourdoc/${wsId}/new`, { state: { note_date: iso, objet_ids: [obj.id] } })
    } else {
      setPopup({ objId: obj.id, objNom: obj.nom, iso, notes: dayNotes })
    }
  }

  if (flatObj.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">📊</div>
        <p>Aucune activité ce mois. Ajoutez des notes liées à des objets pour les voir ici.</p>
      </div>
    )
  }

  // Construction des cellules (tableau plat pour CSS Grid)
  const cells = []

  // ── Ligne d'en-tête ──────────────────────────────
  cells.push(
    <div key="corner" className="mxg__corner">Objet</div>
  )
  dayLabels.forEach(({ iso, num, wd }) =>
    cells.push(
      <div key={`h-${iso}`} className={`mxg__day-head${iso === todayISO ? ' today' : ''}`}>
        <span className="mxg__wd">{wd}</span>
        <span className="mxg__dn">{num}</span>
      </div>
    )
  )

  // ── Lignes de données ────────────────────────────
  flatObj.forEach(obj => {
    const objNotes = matrix.get(obj.id)

    cells.push(
      <div
        key={`n-${obj.id}`}
        className={`mxg__name${obj.est_individu ? ' individu' : ' groupe'}`}
        style={{ paddingLeft: `${0.5 + obj.depth * 0.75}rem` }}
        onClick={() => navigate(`/jourdoc/${wsId}/objet/${obj.id}`)}
        title="Fiche objet"
      >
        {!obj.est_individu && <span className="mxg__arrow">▸</span>}
        {obj.nom}
        {obj.nom_court && <span className="mxg__short"> ({obj.nom_court})</span>}
      </div>
    )

    dayLabels.forEach(({ iso }) => {
      const dayNotes = objNotes?.get(iso) ?? []
      const hasNotes = dayNotes.length > 0
      const isToday  = iso === todayISO
      const dominant = dayNotes.find(n => n.nature === 'activite') ?? dayNotes[0]
      const bg = hasNotes ? (NATURE_BG[dominant?.nature] ?? NATURE_BG[dominant?.type] ?? 'var(--accent-bg)') : ''

      cells.push(
        <div
          key={`c-${obj.id}-${iso}`}
          className={`mxg__cell${hasNotes ? ' has' : ''}${isToday ? ' today' : ''}`}
          style={hasNotes ? { background: bg } : {}}
          onClick={() => openCell(obj, iso, dayNotes)}
          title={hasNotes
            ? `${obj.nom} · ${fmtDay(iso)} · ${dayNotes.length} note(s)`
            : `+ Note : ${obj.nom} · ${fmtDay(iso)}`}
        >
          {hasNotes && <CellDots dayNotes={dayNotes} />}
        </div>
      )
    })
  })

  return (
    <div className="mxg-wrap">
      {/* Grille */}
      <div className="mxg" style={{ gridTemplateColumns: gridCols }}>
        {cells}
      </div>

      {/* Légende */}
      <div className="cal-legend" style={{ marginTop: '1rem' }}>
        <span className="cal-legend__item"><span className="cal-dot cal-dot--obs" />Observation</span>
        <span className="cal-legend__item"><span className="cal-dot cal-dot--act" />Activité</span>
        <span className="cal-legend__item"><span className="cal-dot cal-dot--doc" />Documentation</span>
        <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>· Clic cellule vide → nouvelle note</span>
      </div>

      {/* Popup cellule */}
      {popup && (
        <div className="matrix-popup-overlay" onClick={() => setPopup(null)}>
          <div className="matrix-popup" onClick={e => e.stopPropagation()}>
            <div className="matrix-popup__header">
              <strong>{popup.objNom}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '.8125rem' }}>{fmtDay(popup.iso)}</span>
              <button className="matrix-popup__close" onClick={() => setPopup(null)}>×</button>
            </div>
            {popup.notes.map(n => (
              <button key={n.id} className="matrix-popup__note"
                onClick={() => { setPopup(null); navigate(`/jourdoc/${wsId}/notes/${n.id}`, { state: { noteIds: sortedIds(notes) } }) }}>
                <span>{NATURE_ICO[n.nature ?? n.type] ?? '📔'}</span>
                <span className="matrix-popup__titre">{n.titre}</span>
              </button>
            ))}
            <button className="matrix-popup__new"
              onClick={() => { setPopup(null); navigate(`/jourdoc/${wsId}/new`, { state: { note_date: popup.iso, objet_ids: [popup.objId] } }) }}>
              + Nouvelle note · {popup.objNom}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
