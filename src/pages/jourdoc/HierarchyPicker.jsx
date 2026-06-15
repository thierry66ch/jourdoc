import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { buildPathMap } from './hooks'

function buildSortPath(items) {
  const map = new Map(items.map(i => [i.id, i]))
  const cache = new Map()
  function get(id) {
    if (cache.has(id)) return cache.get(id)
    const item = map.get(id)
    if (!item) return ''
    const seg = item.nom
    const path = item.parent_id ? `${get(item.parent_id)}/${seg}` : seg
    cache.set(id, path)
    return path
  }
  for (const i of items) get(i.id)
  return cache
}

/**
 * Sélecteur hiérarchique avec recherche textuelle et navigation clavier.
 * mode="single"  → valeur unique (id ou null)
 * mode="multi"   → tableau d'ids
 * nullable=true  → affiche "— option racine —" en tête (valeur null)
 */
export default function HierarchyPicker({
  items, value, onChange, mode = 'single',
  placeholder = 'Rechercher…', label,
  nullable = false, nullLabel = '— Racine —',
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(0)
  const searchRef = useRef(null)
  const listRef = useRef(null)
  const scrollToRef = useRef(false) // true = navigation clavier/recherche, scroll autorisé
  const pathMap = useMemo(() => buildPathMap(items), [items])
  const sortPathMap = useMemo(() => buildSortPath(items), [items])

  const sortedItems = useMemo(() =>
    [...items].sort((a, b) =>
      (sortPathMap.get(a.id) ?? a.nom).localeCompare(sortPathMap.get(b.id) ?? b.nom, 'fr', { sensitivity: 'base' })
    )
  , [items, sortPathMap])

  // Liste complète : option racine éventuelle + items triés
  const baseItems = useMemo(() =>
    nullable ? [{ id: null, nom: nullLabel, nom_court: '' }, ...sortedItems] : sortedItems
  , [sortedItems, nullable, nullLabel])

  // Ids correspondant à la recherche (highlight + scroll)
  const matchedIds = useMemo(() => {
    if (!q) return null
    const lq = q.toLowerCase()
    const ids = new Set()
    for (const i of baseItems) {
      if (i.id === null) continue
      if (i.nom.toLowerCase().includes(lq) || (i.nom_court ?? '').toLowerCase().includes(lq))
        ids.add(i.id)
    }
    return ids
  }, [baseItems, q])

  const firstMatchIdx = useMemo(() => {
    if (!matchedIds) return 0
    const idx = baseItems.findIndex(i => i.id !== null && matchedIds.has(i.id))
    return idx >= 0 ? idx : 0
  }, [baseItems, matchedIds])

  // Positionner le focus sur la première correspondance quand la recherche change
  useEffect(() => {
    scrollToRef.current = true
    setFocusedIdx(firstMatchIdx)
  }, [firstMatchIdx])

  // Scroll uniquement si déclenché par clavier ou recherche (pas par survol souris)
  useEffect(() => {
    if (!scrollToRef.current) return
    scrollToRef.current = false
    if (!listRef.current) return
    const el = listRef.current.querySelectorAll('li')[focusedIdx]
    if (!el) return
    el.scrollIntoView({ block: 'nearest' })
  }, [focusedIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => {
    setOpen(false)
    setQ('')
    setFocusedIdx(0)
  }, [])

  function select(id) {
    if (mode === 'single') {
      onChange(id)
      close()
    } else {
      const arr = value ?? []
      onChange(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])
    }
  }

  function isSelected(id) {
    return mode === 'single' ? value === id : (value ?? []).includes(id)
  }

  function displayValue() {
    if (mode === 'single') {
      if (value === null && nullable) return nullLabel
      const item = items.find(i => i.id === value)
      return item ? item.nom : ''
    }
    const sel = (value ?? []).map(id => items.find(i => i.id === id)?.nom).filter(Boolean)
    return sel.length ? sel.join(', ') : ''
  }

  function handleTriggerKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(o => {
        if (!o) setTimeout(() => searchRef.current?.focus(), 30)
        return !o
      })
    }
  }

  function handleSearchKey(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        scrollToRef.current = true
        setFocusedIdx(i => Math.min(i + 1, baseItems.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        scrollToRef.current = true
        setFocusedIdx(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (baseItems.length > 0) select(baseItems[focusedIdx]?.id ?? baseItems[0].id)
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
      default:
        break
    }
  }

  const hasValue = mode === 'single' ? (value !== null && value !== undefined) : (value ?? []).length > 0
  const displayText = displayValue()

  return (
    <div className="jd-picker" style={{ position: 'relative' }}>
      {label && <label className="form-label">{label}</label>}

      {/* Trigger */}
      <div
        className="input jd-picker__trigger"
        tabIndex={0}
        onClick={() => {
          setOpen(o => {
            if (!o) setTimeout(() => searchRef.current?.focus(), 30)
            return !o
          })
        }}
        onKeyDown={handleTriggerKey}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span style={{ color: hasValue ? 'var(--text)' : 'var(--text-subtle)', flex: 1 }}>
          {displayText || placeholder}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="jd-picker__dropdown">
          <div style={{ padding: '.375rem .375rem .25rem' }}>
            <input
              ref={searchRef}
              className="input"
              style={{ padding: '.4rem .6rem', fontSize: '.875rem' }}
              placeholder="Rechercher… (↑↓ naviguer, Entrée valider, Échap fermer)"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={handleSearchKey}
              autoFocus
            />
          </div>
          {matchedIds !== null && (
            <div className="jd-picker__match-count">
              {matchedIds.size === 0 ? 'Aucun résultat' : `${matchedIds.size} correspondance${matchedIds.size > 1 ? 's' : ''}`}
            </div>
          )}
          <ul ref={listRef} className="jd-picker__list" role="listbox">
            {baseItems.map((item, idx) => {
              const path = item.id !== null ? (pathMap.get(item.id) ?? '') : ''
              const selected = isSelected(item.id)
              const focused = idx === focusedIdx
              const matched = matchedIds !== null && item.id !== null && matchedIds.has(item.id)
              return (
                <li
                  key={item.id ?? '__null__'}
                  role="option"
                  aria-selected={selected}
                  className={[
                    'jd-picker__item',
                    selected ? 'selected' : '',
                    focused  ? 'focused'  : '',
                    matched  ? 'matched'  : '',
                    item.id === null ? 'jd-picker__root' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => select(item.id)}
                  onMouseEnter={() => setFocusedIdx(idx)}
                >
                  <span className="jd-picker__nom">{item.nom}</span>
                  {path && <span className="jd-picker__path">({path})</span>}
                  {selected && <span className="jd-picker__check">✓</span>}
                </li>
              )
            })}
          </ul>
          {mode === 'multi' && (value ?? []).length > 0 && (
            <div className="jd-picker__footer">
              {(value ?? []).length} sélectionné{(value ?? []).length > 1 ? 's' : ''}
              <button className="jd-picker__clear" onClick={() => onChange([])}>Effacer</button>
            </div>
          )}
        </div>
      )}
      {open && <div className="jd-picker__backdrop" onClick={close} />}
    </div>
  )
}
