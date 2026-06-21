import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { mediaUrl, docCategorieBadgeStyle } from './hooks'
import Lightbox from './Lightbox'

const NATURE_ICON = { observation: '👁', activite: '⚡' }
const TYPE_ICON   = { journal: '📔', documentation: '📄' }

const PRIO_COLOR = { 4: '#db4035', 3: '#ff9933', 2: '#4073ff', 1: '#aaa' }
const PRIO_LABEL = { 4: 'P1', 3: 'P2', 2: 'P3', 1: 'P4' }

function fmtDue(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })
}

function fmtNoteDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function NoteCard({ note, contextNoteIds, showDate = false }) {
  const { wsId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [lbIdx, setLbIdx] = useState(-1)

  const photoMedias = (note.medias ?? []).filter(m => m.type_media !== 'pdf' && m.type_media !== 'markdown')

  return (
    <div className="jd-note-card" onClick={() => navigate(`/jourdoc/${wsId}/notes/${note.id}`,
    contextNoteIds?.length ? { state: { noteIds: contextNoteIds } } : undefined)}>
      <div className="jd-note-card__top">
        {note.type === 'documentation' && note.doc_categorie ? (
          <span className="jd-badge jd-badge--doc-cat" style={docCategorieBadgeStyle(note.doc_categorie.couleur)}>
            {note.doc_categorie.icon || '📄'} {note.doc_categorie.nom}
          </span>
        ) : (
          <span className={`jd-badge jd-badge-${note.nature ?? note.type}`}>
            {note.nature ? NATURE_ICON[note.nature] : TYPE_ICON[note.type]}
            {note.nature ?? note.type}
          </span>
        )}
        {note.doc_statut && (
          <span className="jd-badge jd-badge--doc-cat" style={{ color: note.doc_statut.couleur, borderColor: note.doc_statut.couleur }}>
            {note.doc_statut.icon} {note.doc_statut.nom}
          </span>
        )}
        {showDate && note.date && <span className="jd-note-card__date">{fmtNoteDate(note.date)}</span>}
        {note.themes?.length > 0
          ? note.themes.map(t => <span key={t.id} className="jd-note-card__theme">{t.nom}</span>)
          : note.theme_nom && <span className="jd-note-card__theme">{note.theme_nom}</span>}
      </div>

      <p className="jd-note-card__titre">{note.titre}</p>

      {(note.objets?.length > 0 || note.elements?.length > 0) && (
        <div className="jd-note-card__objets">
          {note.objets?.map(o => (
            <span key={o.id} className="jd-chip" onClick={e => {
              e.stopPropagation()
              navigate(`/jourdoc/${wsId}/objet/${o.id}`)
            }}>{o.nom}</span>
          ))}
          {note.elements?.map(e => (
            <span key={e.id} className="jd-chip jd-chip--element">{e.nom}</span>
          ))}
        </div>
      )}

      {/* Vignettes médias — clic → lightbox (sans naviguer vers la note) */}
      {note.medias?.length > 0 && (
        <div className="jd-note-card__medias">
          {note.medias.slice(0, 5).map((m, idx) =>
            m.type_media === 'pdf'
              ? <div key={m.id} className="jd-thumb jd-thumb--pdf"
                  onClick={e => e.stopPropagation()} title={m.nom_original}>📄</div>
              : m.type_media === 'markdown'
              ? <div key={m.id} className="jd-thumb jd-thumb--pdf"
                  onClick={e => e.stopPropagation()} title={m.nom_original}>📝</div>
              : <img key={m.id} className="jd-thumb" src={mediaUrl(wsId, m.id, token)}
                  alt="" loading="lazy" title={m.nom_original}
                  onClick={e => {
                    e.stopPropagation()
                    const pIdx = photoMedias.findIndex(pm => pm.id === m.id)
                    if (pIdx >= 0) setLbIdx(pIdx)
                  }} />
          )}
          {note.medias.length > 5 && (
            <div className="jd-thumb jd-thumb--more">+{note.medias.length - 5}</div>
          )}
        </div>
      )}

      {/* Chip Todoist */}
      {note.tache_todoist_id && (
        <div className="jd-note-card__todoist" onClick={e => e.stopPropagation()}>
          <span className="todoist-logo-sm">✓</span>
          {note.tache_todoist_done
            ? <span className="jd-note-card__todoist-done">Terminée</span>
            : <>
                {note.tache_todoist_priority != null && (
                  <span className="jd-note-card__todoist-prio"
                    style={{ color: PRIO_COLOR[note.tache_todoist_priority] }}>
                    {PRIO_LABEL[note.tache_todoist_priority]}
                  </span>
                )}
                {note.tache_todoist_due && (
                  <span className="jd-note-card__todoist-due">📅 {fmtDue(note.tache_todoist_due)}</span>
                )}
              </>
          }
        </div>
      )}

      {/* Lightbox sur les photos de cette note */}
      {lbIdx >= 0 && (
        <Lightbox
          media={photoMedias[lbIdx]}
          src={mediaUrl(wsId, photoMedias[lbIdx]?.id, token)}
          onClose={() => setLbIdx(-1)}
          onPrev={lbIdx > 0 ? () => setLbIdx(i => i - 1) : null}
          onNext={lbIdx < photoMedias.length - 1 ? () => setLbIdx(i => i + 1) : null}
        />
      )}
    </div>
  )
}
