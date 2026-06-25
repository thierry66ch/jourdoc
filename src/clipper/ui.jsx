// src/clipper/ui.js — styles et helpers partagés du bundle clipper.
// Tout est inline (le bundle vit en shadow DOM, isolé des styles de la page hôte).

import React from 'react'

export const authHeader = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
})

const ACCENT = '#6366f1'
const FIELD_BG = '#0f0f1a'
const BORDER = '#33334d'

export const S = {
  panel: {
    position: 'fixed', top: '20px', right: '20px', zIndex: 2147483647,
    width: '340px', maxWidth: 'calc(100vw - 24px)',
    background: '#1a1a2e', color: '#e6e6f0',
    borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,.45)',
    font: '14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    overflow: 'hidden',
  },
  head: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', background: ACCENT, color: '#fff', fontWeight: 600,
  },
  steps: { fontSize: '11px', opacity: .85, fontWeight: 500 },
  close: {
    cursor: 'pointer', background: 'transparent', border: 0, color: '#fff',
    fontSize: '20px', lineHeight: 1, width: '32px', height: '32px',
  },
  body: { padding: '14px' },
  btn: {
    display: 'block', width: '100%', minHeight: '48px', marginTop: '12px',
    cursor: 'pointer', border: 0, borderRadius: '8px',
    background: ACCENT, color: '#fff', fontWeight: 600, fontSize: '15px',
  },
  btnGhost: {
    display: 'block', width: '100%', minHeight: '44px', marginTop: '8px',
    cursor: 'pointer', border: `1px solid ${BORDER}`, borderRadius: '8px',
    background: 'transparent', color: '#e6e6f0', fontWeight: 600, fontSize: '14px',
  },
  field: {
    display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '6px',
    padding: '10px', borderRadius: '8px', border: `1px solid ${BORDER}`,
    background: FIELD_BG, color: '#e6e6f0', fontSize: '14px',
  },
  label: { display: 'block', marginTop: '12px', fontSize: '12px', opacity: .8 },
  note: { fontSize: '12px', opacity: .6, marginTop: '10px' },
  err: { fontSize: '12px', color: '#ff9d9d', marginTop: '10px' },
  list: {
    marginTop: '6px', maxHeight: '150px', overflowY: 'auto',
    border: `1px solid ${BORDER}`, borderRadius: '8px', background: FIELD_BG,
  },
  row: { display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '14px' },
}

export function Btn({ children, ghost, style, ...p }) {
  return <button style={{ ...(ghost ? S.btnGhost : S.btn), ...style }} {...p}>{children}</button>
}

// Aplati une liste hiérarchique (parent_id) en ordre d'arbre avec profondeur.
export function ordered(items) {
  const byParent = new Map()
  for (const it of items) {
    const p = it.parent_id ?? null
    if (!byParent.has(p)) byParent.set(p, [])
    byParent.get(p).push(it)
  }
  const out = []
  const walk = (parent, depth) => {
    const kids = (byParent.get(parent) || []).slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    for (const k of kids) { out.push({ ...k, depth }); walk(k.id, depth + 1) }
  }
  walk(null, 0)
  const seen = new Set(out.map((o) => o.id))
  for (const it of items) if (!seen.has(it.id)) out.push({ ...it, depth: 0 })
  return out
}

// Sélecteur multiple hiérarchique compact (filtre + liste à cases).
export function MultiPicker({ label, items, selected, onToggle }) {
  const [q, setQ] = React.useState('')
  const flat = React.useMemo(() => ordered(items), [items])
  const needle = q.trim().toLowerCase()
  const shown = needle ? flat.filter((it) => it.nom.toLowerCase().includes(needle)) : flat

  return (
    <div>
      <label style={S.label}>{label} {selected.length > 0 && <span style={{ opacity: .7 }}>· {selected.length}</span>}</label>
      {items.length > 6 && (
        <input style={S.field} placeholder="filtrer…" value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      <div style={S.list}>
        {shown.length === 0 && <div style={{ padding: '8px', opacity: .6, fontSize: '13px' }}>aucun</div>}
        {shown.map((it) => {
          const on = selected.includes(it.id)
          return (
            <label key={it.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px',
              paddingLeft: `${8 + (needle ? 0 : it.depth * 14)}px`, cursor: 'pointer',
              background: on ? 'rgba(99,102,241,.18)' : 'transparent', fontSize: '13px',
            }}>
              <input type="checkbox" checked={on} onChange={() => onToggle(it.id)} />
              <span>{it.nom}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
