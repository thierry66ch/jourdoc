// src/clipper/ClipperPreview.jsx — étape 3 : récapitulatif + enregistrement.

import React from 'react'
import { Btn, S } from './ui.jsx'

function names(ids, items) {
  const by = new Map(items.map((i) => [i.id, i.nom]))
  return ids.map((id) => by.get(id)).filter(Boolean)
}

export default function ClipperPreview({
  origin, pageUrl, title, wsName, taxonomy,
  objetIds, themeIds, docCategorieId,
  status, result, error, onBack, onClip, onClose,
}) {
  if (status === 'clipping') {
    return <p style={{ margin: 0 }}>⏳ Extraction et enregistrement… (5–15 s)</p>
  }

  if (status === 'done' && result) {
    return (
      <>
        <p style={{ margin: '0 0 8px' }}>✅ Note créée dans JourDoc.</p>
        <a
          href={`${origin}${result.noteUrl}`} target="_blank" rel="noreferrer"
          style={{ ...S.btn, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box', paddingTop: '13px' }}
        >
          Ouvrir la note
        </a>
        <Btn ghost onClick={onClose}>Fermer</Btn>
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
      <div style={{ ...S.list, maxHeight: 'none', padding: '10px' }}>
        <div style={recapRow}><span style={k}>Titre · </span>{title}</div>
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
