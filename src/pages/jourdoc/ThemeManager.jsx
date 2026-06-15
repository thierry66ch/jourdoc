import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { useJdData, authHeader, buildPathMap } from './hooks'
import HierarchyPicker from './HierarchyPicker'

function buildTree(items) {
  const map = new Map(items.map(i => [i.id, { ...i, children: [] }]))
  const roots = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id).children.push(node)
    else roots.push(node)
  }
  return roots
}

function getDescendantIds(id, items) {
  const result = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    for (const item of items) {
      if (item.parent_id !== null && result.has(item.parent_id) && !result.has(item.id)) {
        result.add(item.id); changed = true
      }
    }
  }
  return result
}

function ThemeNode({ node, wsId, token, onReload, allThemes, depth = 0 }) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ nom: node.nom, nom_court: node.nom_court ?? '', parent_id: node.parent_id ?? null })
  const [addingChild, setAddingChild] = useState(false)
  const [childNom, setChildNom] = useState('')
  const [childCourt, setChildCourt] = useState('')
  const [open, setOpen] = useState(depth < 2)

  const pathMap = useMemo(() => buildPathMap(allThemes), [allThemes])
  const parentOptions = useMemo(() => {
    const excluded = getDescendantIds(node.id, allThemes)
    return allThemes
      .filter(t => !excluded.has(t.id))
      .sort((a, b) => (pathMap.get(a.id) ?? a.nom).localeCompare(pathMap.get(b.id) ?? b.nom))
  }, [node.id, allThemes, pathMap])

  async function save() {
    await fetch(API_ROUTES.JD_THEME(wsId, node.id), {
      method: 'PUT', headers: authHeader(token),
      body: JSON.stringify({ ...form })
    })
    onReload(); setEditing(false)
  }

  async function remove() {
    if (!confirm(`Supprimer "${node.nom}" ?`)) return
    await fetch(API_ROUTES.JD_THEME(wsId, node.id), { method: 'DELETE', headers: authHeader(token) })
    onReload()
  }

  async function addChild() {
    if (!childNom) return
    await fetch(API_ROUTES.JD_THEMES(wsId), {
      method: 'POST', headers: authHeader(token),
      body: JSON.stringify({ nom: childNom, nom_court: childCourt, parent_id: node.id })
    })
    onReload(); setAddingChild(false); setChildNom(''); setChildCourt('')
  }

  return (
    <div className="jd-tree-node" style={{ marginLeft: depth ? '1.25rem' : 0 }}>
      <div className="jd-tree-row">
        {node.children.length > 0
          ? <button className="jd-tree-toggle" onClick={() => setOpen(o => !o)}>{open ? '▾' : '▸'}</button>
          : <span className="jd-tree-leaf">·</span>}

        {editing ? (
          <div className="jd-tree-edit">
            <input className="input" style={{ padding: '.25rem .5rem', fontSize: '.875rem', minWidth: '120px' }}
              value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} autoFocus />
            <input className="input" style={{ padding: '.25rem .5rem', fontSize: '.875rem', width: '72px' }}
              placeholder="court" value={form.nom_court}
              onChange={e => setForm(f => ({ ...f, nom_court: e.target.value }))} />
            <div style={{ minWidth: '200px', flex: 1 }}>
              <HierarchyPicker
                items={parentOptions}
                value={form.parent_id}
                onChange={v => setForm(f => ({ ...f, parent_id: v }))}
                mode="single"
                nullable
                nullLabel="— Racine —"
                placeholder="Choisir un parent…"
              />
            </div>
            <button className="btn btn-primary" style={{ padding: '.25rem .6rem', fontSize: '.8rem' }} onClick={save}>✓</button>
            <button className="btn btn-ghost" style={{ padding: '.25rem .6rem', fontSize: '.8rem' }} onClick={() => setEditing(false)}>✕</button>
          </div>
        ) : (
          <div className="jd-tree-label">
            <span
              className="jd-name-link jd-groupe"
              onClick={() => navigate(`/jourdoc/${wsId}/theme/${node.id}`)}
              title="Voir les notes"
            >
              {node.nom}
            </span>
            {node.nom_court && <span className="jd-short">({node.nom_court})</span>}
            <div className="jd-tree-actions">
              <button className="icon-btn" title="Modifier" onClick={() => setEditing(true)} style={{ width: 28, height: 28 }}>✏️</button>
              <button className="icon-btn" title="Ajouter sous-thème" onClick={() => setAddingChild(true)} style={{ width: 28, height: 28 }}>＋</button>
              <button className="icon-btn" title="Supprimer" onClick={remove} style={{ width: 28, height: 28, color: 'var(--danger)' }}>🗑</button>
            </div>
          </div>
        )}
      </div>

      {addingChild && (
        <div className="jd-tree-add" style={{ marginLeft: '1.5rem' }}>
          <input className="input" style={{ flex: 1, padding: '.25rem .5rem', fontSize: '.875rem' }}
            placeholder="Nom" value={childNom} onChange={e => setChildNom(e.target.value)} autoFocus />
          <input className="input" style={{ width: '72px', padding: '.25rem .5rem', fontSize: '.875rem' }}
            placeholder="court" value={childCourt} onChange={e => setChildCourt(e.target.value)} />
          <button className="btn btn-primary" style={{ padding: '.25rem .6rem', fontSize: '.8rem' }} onClick={addChild}>Ajouter</button>
          <button className="btn btn-ghost" style={{ padding: '.25rem .6rem', fontSize: '.8rem' }}
            onClick={() => { setAddingChild(false); setChildNom(''); setChildCourt('') }}>Annuler</button>
        </div>
      )}

      {open && node.children.map(child => (
        <ThemeNode key={child.id} node={child} wsId={wsId} token={token}
          onReload={onReload} allThemes={allThemes} depth={depth + 1} />
      ))}
    </div>
  )
}

export default function ThemeManager() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const { themes, reload } = useJdData(wsId, token)
  const [newNom, setNewNom] = useState('')
  const [newCourt, setNewCourt] = useState('')
  const tree = buildTree(themes)

  async function addRoot() {
    if (!newNom) return
    await fetch(API_ROUTES.JD_THEMES(wsId), {
      method: 'POST', headers: authHeader(token),
      body: JSON.stringify({ nom: newNom, nom_court: newCourt, parent_id: null })
    })
    reload(); setNewNom(''); setNewCourt('')
  }

  return (
    <div className="jd-manager">
      <h2 className="jd-manager__title">🏷️ Thèmes</h2>
      <div className="jd-tree">
        {tree.map(node => (
          <ThemeNode key={node.id} node={node} wsId={wsId} token={token}
            onReload={reload} allThemes={themes} />
        ))}
      </div>
      <div className="jd-tree-add" style={{ marginTop: '1rem' }}>
        <input className="input" style={{ flex: 1, padding: '.35rem .6rem', fontSize: '.9rem' }}
          placeholder="Nouveau thème racine…" value={newNom}
          onChange={e => setNewNom(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addRoot()} />
        <input className="input" style={{ width: '90px', padding: '.35rem .6rem', fontSize: '.9rem' }}
          placeholder="court" value={newCourt}
          onChange={e => setNewCourt(e.target.value)} />
        <button className="btn btn-secondary" onClick={addRoot}>+ Ajouter</button>
      </div>
    </div>
  )
}
