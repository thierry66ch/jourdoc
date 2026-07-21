// src/clipper/ClipperPreview.jsx — étape 3 : récapitulatif + enregistrement.

import React from 'react'
import { Btn, S } from './ui.jsx'

function names(ids, items) {
  const by = new Map(items.map((i) => [i.id, i.nom]))
  return ids.map((id) => by.get(id)).filter(Boolean)
}

export default function ClipperPreview({
  origin, wsId, pageUrl, title, titreAlt, wsName, taxonomy,
  objetIds, themeIds, docCategorieId, existing = [],
  status, result, error, undoStatus = 'idle', onUndo, onBack, onClip, onClose,
}) {
  if (status === 'clipping') {
    return <p style={{ margin: 0 }}>⏳ Extraction et enregistrement… (5–15 s)</p>
  }

  if (status === 'done' && result) {
    const img = result.images
    return (
      <>
        <p style={{ margin: '0 0 8px' }}>✅ Note créée dans JourDoc.</p>
        {img && (img.uploaded > 0 || img.failed > 0) && (
          <p style={S.note}>
            🖼 {img.uploaded} image{img.uploaded > 1 ? 's' : ''} rapatriée{img.uploaded > 1 ? 's' : ''}
            {img.failed > 0 ? ` · ${img.failed} échec${img.failed > 1 ? 's' : ''} (URL conservée)` : ''}
          </p>
        )}
        {/* Navigation dans la MÊME fenêtre (pas de nouvel onglet) : le clipper devient
            la note → évite une fenêtre clipper orpheline en arrière-plan (déroutant sur
            mobile). L'annulation reste possible tant qu'on n'a pas ouvert la note. */}
        <a
          href={`${origin}${result.noteUrl}`}
          style={{ ...S.btn, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box', paddingTop: '13px' }}
        >
          Ouvrir la note
        </a>
        {error && <p style={S.err}>❌ {error}</p>}
        <div style={S.row}>
          <Btn ghost style={{ marginTop: 0 }} disabled={undoStatus === 'undoing'} onClick={onUndo}>
            {undoStatus === 'undoing' ? 'Annulation…' : '↩︎ Annuler la capture'}
          </Btn>
          <Btn ghost style={{ marginTop: 0 }} disabled={undoStatus === 'undoing'} onClick={onClose}>Fermer</Btn>
        </div>
        <p style={S.note}>« Ouvrir la note » remplace cette fenêtre. « Annuler » supprime la note et le .md joint (+ images) créés à l'instant.</p>
      </>
    )
  }

  const cat = docCategorieId ? (taxonomy.docCategories.find((c) => c.id === docCategorieId)?.nom) : null
  const objs = names(objetIds, taxonomy.objets || [])
  const thms = names(themeIds, taxonomy.themes || [])

  const recapRow = { fontSize: '13px', marginTop: '6px' }
  const k = { opacity: .6 }

  return (
    <>
      {existing.length > 0 && (
        <div style={{
          background: 'rgba(245,158,11,.14)', border: '1px solid #f59e0b',
          borderRadius: '8px', padding: '8px 10px', fontSize: '12.5px', marginBottom: '10px',
        }}>
          ⚠️ Déjà clippé dans ce workspace ({existing.length}) :{' '}
          {existing.slice(0, 3).map((n, i) => (
            <span key={n.id}>
              {i > 0 && ', '}
              <a href={`${origin}/jourdoc/${wsId}/notes/${n.id}`} target="_blank" rel="noreferrer"
                style={{ color: '#fbbf24' }}>{n.titre || `note #${n.id}`}</a>
            </span>
          ))}
          . Tu peux clipper quand même.
        </div>
      )}

      <div style={{ ...S.list, maxHeight: 'none', padding: '10px' }}>
        <div style={recapRow}><span style={k}>Titre · </span>{title}</div>
        {titreAlt && <div style={recapRow}><span style={k}>Titre court · </span>{titreAlt}</div>}
        <div style={recapRow}><span style={k}>Workspace · </span>{wsName}</div>
        {cat && <div style={recapRow}><span style={k}>Catégorie · </span>{cat}</div>}
        {objs.length > 0 && <div style={recapRow}><span style={k}>Objets · </span>{objs.join(', ')}</div>}
        {thms.length > 0 && <div style={recapRow}><span style={k}>Thèmes · </span>{thms.join(', ')}</div>}
        <div style={{ ...recapRow, wordBreak: 'break-all' }}><span style={k}>Source · </span>{pageUrl}</div>
      </div>
      <p style={S.note}>Crée une note documentation + le .md joint (images en URLs absolues, rapatriement en phase 4).</p>

      {status === 'error' && <p style={S.err}>❌ {error}</p>}

      <div style={S.row}>
        <Btn ghost style={{ marginTop: 0 }} onClick={onBack}>Retour</Btn>
        <Btn style={{ marginTop: 0 }} onClick={onClip}>Clipper</Btn>
      </div>
    </>
  )
}
