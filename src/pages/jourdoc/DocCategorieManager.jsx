import { useState, useEffect, useCallback } from 'react'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'

const PALETTE = ['#f59e0b', '#0ea5e9', '#8b5cf6', '#ef4444', '#10b981', '#ec4899', '#64748b', '#14b8a6']

/**
 * Gestion des catégories de documentation d'un workspace (référentiel ouvert).
 * Chaque catégorie : nom + emoji + couleur + ordre. Suppression = SET NULL sur les notes.
 */
export default function DocCategorieManager({ wsId, token }) {
  const [cats, setCats]   = useState([])
  const [nom, setNom]     = useState('')
  const [icon, setIcon]   = useState('🏷️')
  const [couleur, setCol] = useState(PALETTE[1])
  const [busy, setBusy]   = useState(false)

  const load = useCallback(() => {
    fetch(API_ROUTES.JD_DOC_CATEGORIES(wsId), { headers: authHeader(token) })
      .then(r => r.json()).then(d => setCats(d.categories ?? []))
  }, [wsId, token])

  useEffect(() => { load() }, [load])

  async function add() {
    if (!nom.trim() || busy) return
    setBusy(true)
    await fetch(API_ROUTES.JD_DOC_CATEGORIES(wsId), {
      method: 'POST', headers: authHeader(token),
      body: JSON.stringify({ nom: nom.trim(), icon, couleur }),
    })
    setNom(''); setIcon('🏷️'); setCol(PALETTE[1]); setBusy(false)
    load()
  }

  async function save(cat) {
    await fetch(API_ROUTES.JD_DOC_CATEGORIE(wsId, cat.id), {
      method: 'PUT', headers: authHeader(token),
      body: JSON.stringify({ nom: cat.nom, icon: cat.icon, couleur: cat.couleur, ordre: cat.ordre }),
    })
  }

  function patchLocal(id, p) {
    setCats(cs => cs.map(c => c.id === id ? { ...c, ...p } : c))
  }

  async function remove(cat) {
    const msg = cat.note_count > 0
      ? `Supprimer « ${cat.nom} » ? ${cat.note_count} note${cat.note_count > 1 ? 's' : ''} perdront cette catégorie (sans être supprimées).`
      : `Supprimer « ${cat.nom} » ?`
    if (!confirm(msg)) return
    await fetch(API_ROUTES.JD_DOC_CATEGORIE(wsId, cat.id), { method: 'DELETE', headers: authHeader(token) })
    load()
  }

  async function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= cats.length) return
    const a = cats[i], b = cats[j]
    await Promise.all([save({ ...a, ordre: b.ordre }), save({ ...b, ordre: a.ordre })])
    load()
  }

  return (
    <div className="doc-cat-manager">
      <ul className="doc-cat-list">
        {cats.map((cat, i) => (
          <li key={cat.id} className="doc-cat-row" style={{ borderLeft: `4px solid ${cat.couleur || '#d97706'}` }}>
            <input className="doc-cat-emoji" value={cat.icon ?? ''} maxLength={2}
              onChange={e => patchLocal(cat.id, { icon: e.target.value })}
              onBlur={() => save(cat)} aria-label="Emoji" />
            <input className="input doc-cat-nom" value={cat.nom}
              onChange={e => patchLocal(cat.id, { nom: e.target.value })}
              onBlur={() => save(cat)} />
            <input type="color" className="doc-cat-color" value={cat.couleur || '#d97706'}
              onChange={e => patchLocal(cat.id, { couleur: e.target.value })}
              onBlur={() => save(cat)} aria-label="Couleur" />
            <span className="doc-cat-count">{cat.note_count > 0 ? `${cat.note_count}×` : ''}</span>
            <div className="doc-cat-actions">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Monter">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === cats.length - 1} title="Descendre">↓</button>
              <button type="button" onClick={() => remove(cat)} title="Supprimer" className="doc-cat-del">🗑</button>
            </div>
          </li>
        ))}
        {cats.length === 0 && <li className="doc-cat-empty">Aucune catégorie.</li>}
      </ul>

      <div className="doc-cat-add">
        <input className="doc-cat-emoji" value={icon} maxLength={2}
          onChange={e => setIcon(e.target.value)} aria-label="Emoji" />
        <input className="input doc-cat-nom" placeholder="Nouvelle catégorie…" value={nom}
          onChange={e => setNom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <input type="color" className="doc-cat-color" value={couleur}
          onChange={e => setCol(e.target.value)} aria-label="Couleur" />
        <button type="button" className="btn btn-primary doc-cat-add-btn"
          onClick={add} disabled={!nom.trim() || busy}>Ajouter</button>
      </div>
    </div>
  )
}
