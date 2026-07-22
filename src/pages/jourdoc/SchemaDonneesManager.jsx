// Administration des schémas de données étendues (Phase B.4).
//
// Comprend un SIMULATEUR de résolution : la contrainte d'unicité empêche deux schémas
// strictement identiques en contexte, mais pas la confusion entre schémas *proches*
// (ex. un schéma objet-only et un schéma nature-only qui se chevauchent). Le simulateur
// répond à « pour ce contexte, lequel s'applique ? » sans rejouer l'algorithme de tête.

import { useState, useEffect, useCallback } from 'react'
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

const vide = () => ({ nom: '', objet_id: null, theme_id: null, doc_categorie_id: null, nature: '', champs: [], actif: true })

export default function SchemaDonneesManager() {
  const { wsId } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()
  const { objets, themes, docCategories, pickerMode } = useJdData(wsId, token)

  const [schemas, setSchemas] = useState([])
  const [edit, setEdit] = useState(null)      // null | objet en cours d'édition
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
    if (s.categorie_nom) b.push(`📄 ${s.categorie_nom}`)
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
        docCategories={docCategories} pickerMode={pickerMode} />

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
            <HierarchyPicker items={objets} value={edit.objet_id}
              onChange={v => setEdit(x => ({ ...x, objet_id: v }))}
              nullable nullLabel="— tout objet —" placeholder="Objet…" filterMode={pickerMode} />
            <div style={{ height: '.4rem' }} />
            <HierarchyPicker items={themes} value={edit.theme_id}
              onChange={v => setEdit(x => ({ ...x, theme_id: v }))}
              nullable nullLabel="— tout thème —" placeholder="Thème…" filterMode={pickerMode} />
            <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem', flexWrap: 'wrap' }}>
              <select className="input" style={{ flex: 1, minWidth: '140px' }} value={edit.doc_categorie_id ?? ''}
                onChange={e => setEdit(x => ({ ...x, doc_categorie_id: e.target.value ? Number(e.target.value) : null }))}>
                <option value="">— toute catégorie (doc.) —</option>
                {docCategories.map(c => <option key={c.id} value={c.id}>{c.icon || '📄'} {c.nom}</option>)}
              </select>
              <select className="input" style={{ flex: 1, minWidth: '140px' }} value={edit.nature ?? ''}
                onChange={e => setEdit(x => ({ ...x, nature: e.target.value }))}>
                {NATURES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {edit.doc_categorie_id && edit.nature && (
              <p className="msg msg-error" style={{ marginTop: '.4rem', fontSize: '.8rem' }}>
                ⚠️ Catégorie (documentation) et nature (journal) s'excluent : ce schéma ne
                s'appliquera à aucune note.
              </p>
            )}
          </div>

          <div className="form-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="form-label">Champs ({edit.champs.length})</label>
              <button type="button" className="jd-auto-btn"
                onClick={() => setEdit(x => ({ ...x, champs: [...x.champs, { cle: '', label: '', type: 'texte_court' }] }))}>
                ✚ Ajouter un champ
              </button>
            </div>

            {edit.champs.map((ch, i) => (
              <div key={i} className="jd-schema-champ">
                <div className="jd-schema-champ__head">
                  <input className="input" placeholder="Libellé (ex. Goût)" value={ch.label}
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
                    <input className="input" placeholder="options séparées par des virgules"
                      value={(ch.options ?? []).join(', ')}
                      onChange={e => majChamp(i, { options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) })} />
                  )}
                </div>
              </div>
            ))}
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

// ── Simulateur de résolution ──────────────────────────────────
function Simulateur({ wsId, token, objets, themes, docCategories, pickerMode }) {
  const [objetId, setObjetId] = useState(null)
  const [themeId, setThemeId] = useState(null)
  const [catId, setCatId] = useState(null)
  const [nature, setNature] = useState('')
  const [res, setRes] = useState(undefined)   // undefined = pas encore testé

  useEffect(() => {
    const p = new URLSearchParams()
    if (objetId) p.set('objet_id', objetId)
    if (themeId) p.set('theme_id', themeId)
    if (catId)   p.set('doc_categorie_id', catId)
    if (nature)  p.set('nature', nature)
    if (![...p].length) { setRes(undefined); return }
    fetch(`${API_ROUTES.JD_SCHEMA_RESOLVE(wsId)}?${p}`, { headers: authHeader(token) })
      .then(r => r.json()).then(d => setRes(d.schema ?? null)).catch(() => setRes(null))
  }, [wsId, token, objetId, themeId, catId, nature])

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
        <select className="input" style={{ flex: 1, minWidth: '140px' }} value={catId ?? ''}
          onChange={e => setCatId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— aucune catégorie —</option>
          {docCategories.map(c => <option key={c.id} value={c.id}>{c.icon || '📄'} {c.nom}</option>)}
        </select>
        <select className="input" style={{ flex: 1, minWidth: '140px' }} value={nature}
          onChange={e => setNature(e.target.value)}>
          {NATURES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="jd-schema-sim__res">
        {res === undefined ? <span className="muted">Choisissez au moins un critère.</span>
          : res === null ? <span>⚠️ Aucun schéma — la note utilisera la <b>saisie libre</b>.</span>
          : <span>✅ Schéma appliqué : <b>{res.nom}</b> ({(res.champs ?? []).length} champ(s))</span>}
      </div>
    </div>
  )
}
