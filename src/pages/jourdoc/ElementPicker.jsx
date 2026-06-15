import { useState, useRef, useEffect, useCallback } from 'react'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'

/**
 * Sélecteur d'éléments plat (non hiérarchique) avec création inline.
 * Gère sa propre liste d'éléments et la rafraîchit après création.
 */
export default function ElementPicker({ value = [], onChange, wsId, token }) {
  const [elements, setElements] = useState([])
  const [search, setSearch]     = useState('')
  const [open, setOpen]         = useState(false)
  const [creating, setCreating] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef(null)
  const dropRef  = useRef(null)

  const loadElements = useCallback(() => {
    fetch(API_ROUTES.JD_ELEMENTS(wsId), { headers: authHeader(token) })
      .then(r => r.json()).then(d => setElements(d.elements ?? []))
  }, [wsId, token])

  useEffect(() => { loadElements() }, [loadElements])

  useEffect(() => {
    function onClick(e) { if (!dropRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const selectedSet = new Set(value)
  const filtered = elements.filter(e =>
    e.nom.toLowerCase().includes(search.toLowerCase()) && !selectedSet.has(e.id)
  )
  const canCreate = search.trim() &&
    !elements.some(e => e.nom.toLowerCase() === search.trim().toLowerCase())
  const options = [...filtered, ...(canCreate ? [{ id: '__new__', nom: search.trim() }] : [])]

  const selectedElements = elements.filter(e => selectedSet.has(e.id))

  function select(id) {
    onChange([...value, id])
    setSearch(''); setOpen(false); setHighlightIdx(0)
    inputRef.current?.focus()
  }

  function remove(id) { onChange(value.filter(v => v !== id)) }

  async function createAndAdd(nom) {
    if (!nom.trim() || creating) return
    setCreating(true)
    try {
      const res = await fetch(API_ROUTES.JD_ELEMENTS(wsId), {
        method: 'POST', headers: authHeader(token),
        body: JSON.stringify({ nom: nom.trim() }),
      })
      const data = await res.json()
      if (data.id) {
        await loadElements()   // rafraîchit la liste pour que le chip affiche le nom
        onChange([...value, data.id])
        setSearch(''); setOpen(false)
      }
    } finally { setCreating(false) }
  }

  function handleKey(e) {
    if (!open && e.key !== 'Escape') setOpen(true)
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, options.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (options.length === 0) return
      const opt = options[highlightIdx] ?? options[0]
      if (opt.id === '__new__') createAndAdd(opt.nom)
      else select(opt.id)
    }
    if (e.key === 'Escape') setOpen(false)
    if (e.key === 'Backspace' && !search && value.length > 0)
      remove(value[value.length - 1])
  }

  return (
    <div className="element-picker" ref={dropRef}>
      <div className="element-picker__field">
        {selectedElements.map(e => (
          <span key={e.id} className="element-chip">
            {e.nom}
            <button type="button" className="element-chip__remove"
              onMouseDown={ev => { ev.preventDefault(); remove(e.id) }}>×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="element-picker__inline-input"
          placeholder={value.length === 0 ? 'Rechercher ou créer un élément… (Entrée)' : ''}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); setHighlightIdx(0) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
        />
      </div>

      {open && options.length > 0 && (
        <div className="element-picker__dropdown">
          {options.map((opt, i) => (
            <button key={opt.id} type="button"
              className={`element-picker__option${opt.id === '__new__' ? ' element-picker__create' : ''}${i === highlightIdx ? ' element-picker__option--hl' : ''}`}
              onMouseEnter={() => setHighlightIdx(i)}
              onMouseDown={ev => { ev.preventDefault(); opt.id === '__new__' ? createAndAdd(opt.nom) : select(opt.id) }}
              disabled={creating && opt.id === '__new__'}>
              {opt.id === '__new__' ? `✚ Créer "${opt.nom}"` : opt.nom}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
