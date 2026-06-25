// src/clipper/ClipperWorkspace.jsx — étape 1 : choix du workspace.

import React from 'react'
import { Btn, S } from './ui.jsx'

export default function ClipperWorkspace({ workspaces, wsId, setWsId, onNext }) {
  return (
    <>
      <label style={S.label}>Workspace</label>
      <select style={S.field} value={wsId ?? ''} onChange={(e) => setWsId(Number(e.target.value))}>
        {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      <Btn disabled={!wsId} onClick={onNext}>Suivant</Btn>
    </>
  )
}
