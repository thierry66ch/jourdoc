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

function ObjetNode({ node, wsId, token, onReload, allObjets, depth = 0 }) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    nom: node.nom, nom_court: node.nom_court ?? '',
    est_individu: node.est_individu, parent_id: node.parent_id ?? null
  })
  const [addingChild, setAddingChild] = useState(false)
  const [childForm, setChildForm] = useState({ nom: '', nom_court: '', est_individu: false })
  const [open, setOpen] = useState(depth < 2)

  const pathMap = useMemo(() => buildPathMap(allObjets), [allObjets])
  const parentOptions = useMemo(() => {
    const excluded = getDescendantIds(node.id, allObjets)
    return allObjets
      .filter(o => !excluded.has(o.id))
      .sort((a, b) => (pathMap.get(a.id) ?? a.nom).localeCompare(pathMap.get(b.id) ?? b.nom))
  }, [node.id, allObjets, pathMap])

  async function save() {
    await fetch(API_ROUTES.JD_OBJET(wsId, node.id), {
      method: 'PUT', headers: authHeader(token),
      body: JSON.stringify({ ...form })
    })
    onReload(); setEditing(false)
  }

  async function remove() {
    if (!confirm(`Supprimer "${node.nom}" ?`)) return
    await fetch(API_ROUTES.JD_OBJET(wsId, node.id), { method: 'DELETE', headers: authHeader(token) })
    onReload()
  }

  async function addChild() {
    if (!childForm.nom) return
    await fetch(API_ROUTES.JD_OBJETS(wsId), {
      method: 'POST', headers: authHeader(token),
      body: JSON.stringify({ ...childForm, parent_id: node.id })
    })
    onReload(); setAddingChild(false); setChildForm({ nom: '', nom_court: '', est_individu: false })
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
            <label className="checkbox-row" style={{ fontSize: '.8rem' }}>
              <input type="checkbox" checked={form.est_individu}
                onChange={e => setForm(f => ({ ...f, est_individu: e.target.checked }))} />
              Individu
            </label>
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
              className={`jd-name-link ${node.est_individu ? 'jd-individu' : 'jd-groupe'}`}
              onClick={() => navigate(`/jourdoc/${wsId}/objet/${node.id}`)}
              title="Voir la fiche"
            >
              {node.nom}
            </span>
            {node.nom_court && <span className="jd-short">({node.nom_court})</span>}
            <div className="jd-tree-actions">
              <button className="icon-btn" title="Modifier" onClick={() => setEditing(true)} style={{ width: 28, height: 28 }}>✏️</button>
              <button className="icon-btn" title="Ajouter enfant" onClick={() => setAddingChild(true)} style={{ width: 28, height: 28 }}>＋</button>
              <button className="icon-btn" title="Supprimer" onClick={remove} style={{ width: 28, height: 28, color: 'var(--danger)' }}>🗑</button>
            </div>
          </div>
        )}
      </div>

      {addingChild && (
        <div className="jd-tree-add" style={{ marginLeft: '1.5rem' }}>
          <input className="input" style={{ padding: '.25rem .5rem', fontSize: '.875rem', flex: 1 }}
            placeholder="Nom" value={childForm.nom}
            onChange={e => setChildForm(f => ({ ...f, nom: e.target.value }))} autoFocus />
          <input className="input" style={{ padding: '.25rem .5rem', fontSize: '.875rem', width: '72px' }}
            placeholder="court" value={childForm.nom_court}
            onChange={e => setChildForm(f => ({ ...f, nom_court: e.target.value }))} />
          <label className="checkbox-row" style={{ fontSize: '.8rem' }}>
            <input type="checkbox" checked={childForm.est_individu}
              onChange={e => setChildForm(f => ({ ...f, est_individu: e.target.checked }))} />
            Individu
          </label>
          <button className="btn btn-primary" style={{ padding: '.25rem .6rem', fontSize: '.8rem' }} onClick={addChild}>Ajouter</button>
          <button className="btn btn-ghost" style={{ padding: '.25rem .6rem', fontSize: '.8rem' }} onClick={() => setAddingChild(false)}>Annuler</button>
        </div>
      )}

      {open && node.children.map(child => (
        <ObjetNode key={child.id} node={child} wsId={wsId} token={token}
          onReload={onReload} allObjets={allObjets} depth={depth + 1} />
      ))}
    </div>
  )
}

export default function ObjetManager() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const { objets, reload } = useJdData(wsId, token)
  const [newForm, setNewForm] = useState({ nom: '', nom_court: '', est_individu: false })
  const tree = buildTree(objets)

  async function addRoot() {
    if (!newForm.nom) return
    await fetch(API_ROUTES.JD_OBJETS(wsId), {
      method: 'POST', headers: authHeader(token),
      body: JSON.stringify({ ...newForm, parent_id: null })
    })
    reload(); setNewForm({ nom: '', nom_court: '', est_individu: false })
  }

  return (
    <div className="jd-manager">
      <h2 className="jd-manager__title">🌿 Objets</h2>
      <div className="jd-tree">
        {tree.map(node => (
          <ObjetNode key={node.id} node={node} wsId={wsId} token={token}
            onReload={reload} allObjets={objets} />
        ))}
      </div>
      <div className="jd-tree-add" style={{ marginTop: '1rem' }}>
        <input className="input" style={{ flex: 1, padding: '.35rem .6rem', fontSize: '.9rem' }}
          placeholder="Nouveau groupe racine…" value={newForm.nom}
          onChange={e => setNewForm(f => ({ ...f, nom: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && addRoot()} />
        <input className="input" style={{ width: '90px', padding: '.35rem .6rem', fontSize: '.9rem' }}
          placeholder="court" value={newForm.nom_court}
          onChange={e => setNewForm(f => ({ ...f, nom_court: e.target.value }))} />
        <button className="btn btn-secondary" onClick={addRoot}>+ Ajouter</button>
      </div>
    </div>
  )
}
