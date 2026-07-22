import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { useJdData, authHeader, docCategorieBadgeStyle } from './hooks'
import { getRelated } from './calUtils'
import HierarchyPicker from './HierarchyPicker'
import NoteCard from './NoteCard'
import ExportListModal from './ExportListModal'

const DIR_OPTS = [['both', '↕ Les deux'], ['down', '↓ Descendants'], ['up', '↑ Ancêtres']]

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ')
}

/**
 * Bibliothèque : parcours de toute la documentation du workspace,
 * groupée en « étagères » par catégorie. Recherche, tri, densité, filtres objet/thème.
 */
export default function BibliothequeView() {
  const { wsId } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()
  const { objets, themes, docCategories, docStatuts, searchDepth, pickerMode } = useJdData(wsId, token)
  const [params, setParams] = useSearchParams()

  const [notes, setNotes]     = useState([])
  const [loading, setLoading] = useState(true)
  // État initialisé depuis l'URL → restauré au retour (navigate(-1) restaure les query params)
  const [q, setQ]             = useState(() => params.get('q') || '')
  const [sort, setSort]       = useState(() => params.get('sort') || 'recent') // 'recent' | 'alpha'
  const [selCat, setSelCat]   = useState(() => {
    const c = params.get('cat'); return c == null ? null : (c === '__none__' ? '__none__' : Number(c))
  })
  const [selStatut, setSelStatut] = useState(() => {
    const s = params.get('st'); return s == null ? null : (s === '__none__' ? '__none__' : Number(s))
  })
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [density, setDensity] = useState(() => localStorage.getItem('biblio_density') || 'cards')
  const [exportOpen, setExportOpen] = useState(false)
  // Tri sur les données étendues (Phase C) — 100% côté client.
  const [schemas, setSchemas] = useState([])
  const [sortDonnee, setSortDonnee] = useState('')
  const [sortDonneeDir, setSortDonneeDir] = useState('desc')

  const [objetFilter, setObjetFilter] = useState(() => { const v = params.get('of'); return v ? Number(v) : null })
  const [objetDir, setObjetDir]       = useState(() => params.get('od') || 'both')
  const [themeFilter, setThemeFilter] = useState(() => { const v = params.get('tf'); return v ? Number(v) : null })
  const [themeDir, setThemeDir]       = useState(() => params.get('td') || 'both')

  useEffect(() => { localStorage.setItem('biblio_density', density) }, [density])

  // Refléter les filtres dans l'URL (replace : pas de pollution de l'historique)
  useEffect(() => {
    const p = {}
    if (q) p.q = q
    if (sort !== 'recent') p.sort = sort
    if (selCat != null) p.cat = String(selCat)
    if (selStatut != null) p.st = String(selStatut)
    if (objetFilter) { p.of = String(objetFilter); if (objetDir !== 'both') p.od = objetDir }
    if (themeFilter) { p.tf = String(themeFilter); if (themeDir !== 'both') p.td = themeDir }
    setParams(p, { replace: true })
  }, [q, sort, selCat, selStatut, objetFilter, objetDir, themeFilter, themeDir, setParams])

  // Schémas du workspace : pour proposer leurs champs comme critères de tri.
  useEffect(() => {
    fetch(API_ROUTES.JD_SCHEMAS(wsId), { headers: authHeader(token) })
      .then(r => r.json()).then(d => setSchemas(d.schemas ?? [])).catch(() => setSchemas([]))
  }, [wsId, token])

  useEffect(() => {
    setLoading(true)
    fetch(`${API_ROUTES.JD_NOTES(wsId)}?type=documentation`, { headers: authHeader(token) })
      .then(r => r.json())
      .then(d => setNotes(d.notes ?? []))
      .finally(() => setLoading(false))
  }, [wsId, token])

  // Sauvegarde / restauration de la position de défilement.
  // Le conteneur scrollé est tantôt .jd-main, tantôt la fenêtre → agnostique :
  // écouteur capturant sur window (attrape aussi le scroll des descendants).
  const scrollKey = `biblio_scroll_${wsId}`
  const restoredRef = useRef(false)
  // Instantané pris à l'INITIALISATION, avant qu'un scroll parasite (retour à 0
  // pendant le « Chargement… ») ne puisse écraser la valeur stockée.
  const targetRef = useRef(Number(sessionStorage.getItem(scrollKey) || 0))
  const readScroll = () => {
    const main = document.querySelector('.jd-main')
    return (main && main.scrollTop) || window.scrollY || document.documentElement.scrollTop || 0
  }

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (!restoredRef.current || raf) return // ne pas sauvegarder avant la restauration
      raf = requestAnimationFrame(() => { sessionStorage.setItem(scrollKey, String(readScroll())); raf = 0 })
    }
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => { window.removeEventListener('scroll', onScroll, { capture: true }); if (raf) cancelAnimationFrame(raf) }
  }, [scrollKey])

  useEffect(() => {
    if (loading || restoredRef.current) return
    const y = targetRef.current
    restoredRef.current = true
    if (!y) return
    let tries = 0
    const apply = () => {
      const main = document.querySelector('.jd-main')
      if (main) main.scrollTop = y
      window.scrollTo(0, y)
      // ré-essai tant que la cible n'est pas atteinte (contenu encore en reflow)
      if (Math.abs(readScroll() - y) > 4 && tries++ < 12) requestAnimationFrame(apply)
    }
    requestAnimationFrame(apply)
  }, [loading, scrollKey])

  // 1) Filtrage seul (sans tri) — sert aussi à déterminer le schéma commun des notes visées.
  const filtres = useMemo(() => {
    const lq = q.trim().toLowerCase()
    const objetIds = objetFilter ? getRelated(objets, Number(objetFilter), objetDir, searchDepth) : null
    const themeIds = themeFilter ? getRelated(themes, Number(themeFilter), themeDir, searchDepth) : null
    let list = notes
    if (lq) list = list.filter(n =>
      (n.titre || '').toLowerCase().includes(lq) ||
      (n.titre_alt || '').toLowerCase().includes(lq) ||
      stripHtml(n.contenu).toLowerCase().includes(lq)
    )
    if (objetIds) list = list.filter(n => n.objets?.some(o => objetIds.has(o.id)))
    if (themeIds) list = list.filter(n => n.themes?.some(t => themeIds.has(t.id)))
    return list
  }, [notes, q, objetFilter, objetDir, themeFilter, themeDir, objets, themes, searchDepth])

  // 2) Champs triables : uniquement si TOUTES les notes concernées relèvent du MÊME schéma.
  // Un tri croisé entre schémas hétérogènes n'aurait pas de sens (cf. CDC §7).
  const champsTriables = useMemo(() => {
    const ids = new Set(filtres.map(n => n.schema_donnees_id).filter(Boolean))
    if (ids.size !== 1) return null
    const s = schemas.find(x => x.id === [...ids][0])
    return Array.isArray(s?.champs) && s.champs.length ? s.champs : null
  }, [filtres, schemas])

  // 3) Tri : sur une donnée étendue si demandé, sinon tri usuel (récent / A→Z).
  const matched = useMemo(() => {
    if (sortDonnee && champsTriables) {
      const champ = champsTriables.find(c => c.cle === sortDonnee)
      const num = champ && ['nombre', 'decimal', 'echelle'].includes(champ.type)
      const val = n => n.donnees_etendues?.[sortDonnee] ?? ''
      const s = sortDonneeDir === 'asc' ? 1 : -1
      return [...filtres].sort((a, b) => {
        const va = val(a), vb = val(b)
        // Les notes sans valeur finissent toujours en bas, quel que soit le sens.
        if (va === '' && vb === '') return 0
        if (va === '') return 1
        if (vb === '') return -1
        return s * (num ? (Number(va) - Number(vb)) : String(va).localeCompare(String(vb), 'fr'))
      })
    }
    return [...filtres].sort((a, b) => sort === 'alpha'
      ? (a.titre || '').localeCompare(b.titre || '', 'fr', { sensitivity: 'base' })
      : (b.date || '').localeCompare(a.date || '') || b.id - a.id)
  }, [filtres, sort, sortDonnee, sortDonneeDir, champsTriables])

  const counts = useMemo(() => {
    const m = new Map(); let none = 0
    for (const n of matched) {
      if (n.doc_categorie) m.set(n.doc_categorie.id, (m.get(n.doc_categorie.id) ?? 0) + 1)
      else none++
    }
    return { m, none }
  }, [matched])

  const statutCounts = useMemo(() => {
    const m = new Map(); let none = 0
    for (const n of matched) {
      if (n.doc_statut) m.set(n.doc_statut.id, (m.get(n.doc_statut.id) ?? 0) + 1)
      else none++
    }
    return { m, none }
  }, [matched])

  const groups = useMemo(() => {
    let visible = selCat == null ? matched
      : matched.filter(n => selCat === '__none__' ? !n.doc_categorie : n.doc_categorie?.id === selCat)
    if (selStatut != null) visible = visible.filter(n =>
      selStatut === '__none__' ? !n.doc_statut : n.doc_statut?.id === selStatut)
    const out = []
    for (const c of docCategories) {
      const items = visible.filter(n => n.doc_categorie?.id === c.id)
      if (items.length) out.push({ key: String(c.id), cat: c, items })
    }
    const noneItems = visible.filter(n => !n.doc_categorie)
    if (noneItems.length) out.push({ key: '__none__', cat: null, items: noneItems })
    return out
  }, [matched, docCategories, selCat, selStatut])

  const flatIds = useMemo(() => groups.flatMap(g => g.items.map(n => n.id)), [groups])
  const totalCats = docCategories.filter(c => counts.m.get(c.id)).length + (counts.none ? 1 : 0)

  function toggleCat(id) { setSelCat(s => s === id ? null : id) }
  function toggleStatut(id) { setSelStatut(s => s === id ? null : id) }
  function toggleCollapse(key) {
    setCollapsed(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  function renderItems(items) {
    if (density === 'compact') {
      return (
        <ul className="biblio__rows">
          {items.map(n => {
            const meta = [
              n.objets?.map(o => o.nom).join(', '),
              n.themes?.map(t => t.nom).join(', '),
            ].filter(Boolean).join(' · ')
            return (
              <li key={n.id}>
                <button type="button" className="biblio__row"
                  onClick={() => navigate(`/jourdoc/${wsId}/notes/${n.id}`, { state: { noteIds: flatIds } })}>
                  <span className="biblio__row-dot" style={{ background: n.doc_categorie?.couleur || '#d97706' }} />
                  <span className="biblio__row-title">{n.titre}</span>
                  {meta && <span className="biblio__row-meta">{meta}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )
    }
    return (
      <div className="biblio__grid">
        {items.map(n => <NoteCard key={n.id} note={n} contextNoteIds={flatIds} />)}
      </div>
    )
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
          <div className="jd-segmented" title="Densité d'affichage">
            {[['cards', '▦ Cartes'], ['compact', '☰ Compact']].map(([v, l]) => (
              <button key={v} type="button" className={`jd-seg-btn${density === v ? ' active' : ''}`}
                onClick={() => setDensity(v)}>{l}</button>
            ))}
          </div>
          {/* Tri sur une donnée étendue — proposé uniquement quand les notes filtrées
              relèvent toutes du même schéma (sinon le tri n'aurait pas de sens). */}
          {champsTriables && (
            <div className="biblio__tri-donnee">
              <select className="input" value={sortDonnee} onChange={e => setSortDonnee(e.target.value)}
                title="Trier sur une donnée étendue">
                <option value="">📋 Trier par donnée…</option>
                {champsTriables.map(c => <option key={c.cle} value={c.cle}>{c.label || c.cle}</option>)}
              </select>
              {sortDonnee && (
                <button type="button" className="jd-auto-btn"
                  title={sortDonneeDir === 'desc' ? 'Décroissant' : 'Croissant'}
                  onClick={() => setSortDonneeDir(d => d === 'desc' ? 'asc' : 'desc')}>
                  {sortDonneeDir === 'desc' ? '↓' : '↑'}
                </button>
              )}
            </div>
          )}
          <button type="button" className="jd-auto-btn" disabled={flatIds.length === 0}
            title="Exporter la liste filtrée (Markdown + HTML imprimable)"
            onClick={() => setExportOpen(true)}>📤 Exporter ({flatIds.length})</button>
        </div>
      </div>

      {/* Filtres secondaires objet + thème (avec portée ancêtres/descendants) */}
      <div className="biblio__filters">
        <div className="biblio__filter">
          <span className="biblio__filter-label">🌿 Objet</span>
          <div className="biblio__filter-picker">
            <HierarchyPicker items={objets} value={objetFilter}
              onChange={v => { setObjetFilter(v); if (!v) setObjetDir('both') }}
              nullable nullLabel="— Tous —" placeholder="Filtrer par objet…" filterMode={pickerMode} />
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
        <div className="biblio__filter">
          <span className="biblio__filter-label">🏷️ Thème</span>
          <div className="biblio__filter-picker">
            <HierarchyPicker items={themes} value={themeFilter}
              onChange={v => { setThemeFilter(v); if (!v) setThemeDir('both') }}
              nullable nullLabel="— Tous —" placeholder="Filtrer par thème…" filterMode={pickerMode} />
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

      {/* Filtre par statut */}
      {docStatuts.length > 0 && (statutCounts.m.size > 0 || statutCounts.none > 0) && (
        <div className="biblio__legend">
          <span className="biblio__legend-label">🏁 Statut</span>
          <button type="button" className={`biblio__chip${selStatut == null ? ' active' : ''}`}
            onClick={() => setSelStatut(null)}>Tous</button>
          {docStatuts.map(s => {
            const n = statutCounts.m.get(s.id) ?? 0
            if (!n) return null
            const active = selStatut === s.id
            return (
              <button key={s.id} type="button"
                className={`biblio__chip${active ? ' active' : ''}`}
                style={active ? { background: s.couleur, color: '#fff', borderColor: s.couleur } : docCategorieBadgeStyle(s.couleur)}
                onClick={() => toggleStatut(s.id)}>
                {s.icon || '🏁'} {s.nom} <span className="biblio__chip-n">{n}</span>
              </button>
            )
          })}
          {statutCounts.none > 0 && (
            <button type="button" className={`biblio__chip${selStatut === '__none__' ? ' active' : ''}`}
              onClick={() => toggleStatut('__none__')}>— Sans statut <span className="biblio__chip-n">{statutCounts.none}</span></button>
          )}
        </div>
      )}

      {loading ? (
        <div className="jd-loading">Chargement…</div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📚</div>
          <p>{q || objetFilter || themeFilter || selCat != null || selStatut != null ? 'Aucun document pour ces filtres.' : 'Aucune note de documentation.'}</p>
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
              {!isCollapsed && renderItems(g.items)}
            </section>
          )
        })
      )}

      {exportOpen && (
        <ExportListModal
          wsId={wsId} token={token}
          ids={flatIds} count={flatIds.length}
          defaultDir="desc"
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  )
}
