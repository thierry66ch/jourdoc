import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'
import NoteCard from './NoteCard'
import Lightbox from './Lightbox'

export default function MediaDetail() {
  const { wsId, mediaId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [media, setMedia] = useState(null)
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(API_ROUTES.JD_MEDIAS(wsId), { headers: authHeader(token) })
        .then(r => r.json())
        .then(d => (d.medias ?? []).find(m => m.id === Number(mediaId))),
      fetch(API_ROUTES.JD_MEDIA_NOTES(wsId, mediaId), { headers: authHeader(token) })
        .then(r => r.json())
        .then(d => d.notes ?? []),
    ]).then(([m, n]) => { setMedia(m ?? null); setNotes(n) })
      .finally(() => setLoading(false))
  }, [wsId, mediaId, token])

  return (
    <div className="jd-media-detail">
      <div className="jd-form-header">
        <button className="btn btn-ghost" style={{ padding: '.35rem .6rem', fontSize: '.875rem' }}
          onClick={() => navigate(-1)}>← Retour</button>
        <h2 style={{ wordBreak: 'break-all' }}>{media?.nom_original ?? `Média #${mediaId}`}</h2>
      </div>

      {/* Aperçu */}
      {media && (
        <div className="jd-media-detail__preview" onClick={() => media.type_media !== 'pdf' && setLightbox(true)}>
          {media.type_media === 'pdf' ? (
            <div className="jd-media-detail__pdf">📄<p>{media.nom_original}</p></div>
          ) : (
            <img src={`/${media.fichier}`} alt={media.nom_original} className="jd-media-detail__img" />
          )}
          {media.type_media !== 'pdf' && (
            <span className="jd-media-detail__zoom">🔍 Agrandir</span>
          )}
        </div>
      )}

      {/* Notes liées */}
      <h3 className="jd-manager__title" style={{ marginTop: '1.5rem' }}>
        Notes liées {notes.length > 0 && <span className="badge badge-accent">{notes.length}</span>}
      </h3>

      {loading ? (
        <div className="jd-loading">Chargement…</div>
      ) : notes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📋</div>
          <p>Aucune note liée à ce média.</p>
        </div>
      ) : (
        <div className="jd-notes-list">
          {notes.map(note => <NoteCard key={note.id} note={note} />)}
        </div>
      )}

      {lightbox && media && (
        <Lightbox media={media} onClose={() => setLightbox(false)} />
      )}
    </div>
  )
}
