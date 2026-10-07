import { useState, useEffect, useCallback } from 'react'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'
import ColorField from './ColorField'

// Gestion du référentiel unifié de catégories (migration 014).
//
// Chaque catégorie : emoji, nom, nom court (titre court auto), couleur, PORTÉE
// (observation / activité / documentation — jamais vide), nature par défaut (utile seulement
// si la portée journal est ambiguë), actif. Désactiver plutôt que supprimer : la
// suppression n'est permise que pour une catégorie portée par aucune note.

const PORTEES = [
  ['applique_observation', '👁 Observation'],
  ['applique_activite', '⚡ Activité'],
  ['applique_documentation', '📄 Documentation'],
]
const FILTRES = [['tout', 'Toutes'], ['journal', 'Interventions (journal)'], ['doc', 'Apports (doc)']]

export default function CategorieManager({ wsId, token }) {
  const [items, setItems] = useState([])
  const [filtre, setFiltre] = useState('tout')
  const [nom, setNom] = useState('')
  const [icon, setIcon] = useState('🏷️')
  const [couleur, setCouleur] = useState('#0ea5e9')
  const [portee, setPortee] = useState({ applique_observation: true, applique_activite: true, applique_documentation: true })
  const [erreur, setErreur] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch(API_ROUTES.JD_CATEGORIES(wsId), { headers: authHeader(token) })
      .then(r => r.json()).then(d => setItems(d.categories ?? []))
  }, [wsId, token])
  useEffect(() => { load() }, [load])

  const patchLocal = (id, p) => setItems(cs => cs.map(c => c.id === id ? { ...c, ...p } : c))

  async function save(it) {
    setErreur('')
    const res = await fetch(API_ROUTES.JD_CATEGORIE(wsId, it.id), {
      method: 'PUT', headers: authHeader(token), body: JSON.stringify(it),
    })
    if (!res.ok) { setErreur((await res.json().catch(() => ({}))).error || 'Erreur'); load() }
  }

  // Modification immédiate (cases à cocher, sélecteurs) : local + enregistrement.
  function changer(it, p) {
    const maj = { ...it, ...p }
    // Nature par défaut devenue incompatible avec la portée → effacée.
    const nd = maj.nature_defaut
    if (nd && !((nd === 'observation' && maj.applique_observation) || (nd === 'activite' && maj.applique_activite)
      || (nd === 'mixte' && maj.applique_observation && maj.applique_activite))) maj.nature_defaut = null
    if (!maj.applique_observation && !maj.applique_activite && !maj.applique_documentation) {
      setErreur('La portée ne peut pas être vide.'); return
    }
    patchLocal(it.id, maj)
    save(maj)
  }

  async function add() {
    if (!nom.trim() || busy) return
    setBusy(true); setErreur('')
    const res = await fetch(API_ROUTES.JD_CATEGORIES(wsId), {
      method: 'POST', headers: authHeader(token),
      body: JSON.stringify({ nom: nom.trim(), icon, couleur, ...portee }),
    })
    if (!res.ok) setErreur((await res.json().catch(() => ({}))).error || 'Erreur')
    else { setNom(''); setIcon('🏷️') }
    setBusy(false); load()
  }

  async function remove(it) {
    if (it.note_count > 0) {
      if (confirm(`« ${it.nom} » est portée par ${it.note_count} note(s) : on ne peut pas la supprimer. La désactiver (masquée à la saisie, conservée sur les notes) ?`))
        changer(it, { actif: false })
      return
    }
    if (!confirm(`Supprimer « ${it.nom} » ?`)) return
    const res = await fetch(API_ROUTES.JD_CATEGORIE(wsId, it.id), { method: 'DELETE', headers: authHeader(token) })
    if (!res.ok) setErreur((await res.json().catch(() => ({}))).error || 'Erreur')
    load()
  }

  async function move(it, dir) {
    const i = items.findIndex(x => x.id === it.id), j = i + dir
    if (j < 0 || j >= items.length) return
    const ids = items.map(x => x.id);[ids[i], ids[j]] = [ids[j], ids[i]]
    await fetch(API_ROUTES.JD_CATEGORIES_REORDER(wsId), { method: 'POST', headers: authHeader(token), body: JSON.stringify({ ids }) })
    load()
  }

  const visibles = items.filter(c =>
    filtre === 'journal' ? (c.applique_observation || c.applique_activite)
    : filtre === 'doc' ? c.applique_documentation : true)

  return (
    <div className="doc-cat-manager">
      <div className="jd-segmented cat-mgr-filtre">
        {FILTRES.map(([v, l]) => (
          <button key={v} type="button" className={`jd-seg-btn${filtre === v ? ' active' : ''}`} onClick={() => setFiltre(v)}>{l}</button>
        ))}
      </div>
      {erreur && <p className="msg msg-error">{erreur}</p>}

      <ul className="doc-cat-list">
        {visibles.map(it => {
          const ambigu = it.applique_observation && it.applique_activite
          return (
            <li key={it.id} className={`doc-cat-row cat-mgr-row${it.actif ? '' : ' cat-mgr-row--inactive'}`}
              style={{ borderLeft: `4px solid ${it.couleur || '#d97706'}` }}>
              <input className="doc-cat-emoji" value={it.icon ?? ''} maxLength={2}
                onChange={e => patchLocal(it.id, { icon: e.target.value })} onBlur={() => save(it)} aria-label="Emoji" />
              <input className="input doc-cat-nom" value={it.nom}
                onChange={e => patchLocal(it.id, { nom: e.target.value })} onBlur={() => save(it)} />
              <input className="input cat-mgr-court" value={it.nom_court ?? ''} placeholder="court"
                title="Nom court (titre court auto-généré)"
                onChange={e => patchLocal(it.id, { nom_court: e.target.value })} onBlur={() => save(it)} />
              <ColorField value={it.couleur || '#d97706'}
                onChange={c => patchLocal(it.id, { couleur: c })} onClose={() => save(it)} />
              <span className="doc-cat-count">{it.note_count > 0 ? `${it.note_count}×` : ''}</span>
              <div className="doc-cat-actions">
                <button type="button" onClick={() => move(it, -1)} title="Monter">↑</button>
                <button type="button" onClick={() => move(it, 1)} title="Descendre">↓</button>
                <button type="button" onClick={() => changer(it, { actif: !it.actif })}
                  title={it.actif ? 'Désactiver (masquée à la saisie, conservée sur les notes)' : 'Réactiver'}>
                  {it.actif ? '👁' : '🚫'}
                </button>
                <button type="button" onClick={() => remove(it)} title="Supprimer" className="doc-cat-del">🗑</button>
              </div>
              <div className="cat-mgr-portee">
                <span>Portée :</span>
                {PORTEES.map(([k, l]) => (
                  <label key={k}>
                    <input type="checkbox" checked={!!it[k]} onChange={e => changer(it, { [k]: e.target.checked })} /> {l}
                  </label>
                ))}
                {ambigu && (
                  <label title="Nature pré-sélectionnée quand on choisit d'abord cette catégorie">
                    défaut :
                    <select className="input" value={it.nature_defaut ?? ''}
                      onChange={e => changer(it, { nature_defaut: e.target.value || null })}>
                      <option value="">—</option>
                      <option value="observation">observation</option>
                      <option value="activite">activité</option>
                      <option value="mixte">mixte</option>
                    </select>
                  </label>
                )}
              </div>
            </li>
          )
        })}
        {visibles.length === 0 && <li className="doc-cat-empty">Aucune catégorie.</li>}
      </ul>

      <div className="doc-cat-add">
        <input className="doc-cat-emoji" value={icon} maxLength={2} onChange={e => setIcon(e.target.value)} aria-label="Emoji" />
        <input className="input doc-cat-nom" placeholder="Nouvelle catégorie…" value={nom}
          onChange={e => setNom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <ColorField value={couleur} onChange={setCouleur} />
        <button type="button" className="btn btn-primary doc-cat-add-btn" onClick={add} disabled={!nom.trim() || busy}>Ajouter</button>
        <div className="cat-mgr-portee" style={{ paddingLeft: 0 }}>
          <span>Portée :</span>
          {PORTEES.map(([k, l]) => (
            <label key={k}>
              <input type="checkbox" checked={portee[k]} onChange={e => setPortee(p => ({ ...p, [k]: e.target.checked }))} /> {l}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
