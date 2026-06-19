import { useState, useEffect, useCallback } from 'react'
import { API_ROUTES } from '@pogil/shared'

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
  const [searchDepth, setSearchDepth] = useState(3)
  const [pickerModes, setPickerModes] = useState({ mobile: 'filter', desktop: 'scroll' })
  const [loading, setLoading]         = useState(true)
  const isMobile = useIsMobile()

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [ro, rt, rw, rc] = await Promise.all([
        fetch(API_ROUTES.JD_OBJETS(wsId), { headers: authHeader(token) }).then(r => r.json()),
        fetch(API_ROUTES.JD_THEMES(wsId), { headers: authHeader(token) }).then(r => r.json()),
        fetch(API_ROUTES.JD_WS(wsId), { headers: authHeader(token) }).then(r => r.json()),
        fetch(API_ROUTES.JD_DOC_CATEGORIES(wsId), { headers: authHeader(token) }).then(r => r.json()),
      ])
      setObjets(ro.objets ?? [])
      setThemes(rt.themes ?? [])
      setDocCategories(rc.categories ?? [])
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
  return { objets, themes, docCategories, searchDepth, pickerMode, loading, reload }
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

export { authHeader }
