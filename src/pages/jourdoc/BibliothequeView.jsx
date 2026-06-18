import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { useJdData, authHeader, docCategorieBadgeStyle } from './hooks'
import NoteCard from './NoteCard'

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ')
}

/**
 * Bibliothèque : parcours de toute la documentation du workspace,
 * groupée en « étagères » par catégorie. Recherche, tri, filtre.
 */
export default function BibliothequeView() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const { docCategories } = useJdData(wsId, token)

  const [notes, setNotes]     = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ]             = useState('')
  const [sort, setSort]       = useState('recent') // 'recent' | 'alpha'
  const [selCat, setSelCat]   = useState(null)      // null | id | '__none__'
  const [collapsed, setCollapsed] = useState(() => new Set())

  useEffect(() => {
    setLoading(true)
    fetch(`${API_ROUTES.JD_NOTES(wsId)}?type=documentation`, { headers: authHeader(token) })
      .then(r => r.json())
      .then(d => setNotes(d.notes ?? []))
      .finally(() => setLoading(false))
  }, [wsId, token])

  // Recherche (titre + titre_alt + contenu) puis tri
  const matched = useMemo(() => {
    const lq = q.trim().toLowerCase()
    let list = notes
    if (lq) list = list.filter(n =>
      (n.titre || '').toLowerCase().includes(lq) ||
      (n.titre_alt || '').toLowerCase().includes(lq) ||
      stripHtml(n.contenu).toLowerCase().includes(lq)
    )
    return [...list].sort((a, b) => sort === 'alpha'
      ? (a.titre || '').localeCompare(b.titre || '', 'fr', { sensitivity: 'base' })
      : (b.date || '').localeCompare(a.date || '') || b.id - a.id)
  }, [notes, q, sort])

  const counts = useMemo(() => {
    const m = new Map(); let none = 0
    for (const n of matched) {
      if (n.doc_categorie) m.set(n.doc_categorie.id, (m.get(n.doc_categorie.id) ?? 0) + 1)
      else none++
    }
    return { m, none }
  }, [matched])

  // Étagères ordonnées selon le référentiel, + « Sans catégorie » en fin
  const groups = useMemo(() => {
    const visible = selCat == null ? matched
      : matched.filter(n => selCat === '__none__' ? !n.doc_categorie : n.doc_categorie?.id === selCat)
    const out = []
    for (const c of docCategories) {
      const items = visible.filter(n => n.doc_categorie?.id === c.id)
      if (items.length) out.push({ key: String(c.id), cat: c, items })
    }
    const noneItems = visible.filter(n => !n.doc_categorie)
    if (noneItems.length) out.push({ key: '__none__', cat: null, items: noneItems })
    return out
  }, [matched, docCategories, selCat])

  const flatIds = useMemo(() => groups.flatMap(g => g.items.map(n => n.id)), [groups])
  const totalCats = docCategories.filter(c => counts.m.get(c.id)).length + (counts.none ? 1 : 0)

  function toggleCat(id) { setSelCat(s => s === id ? null : id) }
  function toggleCollapse(key) {
    setCollapsed(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  return (
    <div className="biblio">
      <div className="biblio__head">
        <div>
          <h2 className="biblio__title">📚 Bibliothèque</h2>
          <span className="biblio__sub">{matched.length} document{matched.length > 1 ? 's' : ''} · {totalCats} catégorie{totalCats > 1 ? 's' : ''}</span>
        </div>
        <div className="biblio__tools">
          <input className="input biblio__search" placeholder="Rechercher (titre, contenu)…"
            value={q} onChange={e => setQ(e.target.value)} />
          <div className="jd-segmented">
            {[['recent', '🕘 Récent'], ['alpha', '🔤 A→Z']].map(([v, l]) => (
              <button key={v} type="button" className={`jd-seg-btn${sort === v ? ' active' : ''}`}
                onClick={() => setSort(v)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Légende / filtre par catégorie */}
      <div className="biblio__legend">
        <button type="button" className={`biblio__chip${selCat == null ? ' active' : ''}`}
          onClick={() => setSelCat(null)}>Toutes</button>
        {docCategories.map(c => {
          const n = counts.m.get(c.id) ?? 0
          if (!n) return null
          const active = selCat === c.id
          return (
            <button key={c.id} type="button"
              className={`biblio__chip${active ? ' active' : ''}`}
              style={active ? { background: c.couleur, color: '#fff', borderColor: c.couleur } : docCategorieBadgeStyle(c.couleur)}
              onClick={() => toggleCat(c.id)}>
              {c.icon || '📄'} {c.nom} <span className="biblio__chip-n">{n}</span>
            </button>
          )
        })}
        {counts.none > 0 && (
          <button type="button" className={`biblio__chip${selCat === '__none__' ? ' active' : ''}`}
            onClick={() => toggleCat('__none__')}>— Sans catégorie <span className="biblio__chip-n">{counts.none}</span></button>
        )}
      </div>

      {loading ? (
        <div className="jd-loading">Chargement…</div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📚</div>
          <p>{q ? 'Aucun document pour cette recherche.' : 'Aucune note de documentation.'}</p>
        </div>
      ) : (
        groups.map(g => {
          const isCollapsed = collapsed.has(g.key)
          const style = g.cat ? docCategorieBadgeStyle(g.cat.couleur) : {}
          return (
            <section key={g.key} className="biblio__shelf">
              <button type="button" className="biblio__shelf-head" style={style}
                onClick={() => toggleCollapse(g.key)}>
                <span className="biblio__shelf-name">
                  {g.cat ? `${g.cat.icon || '📄'} ${g.cat.nom}` : '📄 Sans catégorie'}
                </span>
                <span className="biblio__shelf-count">{g.items.length}</span>
                <span className="biblio__shelf-caret">{isCollapsed ? '▸' : '▾'}</span>
              </button>
              {!isCollapsed && (
                <div className="biblio__grid">
                  {g.items.map(note => (
                    <NoteCard key={note.id} note={note} contextNoteIds={flatIds} />
                  ))}
                </div>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}
