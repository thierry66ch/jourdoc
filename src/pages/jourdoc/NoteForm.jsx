import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { useJdData, authHeader, mediaUrl, noteVisual } from './hooks'
import HierarchyPicker from './HierarchyPicker'
import ElementPicker from './ElementPicker'
import MediaPicker from './MediaPicker'
import MediaCard from './MediaCard'
import NoteLinkPicker from './NoteLinkPicker'
import RichTextEditor from './RichTextEditor'
import MarkdownModal from './MarkdownModal'

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const NATURE_ICO = { observation: '👁', activite: '⚡', documentation: '📄', journal: '📔' }

const sortByDate = arr => [...arr].sort((a, b) => {
  const d = (a.date ?? '').localeCompare(b.date ?? '')
  return d !== 0 ? d : (a.created_at ?? '').localeCompare(b.created_at ?? '')
})

function NoteLienChip({ note, onClick, onRemove }) {
  const typeKey = note.nature ?? note.type ?? 'journal'
  const icon = noteVisual(note).icon
  const d = note.date ? new Date(note.date + 'T00:00:00').toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  return (
    <div className={`note-lien-chip note-lien-chip--${typeKey}`}>
      <button type="button" className="note-lien-chip__main" onClick={onClick}>
        <span className="note-lien-chip__icon">{icon}</span>
        <span className="note-lien-chip__title" title={note.titre}>{note.titre_alt ?? note.titre}</span>
        {d && <span className="note-lien-chip__date">{d}</span>}
      </button>
      {onRemove && (
        <button type="button" className="note-lien-chip__remove" onClick={onRemove} title="Supprimer ce lien">×</button>
      )}
    </div>
  )
}

export default function NoteForm() {
  const { wsId, noteId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { objets, themes, docCategories, docStatuts, pickerMode } = useJdData(wsId, token)
  const isEdit = Boolean(noteId)

  // Médias pré-sélectionnés depuis la galerie (navigation state)
  const initMediaIds = location.state?.media_ids ?? []

  const [form, setForm] = useState({
    type:      location.state?.type    ?? 'journal',
    nature:    location.state?.nature  ?? 'observation',
    doc_categorie_id: location.state?.doc_categorie_id ?? null,
    doc_statut_id: null,
    doc_auteur:    '',
    doc_reference: '',
    theme_ids:   location.state?.theme_ids ?? [],
    objet_ids:   location.state?.objet_ids ?? [],
    element_ids: [],
    media_ids: initMediaIds,
    titre:     location.state?.titre   ?? '',
    titre_alt: '',
    contenu:   location.state?.contenu ?? '',
    date:      location.state?.note_date ?? today(),
    source_url: '',
  })
  const [noteLoaded, setNoteLoaded] = useState(!isEdit) // pour la clé de RichTextEditor
  const [mediaDetails, setMediaDetails] = useState([])  // détail des médias liés (pour miniatures)
  const [showPicker, setShowPicker] = useState(initMediaIds.length > 0)
  const [mdOpen, setMdOpen] = useState(null) // null | { create: true } | { mediaId }
  const [liens, setLiens] = useState([])           // notes sortantes (cette note → autres)
  const [liensEntrants, setLiensEntrants] = useState([])   // notes entrantes (autres → cette note)
  const [pendingLinks, setPendingLinks] = useState(location.state?.pending_links ?? [])  // liens en attente (mode création)
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Chargement note existante
  useEffect(() => {
    if (!isEdit) return
    fetch(API_ROUTES.JD_NOTE(wsId, noteId), { headers: authHeader(token) })
      .then(r => r.json())
      .then(({ note }) => {
        setForm({
          type: note.type,
          nature: note.nature ?? 'observation',
          doc_categorie_id: note.doc_categorie_id ?? null,
          doc_statut_id: note.doc_statut_id ?? null,
          doc_auteur:    note.doc_auteur ?? '',
          doc_reference: note.doc_reference ?? '',
          theme_ids:   (note.themes ?? []).map(t => t.id),
          objet_ids:   note.objets.map(o => o.id),
          element_ids: (note.elements ?? []).map(e => e.id),
          media_ids: note.medias?.map(m => m.id) ?? [],
          titre: note.titre,
          titre_alt: note.titre_alt ?? '',
          contenu: note.contenu ?? '',
          date: note.date ?? today(),
          source_url: note.source_url ?? '',
        })
        setMediaDetails(note.medias ?? [])
        setLiens(sortByDate(note.liens ?? []))
        setLiensEntrants(sortByDate(note.liensEntrants ?? []))
        setNoteLoaded(true)
        if ((note.medias?.length ?? 0) > 0) setShowPicker(true)
      })
  }, [isEdit, noteId, wsId, token])

  // Charger les détails des médias pré-sélectionnés depuis location.state
  useEffect(() => {
    if (isEdit || initMediaIds.length === 0) return
    fetch(`${API_ROUTES.JD_MEDIAS(wsId)}`, { headers: authHeader(token) })
      .then(r => r.json())
      .then(({ medias }) => {
        setMediaDetails(medias.filter(m => initMediaIds.includes(m.id)))
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function autoTitle() {
    const selectedObjets = objets.filter(o => form.objet_ids.includes(o.id))
    const selectedThemes = themes.filter(t => form.theme_ids.includes(t.id))

    // Titre alternatif compact : max 3 noms joints, sinon les 3 premiers suivis de « … »
    const cap = names => names.length === 0 ? '' : names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')}…`

    // Titre complet : tous les noms
    const parts = []
    if (selectedObjets.length) parts.push(selectedObjets.map(o => o.nom).join(', '))
    if (selectedThemes.length) parts.push(selectedThemes.map(t => t.nom).join(', '))
    const titre = parts.join(' → ')

    // Titre alternatif : noms courts, cap à 2
    const titreAlt = [
      cap(selectedObjets.map(o => o.nom_court || o.nom.slice(0, 3))),
      cap(selectedThemes.map(t => t.nom_court || t.nom.slice(0, 4))),
    ].filter(Boolean).join(' → ')

    setForm(f => ({ ...f, titre, titre_alt: titreAlt }))
  }

  function toggleMedia(id) {
    setForm(f => ({
      ...f,
      media_ids: f.media_ids.includes(id)
        ? f.media_ids.filter(x => x !== id)
        : [...f.media_ids, id],
    }))
  }

  function removeMedia(id) {
    setForm(f => ({ ...f, media_ids: f.media_ids.filter(x => x !== id) }))
    setMediaDetails(d => d.filter(m => m.id !== id))
  }

  // Source des mentions « @ » : objets + thèmes (locaux) + notes (recherche)
  async function mentionItems(query) {
    const q = query.toLowerCase()
    const local = [
      ...objets.map(o => ({ id: `objet:${o.id}`, label: o.nom, type: 'objet', icon: '🌿' })),
      ...themes.map(t => ({ id: `theme:${t.id}`, label: t.nom, type: 'theme', icon: '🏷️' })),
    ].filter(i => i.label.toLowerCase().includes(q)).slice(0, 6)
    let notes = []
    if (query.trim().length >= 2) {
      try {
        const r = await fetch(`${API_ROUTES.JD_NOTES_SEARCH(wsId)}?q=${encodeURIComponent(query)}`, { headers: authHeader(token) })
        const d = await r.json()
        notes = (d.notes || []).slice(0, 6).map(n => ({ id: `note:${n.id}`, label: n.titre || '(sans titre)', type: 'note', icon: noteVisual(n).icon }))
      } catch { /* ignore */ }
    }
    return [...local, ...notes]
  }

  // Document Markdown créé depuis l'éditeur → l'attacher à la note
  function onMdCreated(media) {
    setForm(f => ({ ...f, media_ids: [...f.media_ids, media.id] }))
    setMediaDetails(d => [...d, { id: media.id, type_media: 'markdown', nom_original: media.nom_original, fichier: media.fichier }])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body = {
        ...form,
        nature: form.type === 'journal' ? form.nature : null,
        doc_categorie_id: form.type === 'documentation' ? form.doc_categorie_id : null,
        source_url: form.source_url || null,
        titre_alt: form.titre_alt || null,
      }
      const url = isEdit ? API_ROUTES.JD_NOTE(wsId, noteId) : API_ROUTES.JD_NOTES(wsId)
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: authHeader(token),
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      if (isEdit) {
        // replace : l'éditeur ne reste pas dans la pile (Retour → page d'origine)
        navigate(`/jourdoc/${wsId}/notes/${noteId}`, { state: location.state, replace: true })
      } else {
        const { id: newId } = await res.json()
        await Promise.all(pendingLinks.map(lk =>
          fetch(API_ROUTES.JD_NOTE_LIENS(wsId, newId), {
            method: 'POST', headers: authHeader(token),
            body: JSON.stringify({ note_cible_id: lk.id }),
          })
        ))
        navigate(`/jourdoc/${wsId}/notes/${newId}`, { replace: true })
      }
    } catch {
      setError('Erreur lors de la sauvegarde.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer cette note ?')) return
    await fetch(API_ROUTES.JD_NOTE(wsId, noteId), { method: 'DELETE', headers: authHeader(token) })
    navigate(`/jourdoc/${wsId}`)
  }

  // Annuler : note existante → retour en lecture (sans laisser l'éditeur dans la pile) ;
  // nouvelle note → retour à la page précédente.
  function cancelEdit() {
    if (isEdit) navigate(`/jourdoc/${wsId}/notes/${noteId}`, { state: location.state, replace: true })
    else navigate(-1)
  }

  return (
    <div className="jd-note-form">
      <div className="jd-form-header">
        <button className="btn btn-ghost" style={{ padding: '.35rem .6rem', fontSize: '.875rem' }} onClick={cancelEdit}>
          ← Retour
        </button>
        <h2>{isEdit ? 'Modifier la note' : 'Nouvelle note'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="jd-form">
        {error && <p className="msg msg-error">{error}</p>}

        {/* Type + Nature */}
        <div className="jd-form-row">
          <div className="form-field">
            <label className="form-label">Type</label>
            <div className="jd-segmented">
              {['journal', 'documentation'].map(t => (
                <button key={t} type="button"
                  className={`jd-seg-btn${form.type === t ? ' active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, type: t }))}>
                  {t === 'journal' ? '📔 Journal' : '📄 Documentation'}
                </button>
              ))}
            </div>
          </div>
          {form.type === 'journal' && (
            <div className="form-field">
              <label className="form-label">Nature</label>
              <div className="jd-segmented">
                {[['observation', '👁 Observation'], ['activite', '⚡ Activité']].map(([v, l]) => (
                  <button key={v} type="button"
                    className={`jd-seg-btn${form.nature === v ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, nature: v }))}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Catégorie (documentation) */}
        {form.type === 'documentation' && (
          <div className="form-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="form-label">Catégorie</label>
              <button type="button" className="jd-auto-btn"
                onClick={() => navigate(`/jourdoc/${wsId}/settings`)}>⚙️ Gérer</button>
            </div>
            <div className="jd-segmented" style={{ flexWrap: 'wrap' }}>
              <button type="button"
                className={`jd-seg-btn${form.doc_categorie_id == null ? ' active' : ''}`}
                onClick={() => setForm(f => ({ ...f, doc_categorie_id: null }))}>— Aucune</button>
              {docCategories.map(cat => (
                <button key={cat.id} type="button"
                  className={`jd-seg-btn${form.doc_categorie_id === cat.id ? ' active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, doc_categorie_id: cat.id }))}>
                  {cat.icon} {cat.nom}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Date */}
        {form.type === 'journal' && (
          <div className="form-field">
            <label className="form-label">Date</label>
            <div className="jd-date-row">
              <button type="button" className="jd-date-arrow" onClick={() => {
                const d = new Date(form.date); d.setDate(d.getDate() - 1)
                setForm(f => ({ ...f, date: d.toISOString().slice(0, 10) }))
              }}>‹</button>
              <input className="input" type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                style={{ textAlign: 'center', flex: 1 }} />
              <button type="button" className="jd-date-arrow" onClick={() => {
                const d = new Date(form.date); d.setDate(d.getDate() + 1)
                setForm(f => ({ ...f, date: d.toISOString().slice(0, 10) }))
              }}>›</button>
            </div>
          </div>
        )}

        {/* Objets */}
        <HierarchyPicker items={objets} value={form.objet_ids}
          onChange={v => setForm(f => ({ ...f, objet_ids: v }))}
          mode="multi" label="Objets liés" placeholder="Choisir un ou plusieurs objets…" filterMode={pickerMode} />

        {/* Éléments */}
        <div className="form-field">
          <label className="form-label">Éléments</label>
          <ElementPicker
            value={form.element_ids}
            onChange={v => setForm(f => ({ ...f, element_ids: v }))}
            wsId={wsId} token={token}
          />
        </div>

        {/* Thèmes */}
        <HierarchyPicker items={themes} value={form.theme_ids}
          onChange={v => setForm(f => ({ ...f, theme_ids: v }))}
          mode="multi" label="Thèmes liés" placeholder="Choisir un ou plusieurs thèmes…" filterMode={pickerMode} />

        {/* Titre */}
        <div className="form-field">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="form-label">Titre *</label>
            <button type="button" className="jd-auto-btn" onClick={autoTitle}>✨ Générer</button>
          </div>
          <input className="input" value={form.titre}
            onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}
            required placeholder="Titre de la note" />
        </div>

        {/* Titre alternatif */}
        <div className="form-field">
          <label className="form-label">Titre alternatif <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}>(calendrier compact)</span></label>
          <input className="input" value={form.titre_alt}
            onChange={e => setForm(f => ({ ...f, titre_alt: e.target.value }))}
            placeholder="Ex : Pom/Gol → TrAntif" />
        </div>

        {/* Contenu — éditeur riche */}
        <div className="form-field">
          <label className="form-label">Contenu</label>
          <RichTextEditor
            key={isEdit ? (noteLoaded ? `e-${noteId}` : `loading-${noteId}`) : 'new'}
            initialContent={form.contenu}
            onChange={v => setForm(f => ({ ...f, contenu: v }))}
            mentionItems={mentionItems}
            placeholder="Détails de la note… (@ pour mentionner, / pour insérer)"
          />
        </div>

        {/* Champs documentation */}
        {form.type === 'documentation' && (
          <>
            <div className="jd-form-row">
              <div className="form-field">
                <label className="form-label">Auteur / source</label>
                <input className="input" value={form.doc_auteur}
                  onChange={e => setForm(f => ({ ...f, doc_auteur: e.target.value }))}
                  placeholder="Ex : Manuel Bayer 2023, INRA…" />
              </div>
              <div className="form-field">
                <label className="form-label">Date de référence / version</label>
                <input className="input" value={form.doc_reference}
                  onChange={e => setForm(f => ({ ...f, doc_reference: e.target.value }))}
                  placeholder="Ex : éd. 2024, v2.1…" />
              </div>
            </div>

            <div className="form-field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className="form-label">Statut</label>
                <button type="button" className="jd-auto-btn"
                  onClick={() => navigate(`/jourdoc/${wsId}/settings`)}>⚙️ Gérer</button>
              </div>
              <div className="jd-segmented" style={{ flexWrap: 'wrap' }}>
                <button type="button"
                  className={`jd-seg-btn${form.doc_statut_id == null ? ' active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, doc_statut_id: null }))}>— Aucun</button>
                {docStatuts.map(s => (
                  <button key={s.id} type="button"
                    className={`jd-seg-btn${form.doc_statut_id === s.id ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, doc_statut_id: s.id }))}>
                    {s.icon} {s.nom}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Source URL</label>
              <input className="input" type="url" value={form.source_url}
                onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
                placeholder="https://…" />
            </div>
          </>
        )}

        {/* ── Médias liés ── */}
        <div className="form-field">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="form-label">
              📎 Pièces jointes
              {form.media_ids.length > 0 && (
                <span style={{ marginLeft: '.5rem', color: 'var(--accent)', fontWeight: 700 }}>
                  {form.media_ids.length}
                </span>
              )}
            </label>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button type="button" className="jd-auto-btn"
                onClick={() => setMdOpen({ create: true })}>📝 + Document</button>
              <button type="button" className="jd-auto-btn"
                onClick={() => setShowPicker(o => !o)}>
                {showPicker ? 'Fermer' : 'Choisir des médias'}
              </button>
            </div>
          </div>

          {/* Miniatures des médias déjà sélectionnés */}
          {form.media_ids.length > 0 && (
            <div className="jd-media-selected">
              {form.media_ids.map(id => {
                const m = mediaDetails.find(x => x.id === id)
                if (!m) return null
                return (
                  <div key={id} className="jd-media-selected__item">
                    {m.type_media === 'pdf'
                      ? <div className="jd-thumb jd-thumb--pdf" title={m.nom_original}>📄</div>
                      : m.type_media === 'markdown'
                      ? <div className="jd-thumb jd-thumb--pdf" title={m.nom_original}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setMdOpen({ mediaId: m.id })}>📝</div>
                      : <img className="jd-thumb" src={mediaUrl(wsId, m.id, token)} alt="" loading="lazy" />
                    }
                    <button type="button" className="jd-media-selected__remove"
                      onClick={() => removeMedia(id)} title="Retirer">×</button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Picker inline */}
          {showPicker && (
            <MediaPicker
              wsId={wsId} token={token}
              date={form.type === 'journal' ? form.date : null}
              selectedIds={form.media_ids}
              onToggle={(id, media) => {
                toggleMedia(id)
                if (media && !mediaDetails.find(m => m.id === id)) {
                  setMediaDetails(d => [...d, media])
                }
              }}
            />
          )}
        </div>

        {/* ── Fil de notes ── */}
        <div className="note-liens-section">
          <div className="note-liens-section__header">
            <span className="form-label">🔗 Fil de notes</span>
            <button type="button" className="jd-auto-btn"
              onClick={() => setShowLinkPicker(o => !o)}>
              {showLinkPicker ? 'Fermer' : '+ Lier une note'}
            </button>
          </div>

          {/* Picker de recherche */}
          {showLinkPicker && (
            <NoteLinkPicker
              wsId={wsId} token={token} currentNoteId={Number(noteId) || 0}
              onSelect={async (n) => {
                setShowLinkPicker(false)
                if (isEdit) {
                  await fetch(API_ROUTES.JD_NOTE_LIENS(wsId, noteId), {
                    method: 'POST', headers: authHeader(token),
                    body: JSON.stringify({ note_cible_id: n.id }),
                  })
                  setLiens(prev => sortByDate(prev.find(l => l.id === n.id) ? prev : [...prev, n]))
                } else {
                  setPendingLinks(prev => prev.find(l => l.id === n.id) ? prev : sortByDate([...prev, n]))
                }
              }}
              onClose={() => setShowLinkPicker(false)}
            />
          )}

          {/* Mode création : liens en attente */}
          {!isEdit && pendingLinks.length > 0 && (
            <div className="note-liens__group">
              <span className="note-liens__group-label">Notes liées (seront créées à la sauvegarde)</span>
              {pendingLinks.map(n => (
                <NoteLienChip key={n.id} note={n}
                  onClick={() => navigate(`/jourdoc/${wsId}/notes/${n.id}`)}
                  onRemove={() => setPendingLinks(prev => prev.filter(l => l.id !== n.id))}
                />
              ))}
            </div>
          )}

          {/* Notes sortantes = Contexte (notes plus anciennes citées, modifiables) */}
          {isEdit && liens.length > 0 && (
            <div className="note-liens__group">
              <span className="note-liens__group-label">Contexte (notes citées)</span>
              {liens.map(n => (
                <NoteLienChip key={n.id} note={n}
                  onClick={() => navigate(`/jourdoc/${wsId}/notes/${n.id}`)}
                  onRemove={async () => {
                    await fetch(API_ROUTES.JD_NOTE_LIEN(wsId, noteId, n.id), {
                      method: 'DELETE', headers: authHeader(token),
                    })
                    setLiens(prev => prev.filter(l => l.id !== n.id))
                  }}
                />
              ))}
            </div>
          )}

          {/* Notes entrantes = Suite (notes plus récentes qui citent celle-ci, lecture seule) */}
          {isEdit && liensEntrants.length > 0 && (
            <div className="note-liens__group">
              <span className="note-liens__group-label">Suite / entraîne</span>
              {liensEntrants.map(n => (
                <NoteLienChip key={n.id} note={n}
                  onClick={() => navigate(`/jourdoc/${wsId}/notes/${n.id}`)} />
              ))}
            </div>
          )}

          {pendingLinks.length === 0 && liensEntrants.length === 0 && liens.length === 0 && !showLinkPicker && (
            <p style={{ color: 'var(--text-subtle)', fontSize: '.8125rem', padding: '.25rem 0' }}>
              Aucune liaison — cliquez "+ Lier une note" pour créer un fil documenté.
            </p>
          )}
        </div>

        <div className="form-actions" style={{ marginTop: '.5rem' }}>
          {isEdit && <button type="button" className="btn btn-danger" onClick={handleDelete}>Supprimer</button>}
          <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '…' : isEdit ? 'Enregistrer' : 'Créer la note'}
          </button>
        </div>
      </form>

      {/* Document Markdown (création / édition) */}
      {mdOpen && (
        <MarkdownModal
          wsId={wsId} token={token}
          mediaId={mdOpen.mediaId ?? null}
          onClose={() => setMdOpen(null)}
          onCreated={onMdCreated}
        />
      )}
    </div>
  )
}
