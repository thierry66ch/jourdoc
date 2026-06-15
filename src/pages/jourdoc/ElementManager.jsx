import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'

export default function ElementManager() {
  const { wsId }  = useParams()
  const { token } = useAuth()
  const navigate  = useNavigate()

  const [elements, setElements] = useState([])
  const [editing,  setEditing]  = useState({})  // id → nom en cours
  const [merge,    setMerge]    = useState(new Set())
  const [target,   setTarget]   = useState('')
  const [msg,      setMsg]      = useState('')

  const load = useCallback(() => {
    fetch(API_ROUTES.JD_ELEMENTS(wsId), { headers: authHeader(token) })
      .then(r => r.json()).then(d => setElements(d.elements ?? []))
  }, [wsId, token])

  useEffect(() => { load() }, [load])

  async function rename(id, nom) {
    await fetch(API_ROUTES.JD_ELEMENT(wsId, id), {
      method: 'PUT', headers: authHeader(token), body: JSON.stringify({ nom }),
    })
    setEditing(e => { const n = { ...e }; delete n[id]; return n })
    load()
  }

  async function del(id, nom) {
    if (!confirm(`Supprimer l'élément "${nom}" ?`)) return
    const res = await fetch(API_ROUTES.JD_ELEMENT(wsId, id), { method: 'DELETE', headers: authHeader(token) })
    const d = await res.json()
    if (!res.ok) { setMsg(d.error ?? 'Erreur'); return }
    load()
  }

  async function doMerge() {
    if (!target.trim() || merge.size === 0) return
    await fetch(API_ROUTES.JD_ELEMENTS_MERGE(wsId), {
      method: 'POST', headers: authHeader(token),
      body: JSON.stringify({ source_ids: [...merge], target_nom: target }),
    })
    setMerge(new Set()); setTarget('')
    setMsg('Fusion effectuée.'); setTimeout(() => setMsg(''), 3000)
    load()
  }

  return (
    <div className="jd-objet-detail">
      <div className="jd-form-header">
        <button className="btn btn-ghost" style={{ padding: '.35rem .6rem', fontSize: '.875rem' }}
          onClick={() => navigate(-1)}>← Retour</button>
        <h2 style={{ flex: 1 }}>🔩 Éléments</h2>
      </div>

      {msg && <p style={{ color: 'var(--success)', fontSize: '.875rem', marginBottom: '.5rem' }}>{msg}</p>}

      {elements.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🔩</div>
          <p>Aucun élément créé — ils apparaissent ici quand vous les ajoutez à des notes.</p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>
            {merge.size > 0
              ? `${merge.size} élément${merge.size > 1 ? 's' : ''} sélectionné${merge.size > 1 ? 's' : ''} — entrez un nom cible pour fusionner.`
              : 'Cochez des éléments pour les fusionner.'}
          </p>

          {/* Zone de fusion */}
          {merge.size >= 1 && (
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', padding: '.625rem', background: 'var(--accent-bg)', borderRadius: 'var(--r)', marginBottom: '.75rem' }}>
              <span style={{ fontSize: '.8125rem' }}>Fusionner {merge.size} élément{merge.size > 1 ? 's' : ''} →</span>
              <input className="input" style={{ flex: 1, minWidth: 160, padding: '.3rem .5rem', fontSize: '.875rem' }}
                placeholder="Nom cible…" value={target} onChange={e => setTarget(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doMerge()} />
              <button className="btn btn-primary" style={{ fontSize: '.8rem' }}
                onClick={doMerge} disabled={!target.trim()}>Fusionner</button>
              <button className="btn btn-ghost" style={{ fontSize: '.8rem' }}
                onClick={() => { setMerge(new Set()); setTarget('') }}>Annuler</button>
            </div>
          )}

          {/* Liste */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
            {elements.map(el => (
              <div key={el.id} className="todoist-task-row" style={{ padding: '.5rem .75rem' }}>
                <input type="checkbox" checked={merge.has(el.id)}
                  onChange={() => setMerge(s => { const n = new Set(s); n.has(el.id) ? n.delete(el.id) : n.add(el.id); return n })}
                  style={{ flexShrink: 0 }} />

                {editing[el.id] !== undefined ? (
                  <input className="input" style={{ flex: 1, padding: '.25rem .5rem', fontSize: '.875rem' }}
                    value={editing[el.id]}
                    onChange={e => setEditing(ed => ({ ...ed, [el.id]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') rename(el.id, editing[el.id])
                      if (e.key === 'Escape') setEditing(ed => { const n = { ...ed }; delete n[el.id]; return n })
                    }}
                    autoFocus />
                ) : (
                  <span style={{ flex: 1, fontSize: '.9375rem' }}>{el.nom}</span>
                )}

                <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {el.note_count} note{el.note_count !== 1 ? 's' : ''}
                </span>
                <button className="btn btn-ghost" style={{ fontSize: '.75rem', padding: '.2rem .5rem' }}
                  onClick={() => setEditing(ed => ({ ...ed, [el.id]: el.nom }))}>✏️</button>
                {Number(el.note_count) === 0 && (
                  <button className="btn btn-ghost" style={{ fontSize: '.75rem', padding: '.2rem .5rem', color: 'var(--danger)' }}
                    onClick={() => del(el.id, el.nom)}>🗑</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
