// src/clipper/ClipperMeta.jsx — étape 2 : titre + classification minimale
// (objets, thèmes, catégorie de documentation). Éléments/statut : non exposés au clip.

import React from 'react'
import { Btn, MultiPicker, S } from './ui.jsx'

function toggle(list, id) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

export default function ClipperMeta({
  taxonomy, title, setTitle,
  objetIds, setObjetIds, themeIds, setThemeIds, docCategorieId, setDocCategorieId,
  onBack, onNext,
}) {
  const { objets = [], themes = [], docCategories = [] } = taxonomy || {}

  return (
    <>
      <label style={S.label}>Titre de la note</label>
      <input style={S.field} value={title} onChange={(e) => setTitle(e.target.value)} />

      {docCategories.length > 0 && (
        <>
          <label style={S.label}>Catégorie</label>
          <select
            style={S.field}
            value={docCategorieId ?? ''}
            onChange={(e) => setDocCategorieId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— aucune —</option>
            {docCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.nom}</option>
            ))}
          </select>
        </>
      )}

      {objets.length > 0 && (
        <MultiPicker label="Objets" items={objets} selected={objetIds} onToggle={(id) => setObjetIds(toggle(objetIds, id))} />
      )}
      {themes.length > 0 && (
        <MultiPicker label="Thèmes" items={themes} selected={themeIds} onToggle={(id) => setThemeIds(toggle(themeIds, id))} />
      )}

      <div style={S.row}>
        <Btn ghost style={{ marginTop: 0 }} onClick={onBack}>Retour</Btn>
        <Btn style={{ marginTop: 0 }} disabled={!title.trim()} onClick={onNext}>Suivant</Btn>
      </div>
    </>
  )
}
