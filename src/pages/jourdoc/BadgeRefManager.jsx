import { useState, useEffect, useCallback } from 'react'
import { authHeader } from './hooks'

const PALETTE = ['#f59e0b', '#0ea5e9', '#8b5cf6', '#ef4444', '#10b981', '#ec4899', '#64748b', '#14b8a6']

/**
 * Gestion d'un référentiel de badges par workspace (catégories de doc, statuts…).
 * Chaque item : nom + emoji + couleur + ordre. Suppression = SET NULL sur les notes.
 *
 * Props :
 *  - wsId, token
 *  - listRoute(wsId)       → URL liste (GET / POST)
 *  - itemRoute(wsId, id)   → URL item (PUT / DELETE)
 *  - itemsKey              → clé du tableau dans la réponse GET ('categories' | 'statuts')
 *  - defaultEmoji, defaultColor, addPlaceholder, emptyLabel, term (« catégorie »/« statut »)
 */
export default function BadgeRefManager({
  wsId, token, listRoute, itemRoute, itemsKey,
  defaultEmoji = '🏷️', defaultColor = PALETTE[1],
  addPlaceholder = 'Nouvel élément…', emptyLabel = 'Aucun élément.', term = 'élément',
}) {
  const [items, setItems] = useState([])
  const [nom, setNom]     = useState('')
  const [icon, setIcon]   = useState(defaultEmoji)
  const [couleur, setCol] = useState(defaultColor)
  const [busy, setBusy]   = useState(false)

  const load = useCallback(() => {
    fetch(listRoute(wsId), { headers: authHeader(token) })
      .then(r => r.json()).then(d => setItems(d[itemsKey] ?? []))
  }, [wsId, token, listRoute, itemsKey])

  useEffect(() => { load() }, [load])

  async function add() {
    if (!nom.trim() || busy) return
    setBusy(true)
    await fetch(listRoute(wsId), {
      method: 'POST', headers: authHeader(token),
      body: JSON.stringify({ nom: nom.trim(), icon, couleur }),
    })
    setNom(''); setIcon(defaultEmoji); setCol(defaultColor); setBusy(false)
    load()
  }

  async function save(it) {
    await fetch(itemRoute(wsId, it.id), {
      method: 'PUT', headers: authHeader(token),
      body: JSON.stringify({ nom: it.nom, icon: it.icon, couleur: it.couleur, ordre: it.ordre }),
    })
  }

  function patchLocal(id, p) {
    setItems(cs => cs.map(c => c.id === id ? { ...c, ...p } : c))
  }

  async function remove(it) {
    const msg = it.note_count > 0
      ? `Supprimer « ${it.nom} » ? ${it.note_count} note${it.note_count > 1 ? 's' : ''} perdront ce ${term} (sans être supprimées).`
      : `Supprimer « ${it.nom} » ?`
    if (!confirm(msg)) return
    await fetch(itemRoute(wsId, it.id), { method: 'DELETE', headers: authHeader(token) })
    load()
  }

  async function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const a = items[i], b = items[j]
    await Promise.all([save({ ...a, ordre: b.ordre }), save({ ...b, ordre: a.ordre })])
    load()
  }

  return (
    <div className="doc-cat-manager">
      <ul className="doc-cat-list">
        {items.map((it, i) => (
          <li key={it.id} className="doc-cat-row" style={{ borderLeft: `4px solid ${it.couleur || '#d97706'}` }}>
            <input className="doc-cat-emoji" value={it.icon ?? ''} maxLength={2}
              onChange={e => patchLocal(it.id, { icon: e.target.value })}
              onBlur={() => save(it)} aria-label="Emoji" />
            <input className="input doc-cat-nom" value={it.nom}
              onChange={e => patchLocal(it.id, { nom: e.target.value })}
              onBlur={() => save(it)} />
            <input type="color" className="doc-cat-color" value={it.couleur || '#d97706'}
              onChange={e => patchLocal(it.id, { couleur: e.target.value })}
              onBlur={() => save(it)} aria-label="Couleur" />
            <span className="doc-cat-count">{it.note_count > 0 ? `${it.note_count}×` : ''}</span>
            <div className="doc-cat-actions">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Monter">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Descendre">↓</button>
              <button type="button" onClick={() => remove(it)} title="Supprimer" className="doc-cat-del">🗑</button>
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="doc-cat-empty">{emptyLabel}</li>}
      </ul>

      <div className="doc-cat-add">
        <input className="doc-cat-emoji" value={icon} maxLength={2}
          onChange={e => setIcon(e.target.value)} aria-label="Emoji" />
        <input className="input doc-cat-nom" placeholder={addPlaceholder} value={nom}
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
