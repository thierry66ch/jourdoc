import { useState, useEffect, useCallback, useRef } from 'react'
import { API_ROUTES } from '@pogil/shared'

/**
 * Swipe horizontal tactile, robuste au scroll vertical incliné.
 * Ne déclenche que si le geste est franchement horizontal :
 *   |dx| ≥ threshold ET |dx| ≥ |dy| * ratio (sinon c'est un scroll vertical).
 * @returns {{ onTouchStart, onTouchEnd }} handlers à étaler sur l'élément.
 */
export function useSwipe({ onLeft, onRight, threshold = 60, ratio = 2 } = {}) {
  const start = useRef(null)
  return {
    onTouchStart: e => {
      if (e.touches.length !== 1) { start.current = null; return } // ignore pinch/multi-touch
      const t = e.touches[0]
      start.current = { x: t.clientX, y: t.clientY }
    },
    onTouchEnd: e => {
      if (!start.current) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.current.x
      const dy = t.clientY - start.current.y
      start.current = null
      if (Math.abs(dx) < threshold) return            // pas assez de course horizontale
      if (Math.abs(dx) < Math.abs(dy) * ratio) return // trajectoire trop verticale → scroll
      if (dx > 0) onRight?.()
      else onLeft?.()
    },
  }
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

// Breakpoint mobile/desktop, identique au reste de l'app (cf. JourDocApp).
const MOBILE_BREAKPOINT = 768

// true tant que la fenêtre est < MOBILE_BREAKPOINT (réactif au redimensionnement).
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const handler = e => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    setIsMobile(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

export function useJdData(wsId, token) {
  const [objets, setObjets]           = useState([])
  const [themes, setThemes]           = useState([])
  const [docCategories, setDocCategories] = useState([])
  const [docStatuts, setDocStatuts]   = useState([])
  const [searchDepth, setSearchDepth] = useState(3)
  const [pickerModes, setPickerModes] = useState({ mobile: 'filter', desktop: 'scroll' })
  const [loading, setLoading]         = useState(true)
  const isMobile = useIsMobile()

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [ro, rt, rw, rc, rs] = await Promise.all([
        fetch(API_ROUTES.JD_OBJETS(wsId), { headers: authHeader(token) }).then(r => r.json()),
        fetch(API_ROUTES.JD_THEMES(wsId), { headers: authHeader(token) }).then(r => r.json()),
        fetch(API_ROUTES.JD_WS(wsId), { headers: authHeader(token) }).then(r => r.json()),
        fetch(API_ROUTES.JD_DOC_CATEGORIES(wsId), { headers: authHeader(token) }).then(r => r.json()),
        fetch(API_ROUTES.JD_DOC_STATUTS(wsId), { headers: authHeader(token) }).then(r => r.json()),
      ])
      setObjets(ro.objets ?? [])
      setThemes(rt.themes ?? [])
      setDocCategories(rc.categories ?? [])
      setDocStatuts(rs.statuts ?? [])
      setSearchDepth(rw.workspace?.search_depth ?? 3)
      setPickerModes({
        mobile:  rw.workspace?.picker_mode_mobile  ?? 'filter',
        desktop: rw.workspace?.picker_mode_desktop ?? 'scroll',
      })
    } finally {
      setLoading(false)
    }
  }, [wsId, token])

  useEffect(() => { reload() }, [reload])

  // Mode résolu pour la plateforme courante : 'filter' (réduire) ou 'scroll' (défiler).
  const pickerMode = isMobile ? pickerModes.mobile : pickerModes.desktop
  return { objets, themes, docCategories, docStatuts, searchDepth, pickerMode, loading, reload }
}

// Style de badge pour la catégorie de documentation (couleur hex → fond translucide)
export function docCategorieBadgeStyle(couleur) {
  const c = couleur || '#d97706'
  return { background: `${c}22`, color: c, borderColor: `${c}55` }
}

// Icône + couleur d'une note, en tenant compte de la catégorie de documentation.
// Journal → nature ; documentation → sa catégorie (sinon repli 📄).
const NOTE_VISUAL = {
  observation:   { icon: '👁', couleur: 'var(--success)',    label: 'Observation' },
  activite:      { icon: '⚡', couleur: 'var(--accent)',     label: 'Activité' },
  mixte:         { icon: '🔀', couleur: '#db2777',           label: 'Observ.→Activité' },
  documentation: { icon: '📄', couleur: '#d97706',           label: 'Documentation' },
  journal:       { icon: '📔', couleur: 'var(--text-muted)', label: 'Journal' },
}
export function noteVisual(note) {
  if (note?.type === 'documentation' && note.doc_categorie) {
    const c = note.doc_categorie
    return { icon: c.icon || '📄', couleur: c.couleur || '#d97706', label: c.nom }
  }
  const key = note?.nature ?? note?.type ?? 'journal'
  return NOTE_VISUAL[key] ?? NOTE_VISUAL.journal
}

// Construit une Map id → chemin court (ex. "arb/fru/pom") depuis la liste plate
export function buildPathMap(items) {
  const map = new Map(items.map(i => [i.id, i]))
  const paths = new Map()
  function getPath(id) {
    if (paths.has(id)) return paths.get(id)
    const item = map.get(id)
    if (!item) return ''
    const short = item.nom_court || item.nom.slice(0, 3).toLowerCase()
    if (!item.parent_id) {
      paths.set(id, short)
      return short
    }
    const parentPath = getPath(item.parent_id)
    const path = parentPath ? `${parentPath}/${short}` : short
    paths.set(id, path)
    return path
  }
  for (const item of items) getPath(item.id)
  return paths
}

export function mediaUrl(wsId, id, token) {
  return `/api/jourdoc/${wsId}/medias/${id}/file?t=${token}`
}

// Réécrit les <img> média du contenu d'une note (src proxy stocké SANS token) vers le
// proxy authentifié, pour le rendu en lecture (RichTextView). Les data:/http externes
// ne sont pas touchés.
export function resolveContentImages(html, token) {
  if (!html) return html
  return html.replace(/(\/api\/jourdoc\/\d+\/medias\/\d+\/file)(?=["'\s>])/g, (m, url) => `${url}?t=${token}`)
}

export { authHeader }
