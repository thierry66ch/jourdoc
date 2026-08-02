import { useState, useRef, useEffect, useMemo } from 'react'

/**
 * Filtre multi-select PLAT (éléments — pas de hiérarchie, pas de direction).
 * Reprend le look du HierarchyPicker (`.jd-picker`) en version simplifiée : pas de
 * chemin/parenté, juste une recherche + une liste à cocher + chips dans le trigger.
 *
 * `items` : liste d'éléments proposés (généralement ceux présents dans le jeu de notes
 * courant, comme les filtres thème/catégorie existants — voir ObjetDetail).
 * `value` : tableau d'ids sélectionnés. Sémantique OR : une note matche si elle porte
 * AU MOINS UN des éléments sélectionnés.
 */
export default function ElementFilterPicker({ items, value = [], onChange, placeholder = 'Filtrer par élément…' }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    function onClick(e) { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const sorted = useMemo(() =>
    [...items].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })), [items])
  const visible = useMemo(() => {
    if (!q.trim()) return sorted
    const lq = q.trim().toLowerCase()
    return sorted.filter(i => i.nom.toLowerCase().includes(lq))
  }, [sorted, q])

  const selectedSet = new Set(value)
  const selectedItems = items.filter(i => selectedSet.has(i.id))

  function toggle(id) {
    onChange(selectedSet.has(id) ? value.filter(x => x !== id) : [...value, id])
  }
  function removeValue(id) { onChange(value.filter(x => x !== id)) }

  return (
    <div className="jd-picker" style={{ position: 'relative' }} ref={rootRef}>
      <div className="input jd-picker__trigger" tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) } }}
        role="combobox" aria-expanded={open} aria-haspopup="listbox">
        {selectedItems.length > 0 ? (
          <div className="jd-picker__chips">
            {selectedItems.map(it => (
              <span key={it.id} className="jd-picker__chip">
                {it.nom}
                <button type="button" className="jd-picker__chip-remove" aria-label={`Retirer ${it.nom}`}
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); removeValue(it.id) }}
                  onClick={e => e.stopPropagation()}>×</button>
              </span>
            ))}
          </div>
        ) : (
          <span style={{ color: 'var(--text-subtle)', flex: 1 }}>{placeholder}</span>
        )}
        <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="jd-picker__dropdown">
          <div style={{ padding: '.375rem .375rem .25rem' }}>
            <input className="input" style={{ padding: '.4rem .6rem', fontSize: '.875rem' }}
              placeholder="Rechercher…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
          </div>
          <ul className="jd-picker__list" role="listbox">
            {visible.length === 0 && <li className="jd-picker__item" style={{ opacity: .6 }}>Aucun élément</li>}
            {visible.map(item => {
              const selected = selectedSet.has(item.id)
              return (
                <li key={item.id} role="option" aria-selected={selected}
                  className={`jd-picker__item${selected ? ' selected' : ''}`}
                  onClick={() => toggle(item.id)}>
                  <span className="jd-picker__nom">{item.nom}</span>
                  {selected && <span className="jd-picker__check">✓</span>}
                </li>
              )
            })}
          </ul>
          {value.length > 0 && (
            <div className="jd-picker__footer">
              {value.length} sélectionné{value.length > 1 ? 's' : ''}
              <button className="jd-picker__clear" onClick={() => onChange([])}>Effacer</button>
            </div>
          )}
        </div>
      )}
      {open && <div className="jd-picker__backdrop" onClick={() => setOpen(false)} />}
    </div>
  )
}
