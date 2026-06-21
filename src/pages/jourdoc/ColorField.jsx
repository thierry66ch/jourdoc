import { useState, useRef, useEffect } from 'react'
import { HexColorPicker } from 'react-colorful'

const PRESETS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#10b981',
  '#14b8a6', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
  '#ec4899', '#64748b', '#78716c', '#94a3b8',
]

/**
 * Sélecteur de couleur : pastille déclenchant un popover (carré saturation/teinte
 * via react-colorful) + nuances prédéfinies + saisie hex.
 * Props : value (hex), onChange(hex) en direct, onClose() à la fermeture (pour sauver).
 */
export default function ColorField({ value, onChange, onClose }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const color = value || '#d97706'

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); onClose?.() }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onClose])

  function setHex(v) {
    let h = v.startsWith('#') ? v : `#${v}`
    onChange(h)
  }

  return (
    <div className="color-field" ref={ref}>
      <button type="button" className="color-field__swatch" style={{ background: color }}
        onClick={() => setOpen(o => !o)} aria-label="Couleur" title="Choisir une couleur" />
      {open && (
        <div className="color-field__pop">
          <HexColorPicker color={color} onChange={onChange} />
          <div className="color-field__presets">
            {PRESETS.map(p => (
              <button key={p} type="button" className="color-field__preset" style={{ background: p }}
                onClick={() => onChange(p)} aria-label={p} />
            ))}
          </div>
          <input className="input color-field__hex" value={color}
            onChange={e => setHex(e.target.value)} maxLength={7} spellCheck={false} />
        </div>
      )}
    </div>
  )
}
