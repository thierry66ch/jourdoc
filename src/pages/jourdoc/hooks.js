import { useState, useEffect, useCallback } from 'react'
import { API_ROUTES } from '@pogil/shared'

function authHeader(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export function useJdData(wsId, token) {
  const [objets, setObjets]           = useState([])
  const [themes, setThemes]           = useState([])
  const [searchDepth, setSearchDepth] = useState(3)
  const [loading, setLoading]         = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [ro, rt, rw] = await Promise.all([
        fetch(API_ROUTES.JD_OBJETS(wsId), { headers: authHeader(token) }).then(r => r.json()),
        fetch(API_ROUTES.JD_THEMES(wsId), { headers: authHeader(token) }).then(r => r.json()),
        fetch(API_ROUTES.JD_WS(wsId), { headers: authHeader(token) }).then(r => r.json()),
      ])
      setObjets(ro.objets ?? [])
      setThemes(rt.themes ?? [])
      setSearchDepth(rw.workspace?.search_depth ?? 3)
    } finally {
      setLoading(false)
    }
  }, [wsId, token])

  useEffect(() => { reload() }, [reload])
  return { objets, themes, searchDepth, loading, reload }
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
