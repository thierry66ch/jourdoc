// Positionne un menu flottant (slash « / », mention « @ ») par rapport au curseur.
// Placé sous le curseur par défaut, mais BASCULÉ AU-DESSUS s'il n'y a pas assez de
// place en dessous (dernière ligne d'une note près du clavier mobile). La hauteur max
// est plafonnée à l'espace disponible (le menu défile sinon). Tient compte du clavier
// via visualViewport.
export function positionMenu(el, rect, { width = 220, margin = 8, gap = 4 } = {}) {
  if (!el || !rect) return
  const vv = window.visualViewport
  const viewTop = vv ? vv.offsetTop : 0
  const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight

  const spaceBelow = viewBottom - rect.bottom
  const spaceAbove = rect.top - viewTop
  const flipUp = spaceBelow < 260 && spaceAbove > spaceBelow

  const maxH = Math.max(120, Math.min(300, (flipUp ? spaceAbove : spaceBelow) - margin))
  el.style.maxHeight = `${maxH}px`
  el.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`

  if (flipUp) {
    el.style.top = 'auto'
    el.style.bottom = `${window.innerHeight - rect.top + gap}px`
  } else {
    el.style.bottom = 'auto'
    el.style.top = `${rect.bottom + gap}px`
  }
}
