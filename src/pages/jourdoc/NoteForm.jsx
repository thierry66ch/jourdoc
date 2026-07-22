import { useState, useEffect, useRef } from 'react'
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
import ExtDocsBrowser from './ExtDocsBrowser'
import { prepareUploadFiles } from '../../lib/imageUpload'

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const NATURE_ICO = { observation: '👁', activite: '⚡', mixte: '🔀', documentation: '📄', journal: '📔' }

// Titre de repli dérivé du slug de l'URL (quand la capture échoue, p. ex. 403).
function slugTitle(url) {
  try {
    const u = new URL(url)
    let seg = u.pathname.split('/').filter(Boolean).pop() || ''
    seg = decodeURIComponent(seg).replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_]+\d+$/, '')
    seg = seg.replace(/[-_]+/g, ' ').trim()
    if (!seg) seg = u.hostname.replace(/^www\./, '')
    return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : ''
  } catch { return '' }
}

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
    source_url: location.state?.source_url ?? '',
  })
  // Données étendues (Phase A) : édité comme un TABLEAU [{cle, valeur}] pour préserver
  // l'ordre de saisie (jsonb ne garantit pas l'ordre des clés), converti en objet à
  // l'enregistrement.
  const [donnees, setDonnees] = useState([])
  const [noteLoaded, setNoteLoaded] = useState(!isEdit) // pour la clé de RichTextEditor
  const [editorBump, setEditorBump] = useState(0)       // force le remontage de l'éditeur (injection capture)
  const [mediaDetails, setMediaDetails] = useState([])  // détail des médias liés (pour miniatures)
  const [showPicker, setShowPicker] = useState(initMediaIds.length > 0)
  const [mdOpen, setMdOpen] = useState(null) // null | { create: true } | { mediaId }
  const [extBrowser, setExtBrowser] = useState(false)
  const [liens, setLiens] = useState([])           // notes sortantes (cette note → autres)
  const [liensEntrants, setLiensEntrants] = useState([])   // notes entrantes (autres → cette note)
  const [pendingLinks, setPendingLinks] = useState(location.state?.pending_links ?? [])  // liens en attente (mode création)
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [captureMsg, setCaptureMsg] = useState('')
  const captureMsgRef = useRef(null)
  const errorRef = useRef(null)

  // Le résultat de capture (succès/partiel/erreur) défile à l'écran (visible sur mobile).
  useEffect(() => { if (captureMsg) captureMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [captureMsg])
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [error])

  // Capture serveur du lien : télécharge l'URL, génère un .md attaché à la note.
  async function captureUrl() {
    const url = (form.source_url || '').trim()
    if (!url) { setError('Renseigne d’abord une URL source.'); return }

    // Déjà capturé dans ce workspace ? (hors note courante) → demander confirmation.
    try {
      const ex = await fetch(`/api/clip/ws/${wsId}/exists?url=${encodeURIComponent(url)}`, { headers: authHeader(token) }).then(r => r.json())
      const others = (ex.existing || []).filter(n => n.id !== Number(noteId))
      if (others.length && !confirm(
        `Cette URL est déjà capturée dans : ${others.slice(0, 3).map(n => n.titre || `note #${n.id}`).join(', ')}${others.length > 3 ? '…' : ''}.\nCapturer quand même ?`
      )) return
    } catch { /* non bloquant */ }

    setCapturing(true); setError(''); setCaptureMsg('')
    try {
      const res = await fetch(`/api/clip/ws/${wsId}/capture-url`, {
        method: 'POST', headers: authHeader(token), body: JSON.stringify({ url }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
      const m = data.media
      const desc = (data.description || '').trim()
      // Injecte la description en bloc citation EN TÊTE du contenu (si pas déjà présent).
      const injectDesc = desc && !(form.contenu || '').includes('<blockquote')
      const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      setForm(f => ({
        ...f,
        media_ids: f.media_ids.includes(m.id) ? f.media_ids : [...f.media_ids, m.id],
        titre: f.titre.trim() ? f.titre : (data.title || f.titre),
        contenu: injectDesc ? `<blockquote><p>${escHtml(desc)}</p></blockquote>${f.contenu || ''}` : f.contenu,
      }))
      setMediaDetails(d => d.some(x => x.id === m.id) ? d : [...d, m])
      if (injectDesc) setEditorBump(b => b + 1) // remonte l'éditeur pour afficher la citation
      const img = data.images
      const prefix = data.partial
        ? '⚠️ Capture partielle (titre + description, pas d’article exploitable)'
        : `✓ Capturé : ${m.nom_original}`
      setCaptureMsg(`${prefix}${img && (img.uploaded || img.failed) ? ` · ${img.uploaded} image(s)${img.failed ? `, ${img.failed} échec(s)` : ''}` : ''}. Joint en pièce jointe.`)
    } catch (e) {
      // À défaut de capture, donner au moins un titre dérivé de l'URL (si vide).
      const fallback = slugTitle(url)
      if (fallback) setForm(f => f.titre.trim() ? f : { ...f, titre: fallback })
      const protege = /refusé|403|401|429/.test(e.message)
      setError(`Capture impossible : ${e.message}.${protege
        ? ' Site protégé — utilise le bookmarklet directement sur la page, ou enregistre la note avec le lien seul.'
        : ' Tu peux enregistrer la note avec le lien seul.'}`)
    } finally {
      setCapturing(false)
    }
  }

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
        setDonnees(Object.entries(note.donnees_etendues ?? {}).map(([cle, valeur]) => ({ cle, valeur: String(valeur ?? '') })))
        setMediaDetails(note.medias ?? [])
        setLiens(sortByDate(note.liens ?? []))
        setLiensEntrants(sortByDate(note.liensEntrants ?? []))
        setNoteLoaded(true)
        if ((note.medias?.length ?? 0) > 0) setShowPicker(true)
      })
  }, [isEdit, noteId, wsId, token])

  // Auto-capture du lien partagé (partage natif Android → fiche en création).
  const didAutocapture = useRef(false)
  useEffect(() => {
    if (!isEdit && location.state?.autocapture && (location.state?.source_url || '').trim() && !didAutocapture.current) {
      didAutocapture.current = true
      captureUrl()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Charger les détails des médias pré-sélectionnés depuis location.state
  useEffect(() => {
    if (isEdit || initMediaIds.length === 0) return
    fetch(`${API_ROUTES.JD_MEDIAS(wsId)}`, { headers: authHeader(token) })
      .then(r => r.json())
      .then(({ medias }) => {
        setMediaDetails(medias.filter(m => initMediaIds.includes(m.id)))
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Titre court compact : noms courts, « objets → thèmes », cap à 3 par groupe.
  function computeTitreAlt() {
    const selectedObjets = objets.filter(o => form.objet_ids.includes(o.id))
    const selectedThemes = themes.filter(t => form.theme_ids.includes(t.id))
    const cap = names => names.length === 0 ? '' : names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')}…`
    return [
      cap(selectedObjets.map(o => o.nom_court || o.nom.slice(0, 3))),
      cap(selectedThemes.map(t => t.nom_court || t.nom.slice(0, 4))),
    ].filter(Boolean).join(' → ')
  }

  function autoTitle() {
    const selectedObjets = objets.filter(o => form.objet_ids.includes(o.id))
    const selectedThemes = themes.filter(t => form.theme_ids.includes(t.id))

    // Titre complet : tous les noms
    const parts = []
    if (selectedObjets.length) parts.push(selectedObjets.map(o => o.nom).join(', '))
    if (selectedThemes.length) parts.push(selectedThemes.map(t => t.nom).join(', '))
    const titre = parts.join(' → ')

    // Ne pas écraser un titre / titre court déjà saisi : ne remplir que les champs vides.
    setForm(f => ({
      ...f,
      titre:     f.titre.trim()     ? f.titre     : titre,
      titre_alt: f.titre_alt.trim() ? f.titre_alt : computeTitreAlt(),
    }))
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

  // ── Images de l'éditeur HTML ──
  const mediaSrc = id => `/api/jourdoc/${wsId}/medias/${id}/file`
  // src stocké (sans token) → proxy authentifié à l'affichage
  const resolveImg = src =>
    (typeof src === 'string' && /\/medias\/\d+\/file$/.test(src) && !src.includes('?'))
      ? `${src}?t=${token}` : src
  // images jointes (photos) pour le bouton d'insertion
  const attachedImages = mediaDetails
    .filter(m => m.type_media === 'photo')
    .map(m => ({ src: mediaSrc(m.id), alt: m.nom_original }))

  // Image collée/déposée → upload en pièce jointe (réduction/JPG) + lien à la note.
  async function uploadPastedImage(file) {
    const [prepared] = (await prepareUploadFiles([file])).files
    const fd = new FormData()
    fd.append('files', prepared, prepared.name || 'image.png')
    fd.append('pasted', '1')
    const res = await fetch(API_ROUTES.JD_MEDIAS(wsId), {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.medias?.[0]) throw new Error(data.error || 'Upload échoué')
    const m = data.medias[0]
    setForm(f => f.media_ids.includes(m.id) ? f : { ...f, media_ids: [...f.media_ids, m.id] })
    setMediaDetails(d => d.some(x => x.id === m.id) ? d : [...d, m])
    return { src: mediaSrc(m.id) }
  }

  // Joindre des photos depuis la caméra ou la galerie (mobile surtout) → upload
  // (resize + date EXIF côté client) puis lien à la note.
  const [attaching, setAttaching] = useState(false)
  const cameraInputRef = useRef(null)
  const galleryInputRef = useRef(null)
  async function attachPhotos(fileList) {
    const list = [...fileList].filter(f => f.type?.startsWith('image/'))
    if (!list.length) return
    setAttaching(true)
    try {
      const { files, dates, undecodable } = await prepareUploadFiles(list)
      if (undecodable.length) {
        const noms = undecodable.map(f => `${f.name} (${Math.round(f.size / 1048576)} Mo)`).join(', ')
        alert(`Format non redimensionnable côté navigateur (HEIC ?) et trop lourd pour l'upload : ${noms}. Convertis-le en JPEG.`)
      }
      const fd = new FormData()
      files.forEach((f, i) => { fd.append('files', f, f.name); fd.append('dates', dates[i] || '') })
      // Repli de date : la date de la note pour un journal, sinon le jour même.
      fd.append('date_prise', form.type === 'journal' ? form.date : today())
      const res = await fetch(API_ROUTES.JD_MEDIAS(wsId), {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Upload échoué (${res.status})`)
      const created = data.medias ?? []
      if (created.length) {
        setForm(f => ({ ...f, media_ids: [...f.media_ids, ...created.filter(m => !f.media_ids.includes(m.id)).map(m => m.id)] }))
        setMediaDetails(d => [...d, ...created.filter(m => !d.some(x => x.id === m.id))])
      }
    } catch (e) {
      alert(`Erreur lors de l'ajout de la photo : ${e.message}`)
    } finally {
      setAttaching(false)
    }
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

  // Fichier externe lié → l'attacher à la note (sans copie)
  function onLinkPicked(media) {
    if (media?.id) {
      setForm(f => f.media_ids.includes(media.id) ? f : { ...f, media_ids: [...f.media_ids, media.id] })
      setMediaDetails(d => d.some(m => m.id === media.id) ? d
        : [...d, { id: media.id, type_media: media.type_media, nom_original: media.nom_original, fichier: media.fichier, externe: true }])
    }
    setExtBrowser(false)
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
        // Si le titre court n'est pas rempli, l'auto-générer (objets → thèmes, version courte).
        titre_alt: (form.titre_alt.trim() || computeTitreAlt()) || null,
        // Tableau [{cle, valeur}] → objet { cle: valeur } ; libellés vides ignorés.
        donnees_etendues: Object.fromEntries(
          donnees.map(d => [d.cle.trim(), d.valeur]).filter(([cle]) => cle)
        ),
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
        {error && <p ref={errorRef} className="msg msg-error">{error}</p>}

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
                {[['observation', '👁 Observation'], ['activite', '⚡ Activité'], ['mixte', '🔀 Obs.→Act.']].map(([v, l]) => (
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

            {/* Statut (sous la catégorie) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '.75rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Statut</label>
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

        {/* Données complémentaires (Phase A : paires libellé/valeur libres) */}
        <div className="form-field">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="form-label">
              📋 Données complémentaires
              {donnees.length > 0 && (
                <span style={{ marginLeft: '.5rem', color: 'var(--accent)', fontWeight: 700 }}>{donnees.length}</span>
              )}
            </label>
            <button type="button" className="jd-auto-btn"
              onClick={() => setDonnees(d => [...d, { cle: '', valeur: '' }])}>✚ Ajouter un champ</button>
          </div>

          {donnees.length > 0 && (
            <div className="jd-donnees-edit">
              {donnees.map((d, i) => (
                <div key={i} className="jd-donnees-edit__row">
                  <input className="input" placeholder="Libellé (ex. Prix payé)" value={d.cle}
                    onChange={e => setDonnees(list => list.map((x, j) => j === i ? { ...x, cle: e.target.value } : x))} />
                  <input className="input" placeholder="Valeur" value={d.valeur}
                    onChange={e => setDonnees(list => list.map((x, j) => j === i ? { ...x, valeur: e.target.value } : x))} />
                  <button type="button" className="jd-donnees-edit__remove" title="Supprimer ce champ"
                    onClick={() => setDonnees(list => list.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contenu — éditeur riche */}
        <div className="form-field">
          <label className="form-label">Contenu</label>
          <RichTextEditor
            key={`${isEdit ? (noteLoaded ? `e-${noteId}` : `loading-${noteId}`) : 'new'}-${editorBump}`}
            initialContent={form.contenu}
            onChange={v => setForm(f => ({ ...f, contenu: v }))}
            mentionItems={mentionItems}
            onImageUpload={uploadPastedImage}
            resolveImg={resolveImg}
            attachedImages={attachedImages}
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
              <label className="form-label">Source URL</label>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                <input className="input" type="url" value={form.source_url}
                  onChange={e => { setForm(f => ({ ...f, source_url: e.target.value })); setCaptureMsg('') }}
                  placeholder="https://…" style={{ flex: 1 }} />
                <button type="button" className="btn btn-secondary"
                  style={{ whiteSpace: 'nowrap', padding: '.5rem .8rem' }}
                  onClick={captureUrl} disabled={capturing || !form.source_url.trim()}
                  title="Télécharge la page et la joint en Markdown">
                  {capturing ? '⏳ Capture…' : '📥 Capturer'}
                </button>
              </div>
              {captureMsg && (
                <p ref={captureMsgRef} style={{ fontSize: '.8125rem', color: 'var(--success)', margin: '.4rem 0 0' }}>{captureMsg}</p>
              )}
              <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', margin: '.35rem 0 0' }}>
                « Capturer » télécharge le contenu de la page et l'attache en Markdown éditable.
                Marche sur les sites « article » ; échoue sur les pages rendues en JavaScript.
              </p>
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
              {attaching && (
                <span style={{ marginLeft: '.5rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  envoi…
                </span>
              )}
            </label>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="jd-auto-btn" disabled={attaching}
                onClick={() => cameraInputRef.current?.click()}>📷 Photo</button>
              <button type="button" className="jd-auto-btn" disabled={attaching}
                onClick={() => galleryInputRef.current?.click()}>🖼️ Galerie</button>
              <button type="button" className="jd-auto-btn"
                onClick={() => setExtBrowser(true)}>🔗 Lier un document</button>
              <button type="button" className="jd-auto-btn"
                onClick={() => setShowPicker(o => !o)}>
                {showPicker ? 'Fermer' : 'Choisir des médias'}
              </button>
              {/* Caméra : capture directe. Galerie : sélection multiple (sans capture). */}
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
                style={{ display: 'none' }}
                onChange={e => { attachPhotos(e.target.files); e.target.value = '' }} />
              <input ref={galleryInputRef} type="file" accept="image/*" multiple
                style={{ display: 'none' }}
                onChange={e => { attachPhotos(e.target.files); e.target.value = '' }} />
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

      {/* Document Markdown (édition d'un doc lié) */}
      {mdOpen && (
        <MarkdownModal
          wsId={wsId} token={token}
          mediaId={mdOpen.mediaId ?? null}
          onClose={() => setMdOpen(null)}
        />
      )}

      {/* Navigateur de fichiers externes (lier) */}
      {extBrowser && (
        <ExtDocsBrowser wsId={wsId} token={token}
          onPick={onLinkPicked} onClose={() => setExtBrowser(false)} />
      )}
    </div>
  )
}
