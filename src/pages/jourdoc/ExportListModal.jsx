import { useState } from 'react'
import { buildListExport } from './exportList'

// Modale d'export d'une liste filtrée (vue en l'état) → ZIP (Markdown + HTML imprimable).
// ids : identifiants des notes de la vue courante. defaultDir : 'asc' | 'desc'.
export default function ExportListModal({ wsId, token, ids, count, defaultDir = 'desc', onClose }) {
  const [dir, setDir] = useState(defaultDir)
  const [withAttachments, setWithAttachments] = useState(true)
  const [withLinks, setWithLinks] = useState(true)
  const [prog, setProg] = useState(null)  // { phase, done, total } | { error }

  const busy = prog && !prog.error && prog.phase !== 'done'
  const n = ids?.length ?? count ?? 0

  async function run() {
    setProg({ phase: 'manifest' })
    try {
      const { blob, filename, count: done } = await buildListExport({
        wsId, token, ids,
        opts: { dir, withAttachments, withLinks },
        onProgress: setProg,
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
      setProg({ phase: 'done', count: done })
    } catch (e) {
      setProg({ error: e.message })
    }
  }

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal__title">Exporter la liste <span>({n})</span></div>
        <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--text-muted)' }}>
          Génère un ZIP contenant la liste agrégée en <b>Markdown</b> et en <b>HTML imprimable</b>
          {' '}(→ « Enregistrer en PDF » depuis le navigateur).
        </p>

        <div className="form-field">
          <label className="form-label">Ordre (par date)</label>
          <div className="jd-seg">
            <button type="button" className={`jd-seg-btn${dir === 'desc' ? ' active' : ''}`}
              onClick={() => setDir('desc')}>↓ Récent → ancien</button>
            <button type="button" className={`jd-seg-btn${dir === 'asc' ? ' active' : ''}`}
              onClick={() => setDir('asc')}>↑ Ancien → récent</button>
          </div>
          <p style={{ margin: '.25rem 0 0', fontSize: '.75rem', color: 'var(--text-muted)' }}>
            Journal : date de référence · Documentation : date de création.
          </p>
        </div>

        <label className="media-picker__toggle">
          <input type="checkbox" checked={withAttachments} onChange={e => setWithAttachments(e.target.checked)} />
          Inclure les pièces jointes (dossier medias/ dans le ZIP)
        </label>
        <label className="media-picker__toggle">
          <input type="checkbox" checked={withLinks} onChange={e => setWithLinks(e.target.checked)} />
          Mentionner les notes liées
        </label>

        {prog && (
          <p style={{ margin: 0, fontSize: '.85rem', color: prog.error ? 'var(--color-error)' : 'var(--text)' }}>
            {prog.error ? `❌ ${prog.error}`
              : prog.phase === 'manifest' ? '⏳ Préparation…'
              : prog.phase === 'download' ? `⏳ Téléchargement des pièces ${prog.done}/${prog.total}…`
              : prog.phase === 'zip' ? '⏳ Compression du ZIP…'
              : prog.phase === 'done' ? `✅ Export terminé : ${prog.count} fiche${prog.count > 1 ? 's' : ''}`
                + (withAttachments ? ` · ${prog.mediaOk ?? 0}/${prog.mediaTotal ?? 0} pièce(s) jointe(s)` : '')
              : ''}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {prog?.phase === 'done' ? 'Fermer' : 'Annuler'}
          </button>
          <button type="button" className="btn btn-primary" onClick={run} disabled={busy || n === 0}>
            {busy ? '…' : '↓ Exporter'}
          </button>
        </div>
      </div>
    </div>
  )
}
