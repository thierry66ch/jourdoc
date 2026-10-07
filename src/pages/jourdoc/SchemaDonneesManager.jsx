// Administration des schémas de données étendues (Phase B.4).
//
// Comprend un SIMULATEUR de résolution : la contrainte d'unicité empêche deux schémas
// strictement identiques en contexte, mais pas la confusion entre schémas *proches*
// (ex. un schéma objet-only et un schéma nature-only qui se chevauchent). Le simulateur
// répond à « pour ce contexte, lequel s'applique ? » sans rejouer l'algorithme de tête.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader, useJdData } from './hooks'
import HierarchyPicker from './HierarchyPicker'

const TYPES = [
  ['texte_court', 'Texte court'], ['texte_long', 'Texte long'],
  ['nombre', 'Nombre'], ['decimal', 'Décimal'], ['echelle', 'Échelle'],
  ['select', 'Liste'], ['booleen', 'Oui/Non'], ['date', 'Date'],
]
const NATURES = [['', '— toutes —'], ['observation', '👁 Observation'], ['activite', '⚡ Activité'], ['mixte', '🔀 Mixte']]

const slug = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

const vide = () => ({ nom: '', objet_id: null, theme_id: null, categorie_id: null, nature: '', champs: [], actif: true })

export default function SchemaDonneesManager() {
  const { wsId } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()
  const { objets, themes, categories, pickerMode } = useJdData(wsId, token)

  const [schemas, setSchemas] = useState([])
  const [edit, setEdit] = useState(null)      // null | objet en cours d'édition
  // Catégorie du schéma édité (après `edit` : sinon accès avant déclaration → écran blanc).
  const catEdit = categories.find(c => c.id === edit?.categorie_id)
  const champLabelRefs = useRef([])           // focus auto du nouveau champ ajouté
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const d = await fetch(API_ROUTES.JD_SCHEMAS(wsId), { headers: authHeader(token) }).then(r => r.json())
    setSchemas(d.schemas ?? [])
  }, [wsId, token])
  useEffect(() => { load() }, [load])

  async function save() {
    setMsg('')
    const body = { ...edit, nature: edit.nature || null }
    const isNew = !edit.id
    const res = await fetch(isNew ? API_ROUTES.JD_SCHEMAS(wsId) : API_ROUTES.JD_SCHEMA(wsId, edit.id), {
      method: isNew ? 'POST' : 'PUT', headers: authHeader(token), body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(d.error || `Erreur ${res.status}`); return }
    setEdit(null); load()
  }

  async function supprimer(s) {
    if (!confirm(`Supprimer le schéma « ${s.nom} » ?\nLes données déjà saisies dans les notes sont conservées (elles deviendront « hors schéma »).`)) return
    await fetch(API_ROUTES.JD_SCHEMA(wsId, s.id), { method: 'DELETE', headers: authHeader(token) })
    load()
  }

  // ── Édition des champs ──
  const majChamp = (i, patch) => setEdit(e => ({ ...e, champs: e.champs.map((c, j) => j === i ? { ...c, ...patch } : c) }))
  // Le bouton « Ajouter » est en FIN de liste (là où la nouvelle ligne apparaît) : évite
  // le double-scroll ajouter→remonter→éditer→redescendre. Focus auto sur son libellé.
  function ajouterChamp() {
    const idx = edit.champs.length
    setEdit(x => ({ ...x, champs: [...x.champs, { cle: '', label: '', type: 'texte_court' }] }))
    requestAnimationFrame(() => champLabelRefs.current[idx]?.focus())
  }
  const bouger = (i, d) => setEdit(e => {
    const a = [...e.champs], j = i + d
    if (j < 0 || j >= a.length) return e
    ;[a[i], a[j]] = [a[j], a[i]]
    return { ...e, champs: a }
  })

  const ctxBadges = s => {
    const b = []
    if (s.objet_nom) b.push(`🌿 ${s.objet_nom}`)
    if (s.theme_nom) b.push(`🏷️ ${s.theme_nom}`)
    if (s.categorie_nom) b.push(`🗂️ ${s.categorie_nom}`)
    if (s.nature) b.push(`${s.nature === 'observation' ? '👁' : s.nature === 'activite' ? '⚡' : '🔀'} ${s.nature}`)
    return b.length ? b : ['— tous contextes —']
  }

  return (
    <div className="ws-manager">
      <button className="btn btn-ghost" style={{ marginBottom: '1rem' }} onClick={() => navigate(-1)}>← Retour</button>

      <div className="ws-manager__section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 className="ws-manager__title">📋 Schémas de données étendues</h3>
          {!edit && <button className="btn btn-primary" onClick={() => setEdit(vide())}>✚ Nouveau schéma</button>}
        </div>
        <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: '.3rem 0 0' }}>
          Un schéma définit les champs proposés selon le contexte de la note. Un axe laissé
          vide est un <b>joker</b> (« quel que soit… »). Le plus spécifique gagne.
        </p>
      </div>

      <Simulateur wsId={wsId} token={token} objets={objets} themes={themes}
        categories={categories} pickerMode={pickerMode} />

      {/* ── Éditeur ── */}
      {edit && (
        <div className="ws-manager__section">
          <h3 className="ws-manager__title">{edit.id ? 'Modifier' : 'Nouveau'} schéma</h3>

          <div className="form-field">
            <label className="form-label">Nom</label>
            <input className="input" value={edit.nom} placeholder="Ex : Évaluation fromage"
              onChange={e => setEdit(x => ({ ...x, nom: e.target.value }))} />
          </div>

          <div className="form-field">
            <label className="form-label">Contexte d'application</label>
            <p className="jd-schema-aide">
              🌿🏷️ <b>L'héritage descend</b> : un schéma défini sur « Arbres fruitiers »
              s'applique aussi à <b>tous ses objets enfants</b> (Pommiers, Pommier Golden…),
              idem pour les sous-thèmes — dans la limite de la profondeur de recherche du
              workspace. À contexte également spécifique, <b>le plus proche</b> dans la
              hiérarchie l'emporte ; à distance égale, l'objet prime sur le thème.
            </p>
            <HierarchyPicker items={objets} value={edit.objet_id}
              onChange={v => setEdit(x => ({ ...x, objet_id: v }))}
              nullable nullLabel="— tout objet —" placeholder="Objet…" filterMode={pickerMode} />
            <div style={{ height: '.4rem' }} />
            <HierarchyPicker items={themes} value={edit.theme_id}
              onChange={v => setEdit(x => ({ ...x, theme_id: v }))}
              nullable nullLabel="— tout thème —" placeholder="Thème…" filterMode={pickerMode} />
            <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem', flexWrap: 'wrap' }}>
              <select className="input" style={{ flex: 1, minWidth: '140px' }} value={edit.categorie_id ?? ''}
                onChange={e => setEdit(x => ({ ...x, categorie_id: e.target.value ? Number(e.target.value) : null }))}>
                <option value="">— toute catégorie —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon || '🏷️'} {c.nom}{c.actif ? '' : ' (inactive)'}</option>)}
              </select>
              <select className="input" style={{ flex: 1, minWidth: '140px' }} value={edit.nature ?? ''}
                onChange={e => setEdit(x => ({ ...x, nature: e.target.value }))}>
                {NATURES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {catEdit && edit.nature && !(
              edit.nature === 'observation' ? catEdit.applique_observation
              : edit.nature === 'activite' ? catEdit.applique_activite
              : (catEdit.applique_observation || catEdit.applique_activite)) && (
              <p className="msg msg-error" style={{ marginTop: '.4rem', fontSize: '.8rem' }}>
                ⚠️ La catégorie « {catEdit.nom} » ne s'applique pas à cette nature : ce schéma ne
                s'appliquera à aucune note.
              </p>
            )}
            <p className="jd-schema-aide" style={{ marginTop: '.4rem' }}>
              🗂️ Une note à <b>plusieurs catégories</b> réunit les champs du schéma de chacune
              (une clé commune n'apparaît qu'une fois). Une même <b>clé</b> doit donc avoir partout
              le même type, les mêmes options et la même unité — l'enregistrement le vérifie.
            </p>
          </div>

          <div className="form-field">
            <label className="form-label">Champs ({edit.champs.length})</label>

            {edit.champs.map((ch, i) => (
              <div key={i} className="jd-schema-champ">
                <div className="jd-schema-champ__head">
                  <input className="input" placeholder="Libellé (ex. Goût)" value={ch.label}
                    ref={el => { champLabelRefs.current[i] = el }}
                    onChange={e => majChamp(i, { label: e.target.value, cle: ch.cle || slug(e.target.value) })} />
                  <select className="input" value={ch.type} onChange={e => majChamp(i, { type: e.target.value })}>
                    {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <button type="button" className="jd-donnees-edit__remove" title="Monter"
                    onClick={() => bouger(i, -1)} disabled={i === 0}>↑</button>
                  <button type="button" className="jd-donnees-edit__remove" title="Descendre"
                    onClick={() => bouger(i, 1)} disabled={i === edit.champs.length - 1}>↓</button>
                  <button type="button" className="jd-donnees-edit__remove" title="Supprimer"
                    onClick={() => setEdit(x => ({ ...x, champs: x.champs.filter((_, j) => j !== i) }))}>×</button>
                </div>
                <div className="jd-schema-champ__params">
                  <input className="input" placeholder="clé (stable)" value={ch.cle}
                    onChange={e => majChamp(i, { cle: slug(e.target.value) })} title="Identifiant stable — ne pas renommer une clé déjà utilisée" />
                  {(ch.type === 'nombre' || ch.type === 'decimal') && (
                    <input className="input" placeholder="unité (ex. CHF)" value={ch.unite ?? ''}
                      onChange={e => majChamp(i, { unite: e.target.value })} />
                  )}
                  {ch.type === 'echelle' && (
                    <>
                      <input className="input" type="number" placeholder="min" value={ch.min ?? 1}
                        onChange={e => majChamp(i, { min: Number(e.target.value) })} />
                      <input className="input" type="number" placeholder="max" value={ch.max ?? 5}
                        onChange={e => majChamp(i, { max: Number(e.target.value) })} />
                    </>
                  )}
                  {ch.type === 'select' && (
                    <OptionsInput value={ch.options ?? []} onChange={opts => majChamp(i, { options: opts })} />
                  )}
                </div>
              </div>
            ))}

            <button type="button" className="jd-auto-btn" style={{ marginTop: '.5rem' }}
              onClick={ajouterChamp}>
              ✚ Ajouter un champ
            </button>
          </div>

          <label className="media-picker__toggle">
            <input type="checkbox" checked={edit.actif !== false}
              onChange={e => setEdit(x => ({ ...x, actif: e.target.checked }))} />
            Actif
          </label>

          {msg && <p className="msg msg-error">{msg}</p>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => { setEdit(null); setMsg('') }}>Annuler</button>
            <button className="btn btn-primary" onClick={save} disabled={!edit.nom.trim()}>Enregistrer</button>
          </div>
        </div>
      )}

      {/* ── Liste ── */}
      <div className="ws-manager__section">
        {schemas.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Aucun schéma. Les notes utilisent la saisie libre.</p>
        ) : schemas.map(s => (
          <div key={s.id} className="jd-schema-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="jd-schema-row__nom">
                {s.nom}
                {!s.actif && <span className="jd-schema-row__off">inactif</span>}
              </div>
              <div className="jd-schema-row__ctx">
                {ctxBadges(s).map((b, i) => <span key={i} className="jd-schema-row__badge">{b}</span>)}
              </div>
              <div className="jd-schema-row__meta">
                {(s.champs ?? []).length} champ(s) · {s.notes_count} note(s)
              </div>
            </div>
            <button className="jd-auto-btn" onClick={() => setEdit({ ...s, nature: s.nature ?? '' })}>Modifier</button>
            <button className="jd-auto-btn" onClick={() => supprimer(s)}>Supprimer</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// Saisie des options d'une liste. Le texte brut est gardé en état LOCAL pendant la frappe :
// en parsant à chaque frappe, la virgule tout juste tapée produisait un élément vide,
// aussitôt filtré puis re-joint — la virgule disparaissait et la liste était intapable.
// On ne parse donc qu'à la sortie du champ.
function OptionsInput({ value, onChange }) {
  const [txt, setTxt] = useState(value.join(', '))
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setTxt(value.join(', ')) }, [value, focus])
  return (
    <input className="input" placeholder="options séparées par des virgules"
      value={txt}
      onFocus={() => setFocus(true)}
      onChange={e => setTxt(e.target.value)}
      onBlur={() => {
        setFocus(false)
        onChange(txt.split(',').map(o => o.trim()).filter(Boolean))
      }} />
  )
}

// ── Simulateur de résolution ──────────────────────────────────
function Simulateur({ wsId, token, objets, themes, categories, pickerMode }) {
  const [objetId, setObjetId] = useState(null)
  const [themeId, setThemeId] = useState(null)
  const [catIds, setCatIds] = useState([])   // ordonnées (ordre de clic)
  const [nature, setNature] = useState('')
  const [res, setRes] = useState(undefined)   // undefined = pas encore testé

  useEffect(() => {
    const p = new URLSearchParams()
    if (objetId) p.set('objet_id', objetId)
    if (themeId) p.set('theme_id', themeId)
    if (catIds.length) p.set('categorie_ids', catIds.join(','))
    if (nature)  p.set('nature', nature)
    if (![...p].length) { setRes(undefined); return }
    fetch(`${API_ROUTES.JD_SCHEMA_RESOLVE(wsId)}?${p}`, { headers: authHeader(token) })
      .then(r => r.json()).then(d => setRes(d.schema ?? null)).catch(() => setRes(null))
  }, [wsId, token, objetId, themeId, catIds, nature])

  return (
    <div className="ws-manager__section">
      <h3 className="ws-manager__title">🔎 Simulateur</h3>
      <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: '.2rem 0 .6rem' }}>
        Choisissez un contexte : voici le schéma qui s'appliquera à une note ainsi classée.
      </p>
      <HierarchyPicker items={objets} value={objetId} onChange={setObjetId}
        nullable nullLabel="— aucun objet —" placeholder="Objet…" filterMode={pickerMode} />
      <div style={{ height: '.4rem' }} />
      <HierarchyPicker items={themes} value={themeId} onChange={setThemeId}
        nullable nullLabel="— aucun thème —" placeholder="Thème…" filterMode={pickerMode} />
      <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem', flexWrap: 'wrap' }}>
        <select className="input" style={{ flex: 1, minWidth: '140px' }} value=""
          onChange={e => { const id = Number(e.target.value); if (id) setCatIds(l => l.includes(id) ? l : [...l, id]) }}>
          <option value="">{catIds.length ? '+ ajouter une catégorie' : '— aucune catégorie —'}</option>
          {categories.filter(c => !catIds.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.icon || '🏷️'} {c.nom}</option>)}
        </select>
        <select className="input" style={{ flex: 1, minWidth: '140px' }} value={nature}
          onChange={e => setNature(e.target.value)}>
          {NATURES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {catIds.length > 0 && (
        <div className="jd-cat-picker__choisies" style={{ marginTop: '.4rem' }}>
          {catIds.map(id => { const c = categories.find(x => x.id === id); return c && (
            <span key={id} className="jd-cat-chip" style={{ background: `${c.couleur || '#d97706'}22`, color: c.couleur || '#d97706' }}>
              {c.icon || '🏷️'} {c.nom}
              <button type="button" className="jd-cat-chip__btn" onClick={() => setCatIds(l => l.filter(x => x !== id))}>×</button>
            </span>) })}
        </div>
      )}
      <div className="jd-schema-sim__res">
        {res === undefined ? <span className="muted">Choisissez au moins un critère.</span>
          : res === null ? <span>⚠️ Aucun schéma — la note utilisera la <b>saisie libre</b>.</span>
          : <span>✅ {(res.schemas?.length ?? 1) > 1 ? 'Schémas fusionnés' : 'Schéma appliqué'} : <b>{res.nom}</b> ({(res.champs ?? []).length} champ(s))</span>}
      </div>
    </div>
  )
}
