import { useEffect } from 'react'
import { useSwipe } from './hooks'

export default function Lightbox({ media, src, onClose, onPrev, onNext }) {
  // Swipe robuste (ignore le scroll vertical incliné) + stop la propagation
  // pour ne pas déclencher en plus la navigation de la vue sous-jacente.
  const swipe = useSwipe({ onRight: () => onPrev?.(), onLeft: () => onNext?.() })

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowLeft')   onPrev?.()
      if (e.key === 'ArrowRight')  onNext?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  if (!media) return null

  return (
    <div className="lightbox" onClick={onClose}
      onTouchStart={e => { e.stopPropagation(); swipe.onTouchStart(e) }}
      onTouchEnd={e => { e.stopPropagation(); swipe.onTouchEnd(e) }}>
      {/* Précédent */}
      {onPrev && (
        <button className="lightbox__nav lightbox__nav--prev"
          onClick={e => { e.stopPropagation(); onPrev() }}>‹</button>
      )}

      {/* Contenu */}
      <div className="lightbox__content" onClick={e => e.stopPropagation()}>
        {media.type_media === 'pdf' ? (
          <div className="lightbox__pdf" onClick={e => e.stopPropagation()}>
            <iframe
              src={src}
              title={media.nom_original}
              className="lightbox__pdf-frame"
            />
            <a href={src} target="_blank" rel="noopener noreferrer"
              className="lightbox__pdf-open">Ouvrir dans un nouvel onglet ↗</a>
          </div>
        ) : (
          <img src={src} alt={media.nom_original} className="lightbox__img" />
        )}
        <div className="lightbox__caption">
          <span>{media.nom_original}</span>
          {media.date_prise && <span>{media.date_prise}</span>}
        </div>
      </div>

      {/* Suivant */}
      {onNext && (
        <button className="lightbox__nav lightbox__nav--next"
          onClick={e => { e.stopPropagation(); onNext() }}>›</button>
      )}

      {/* Fermer */}
      <button className="lightbox__close" onClick={onClose}>×</button>
    </div>
  )
}
