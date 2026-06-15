const PDF_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32 }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="9" y1="15" x2="15" y2="15"/>
    <line x1="9" y1="11" x2="15" y2="11"/>
  </svg>
)

/**
 * Vignette d'un média.
 * onExpand  → ouvre lightbox (click sur l'image)
 * onSelect  → sélectionne/désélectionne (checkbox)
 * onNotes   → navigue vers les notes liées
 * onDelete  → supprime le média
 */
export default function MediaCard({ media, selected, onExpand, onSelect, onNotes, onDelete, size = 'md' }) {
  const isPhoto = media.type_media !== 'pdf'
  const url = `/${media.fichier}`
  const sz = size === 'sm' ? 'media-card--sm' : size === 'lg' ? 'media-card--lg' : ''

  // Si pas de lightbox disponible, le clic image → sélection
  const handleImageClick = onExpand ?? onSelect

  return (
    <div className={`media-card ${sz}${selected ? ' media-card--selected' : ''}`}>

      {/* Zone image — click → lightbox (ou sélection en fallback) */}
      <div className="media-card__media" onClick={handleImageClick}
        role={handleImageClick ? 'button' : undefined}
        style={{ cursor: handleImageClick ? (onExpand ? 'zoom-in' : 'pointer') : 'default' }}>
        {isPhoto
          ? <img src={url} alt={media.nom_original} className="media-card__img" loading="lazy" />
          : <div className="media-card__pdf">
              {PDF_ICON}
              <span className="media-card__pdf-name">{(media.nom_original ?? '').replace(/\.pdf$/i, '')}</span>
            </div>
        }
      </div>

      {/* Checkbox de sélection (coin haut-gauche) */}
      {onSelect && (
        <button
          type="button"
          className={`media-card__sel${selected ? ' active' : ''}`}
          onClick={e => { e.stopPropagation(); onSelect() }}
          aria-pressed={selected}
          title={selected ? 'Désélectionner' : 'Sélectionner'}
        >
          {selected ? '✓' : ''}
        </button>
      )}

      {/* Notes liées (coin haut-droit, visible si lié) */}
      {onNotes && media.lie ? (
        <button type="button" className="media-card__linked" onClick={e => { e.stopPropagation(); onNotes() }}
          title="Voir les notes liées">🔗</button>
      ) : null}

      {/* Supprimer */}
      {onDelete && (
        <button type="button" className="media-card__del" onClick={e => { e.stopPropagation(); onDelete() }}
          title="Supprimer">×</button>
      )}

      {/* Date (coin bas) */}
      {media.date_prise && (
        <span className="media-card__date-label">{media.date_prise}</span>
      )}
    </div>
  )
}
