import { useEffect, useRef } from 'react'

export default function Lightbox({ media, onClose, onPrev, onNext }) {
  const touchX = useRef(null)

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

  function onTouchStart(e) { touchX.current = e.touches[0].clientX }
  function onTouchEnd(e) {
    if (touchX.current === null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (dx > 60) onPrev?.()
    else if (dx < -60) onNext?.()
  }

  return (
    <div className="lightbox" onClick={onClose}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
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
              src={`/${media.fichier}`}
              title={media.nom_original}
              className="lightbox__pdf-frame"
            />
            <a href={`/${media.fichier}`} target="_blank" rel="noopener noreferrer"
              className="lightbox__pdf-open">Ouvrir dans un nouvel onglet ↗</a>
          </div>
        ) : (
          <img src={`/${media.fichier}`} alt={media.nom_original} className="lightbox__img" />
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
