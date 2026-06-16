import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader, mediaUrl } from './hooks'
import MediaCard from './MediaCard'
import Lightbox from './Lightbox'

// ── Utilitaires de période ────────────────────────────────────

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function today()  { return toISO(new Date()) }

const PERIODS = [
  { key: 'day',     label: 'Jour' },
  { key: 'week',    label: 'Sem.' },
  { key: 'month',   label: 'Mois' },
  { key: 'quarter', label: 'Trim.' },
  { key: 'year',    label: 'Année' },
]

function getRange(anchor, period) {
  const d = new Date(anchor + 'T00:00:00')
  switch (period) {
    case 'day':
      return { from: anchor, to: anchor }
    case 'week': {
      const dow = (d.getDay() + 6) % 7   // 0=lun, 6=dim
      const mon = new Date(d); mon.setDate(d.getDate() - dow)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      return { from: toISO(mon), to: toISO(sun) }
    }
    case 'month': {
      const f = new Date(d.getFullYear(), d.getMonth(), 1)
      const l = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      return { from: toISO(f), to: toISO(l) }
    }
    case 'quarter': {
      const q = Math.floor(d.getMonth() / 3)
      const f = new Date(d.getFullYear(), q * 3, 1)
      const l = new Date(d.getFullYear(), (q + 1) * 3, 0)
      return { from: toISO(f), to: toISO(l) }
    }
    case 'year':
      return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` }
    default:
      return { from: anchor, to: anchor }
  }
}

function shiftAnchor(anchor, period, dir) {
  const d = new Date(anchor + 'T00:00:00')
  switch (period) {
    case 'day':     d.setDate(d.getDate() + dir); break
    case 'week':    d.setDate(d.getDate() + dir * 7); break
    case 'month':   d.setMonth(d.getMonth() + dir); break
    case 'quarter': d.setMonth(d.getMonth() + dir * 3); break
    case 'year':    d.setFullYear(d.getFullYear() + dir); break
  }
  return toISO(d)
}

function rangeLabel(anchor, period) {
  const { from, to } = getRange(anchor, period)
  const df = new Date(from + 'T00:00:00')
  const dt = new Date(to + 'T00:00:00')
  const fmt = (d, opts) => d.toLocaleDateString('fr-CH', opts)
  switch (period) {
    case 'day':
      return fmt(df, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    case 'week': {
      const jan1 = new Date(df.getFullYear(), 0, 1)
      const wn = Math.ceil(((df - jan1) / 86400000 + jan1.getDay() + 1) / 7)
      return `Sem. ${wn} · ${fmt(df, { day: 'numeric', month: 'short' })} – ${fmt(dt, { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    case 'month':
      return fmt(df, { month: 'long', year: 'numeric' })
    case 'quarter': {
      const q = Math.floor(df.getMonth() / 3) + 1
      return `T${q} ${df.getFullYear()} (${fmt(df, { month: 'short' })} – ${fmt(dt, { month: 'short' })})`
    }
    case 'year':
      return `${df.getFullYear()}`
  }
}

function groupByDate(medias) {
  const groups = new Map()
  for (const m of medias) {
    const k = m.date_prise ?? 'Sans date'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(m)
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]))
}

function fmtDate(iso) {
  if (!iso || iso === 'Sans date') return 'Sans date'
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

// ── Composant ────────────────────────────────────────────────

export default function MediaGallery() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [medias, setMedias] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [lightboxIdx, setLightboxIdx] = useState(-1)

  // Filtre période
  const [period, setPeriod] = useState('day')
  const [anchor, setAnchor] = useState(today())

  // Filtre type + lié
  const [filterType, setFilterType] = useState('')
  const [filterLie, setFilterLie] = useState('0')

  const { from: dateFrom, to: dateTo } = useMemo(() => getRange(anchor, period), [anchor, period])

  async function loadMedias() {
    setLoading(true)
    const params = new URLSearchParams()
    if (dateFrom) { params.set('date_from', dateFrom); params.set('date_to', dateTo) }
    if (filterType) params.set('type_media', filterType)
    if (filterLie)  params.set('lie', filterLie)
    const data = await fetch(`${API_ROUTES.JD_MEDIAS(wsId)}?${params}`, { headers: authHeader(token) }).then(r => r.json())
    setMedias(data.medias ?? [])
    setLoading(false)
  }

  useEffect(() => { loadMedias() }, [wsId, token, dateFrom, dateTo, filterType, filterLie])

  async function uploadFiles(files) {
    if (!files.length) return
    setUploading(true)
    try {
      const fd = new FormData()
      for (const f of files) fd.append('files', f)
      fd.append('date_prise', anchor)
      const res = await fetch(API_ROUTES.JD_MEDIAS(wsId), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!res.ok) {
        const err = await res.text()
        console.error('[upload] server error', res.status, err)
        alert(`Erreur lors de l'upload (${res.status}) : ${err.slice(0, 200)}`)
        return
      }
      const data = await res.json()
      const firstDate = data.medias?.[0]?.date_prise
      if (firstDate) setAnchor(firstDate)
      await loadMedias()
    } catch (err) {
      console.error('[upload] fetch error', err)
      alert(`Erreur réseau : ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  async function deleteMedia(id) {
    if (!confirm('Supprimer ce média ?')) return
    await fetch(API_ROUTES.JD_MEDIA(wsId, id), { method: 'DELETE', headers: authHeader(token) })
    setSelected(s => { const n = new Set(s); n.delete(id); return n })
    await loadMedias()
  }

  function toggleSelect(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // 1. Créer une note avec la date de la 1ère image sélectionnée
  function createNote() {
    const ids = [...selected]
    const firstMedia = medias.find(m => ids.includes(m.id))
      ?? [...groupByDate(medias).flatMap(([, items]) => items)].find(m => ids.includes(m.id))
    navigate(`/jourdoc/${wsId}/new`, {
      state: { media_ids: ids, note_date: firstMedia?.date_prise ?? anchor }
    })
  }

  // Liste plate pour lightbox prev/next
  const flatMedias = useMemo(() => groupByDate(medias).flatMap(([, items]) => items), [medias])
  const groups = useMemo(() => groupByDate(medias), [medias])

  async function scanInbox() {
    setScanning(true)
    try {
      const res = await fetch(`/api/jourdoc/${wsId}/inbox/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) { alert(`Erreur scan inbox : ${data.detail ?? data.error}`); return }
      if (data.total === 0) { alert('Inbox vide — aucun fichier à traiter.'); return }
      const msg = `${data.integrated?.length ?? 0} fichier(s) intégré(s) sur ${data.total}.`
        + (data.errors?.length ? `\n${data.errors.length} erreur(s) : ${data.errors.map(e => e.file).join(', ')}` : '')
      alert(msg)
      await loadMedias()
    } catch (err) {
      alert(`Erreur réseau : ${err.message}`)
    } finally {
      setScanning(false)
    }
  }

  const onDragOver  = e => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop = e => { e.preventDefault(); setDragging(false); uploadFiles([...e.dataTransfer.files]) }

  return (
    <div className="media-gallery">

      {/* ── Filtre période ── */}
      <div className="period-nav">
        <button className="period-nav__arrow" onClick={() => setAnchor(a => shiftAnchor(a, period, -1))}>‹</button>
        <span className="period-nav__label">{rangeLabel(anchor, period)}</span>
        <button className="period-nav__arrow" onClick={() => setAnchor(a => shiftAnchor(a, period, 1))}>›</button>
        <div className="period-nav__pills">
          {PERIODS.map(p => (
            <button key={p.key}
              className={`period-pill${period === p.key ? ' active' : ''}`}
              onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" style={{ padding: '.3rem .6rem', fontSize: '.8rem' }}
          onClick={() => setAnchor(today())}>Aujourd'hui</button>
        <button className="btn btn-ghost" style={{ padding: '.3rem .6rem', fontSize: '.8rem' }}
          onClick={scanInbox} disabled={scanning}>
          {scanning ? 'Scan…' : '📥 Inbox'}
        </button>
      </div>

      {/* Filtres secondaires */}
      <div className="media-gallery__filters">
        <select className="input" style={{ width: 'auto', padding: '.35rem .6rem', fontSize: '.875rem' }}
          value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tous types</option>
          <option value="photo">Photos</option>
          <option value="pdf">PDF</option>
        </select>
        <div className="period-nav__pills" style={{ gap: '.25rem' }}>
          {[['', 'Tous'], ['0', 'Non liés'], ['1', 'Liés']].map(([val, label]) => (
            <button key={val}
              className={`period-pill${filterLie === val ? ' active' : ''}`}
              onClick={() => setFilterLie(val)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Zone d'upload */}
      <div
        className={`media-upload-zone${dragging ? ' dragging' : ''}`}
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" multiple accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={e => uploadFiles([...e.target.files])} />
        {uploading ? (
          <span className="media-upload-zone__label">Envoi et traitement en cours…</span>
        ) : (
          <>
            <span className="media-upload-zone__icon">📤</span>
            <span className="media-upload-zone__label">
              Déposer des fichiers ici ou <strong>cliquer pour choisir</strong>
            </span>
            <span className="media-upload-zone__hint">Images (JPG PNG WEBP HEIC) · PDF · Max 1600 px · Date EXIF utilisée automatiquement</span>
          </>
        )}
      </div>

      {/* Galerie */}
      {loading ? (
        <div className="jd-loading">Chargement…</div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🖼️</div>
          <p>Aucun média sur cette période.</p>
        </div>
      ) : (
        groups.map(([date, items]) => (
          <div key={date} className="media-group">
            <h3 className="media-group__title">
              {fmtDate(date)}
              <span className="media-group__count">{items.length}</span>
            </h3>
            <div className="media-grid">
              {items.map(m => (
                <MediaCard
                  key={m.id}
                  media={m}
                  src={mediaUrl(wsId, m.id, token)}
                  selected={selected.has(m.id)}
                  onExpand={() => setLightboxIdx(flatMedias.findIndex(x => x.id === m.id))}
                  onSelect={() => toggleSelect(m.id)}
                  onNotes={() => navigate(`/jourdoc/${wsId}/media/${m.id}`)}
                  onDelete={() => deleteMedia(m.id)}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {/* Barre sélection */}
      {selected.size > 0 && (
        <div className="media-action-bar">
          <span className="media-action-bar__count">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
          <button className="btn btn-primary" onClick={createNote}>+ Créer une note</button>
          <button className="btn btn-danger" onClick={async () => {
            if (!confirm(`Supprimer ${selected.size} média(s) ?`)) return
            for (const id of selected) await deleteMedia(id)
            setSelected(new Set())
          }}>🗑</button>
          <button className="btn btn-ghost" onClick={() => setSelected(new Set())}>Annuler</button>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx >= 0 && (
        <Lightbox
          media={flatMedias[lightboxIdx]}
          src={mediaUrl(wsId, flatMedias[lightboxIdx]?.id, token)}
          onClose={() => setLightboxIdx(-1)}
          onPrev={lightboxIdx > 0 ? () => setLightboxIdx(i => i - 1) : null}
          onNext={lightboxIdx < flatMedias.length - 1 ? () => setLightboxIdx(i => i + 1) : null}
        />
      )}
    </div>
  )
}
