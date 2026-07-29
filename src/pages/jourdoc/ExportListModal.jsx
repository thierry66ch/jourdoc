import { useState } from 'react'
import { buildListExport } from './exportList'

// Modale d'export d'une liste filtrée (vue en l'état) → ZIP (Markdown + HTML imprimable).
// Deux entrées possibles :
//   - sections : [{ titre, ids }] → l'export reflète EXACTEMENT l'affichage (ordre +
//     groupes + intertitres). L'ordre est figé, pas d'option de tri par date.
//   - ids : liste plate → export trié par date (option asc/desc), sans intertitres.
export default function ExportListModal({ wsId, token, ids, sections, count, defaultDir = 'desc', onClose }) {
  const [dir, setDir] = useState(defaultDir)
  const [withAttachments, setWithAttachments] = useState(true)
  const [withLinks, setWithLinks] = useState(true)
  const [withCsv, setWithCsv] = useState(true)
  const [prog, setProg] = useState(null)  // { phase, done, total } | { error }

  const structured = Array.isArray(sections)
  const busy = prog && !prog.error && prog.phase !== 'done'
  const n = structured ? sections.reduce((s, sec) => s + sec.ids.length, 0) : (ids?.length ?? count ?? 0)

  async function run() {
    setProg({ phase: 'manifest' })
    try {
      const { blob, filename, count: done, mediaOk, mediaTotal } = await buildListExport({
        wsId, token, ids, sections,
        opts: { dir, withAttachments, withLinks, withCsv },
        onProgress: setProg,
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
      setProg({ phase: 'done', count: done, mediaOk, mediaTotal })
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

        {structured ? (
          <p style={{ margin: 0, fontSize: '.8rem', color: 'var(--text-muted)' }}>
            L'export reprend l'<b>ordre et les groupes affichés</b> ({sections.length} section{sections.length > 1 ? 's' : ''}).
          </p>
        ) : (
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
        )}

        <label className="media-picker__toggle">
          <input type="checkbox" checked={withAttachments} onChange={e => setWithAttachments(e.target.checked)} />
          Inclure les pièces jointes (dossier medias/ dans le ZIP)
        </label>
        <label className="media-picker__toggle">
          <input type="checkbox" checked={withLinks} onChange={e => setWithLinks(e.target.checked)} />
          Mentionner les notes liées
        </label>
        <label className="media-picker__toggle">
          <input type="checkbox" checked={withCsv} onChange={e => setWithCsv(e.target.checked)} />
          Inclure un CSV (données en colonnes, pour tableur)
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
