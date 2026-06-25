// src/clipper/ClipperOverlay.jsx — overlay du clipper.
//
// Phase 1 (infra & auth) : récupère le JWT via le bridge et affiche le statut.
// Les étapes workspace / classification / aperçu arriveront en phases 2-3.

import React, { useEffect, useState } from 'react'
import { getTokenViaBridge } from './bridge.js'

const PANEL = {
  position: 'fixed', top: '20px', right: '20px', zIndex: 2147483647,
  width: '340px', maxWidth: 'calc(100vw - 24px)',
  background: '#1a1a2e', color: '#e6e6f0',
  borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,.45)',
  font: '14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  overflow: 'hidden',
}
const HEAD = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '12px 14px', background: '#6366f1', color: '#fff', fontWeight: 600,
}
const BODY = { padding: '14px' }
const CLOSE = {
  cursor: 'pointer', background: 'transparent', border: 0, color: '#fff',
  fontSize: '20px', lineHeight: 1, width: '32px', height: '32px',
}
const ROW = { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }
const CODE = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px',
  background: '#0f0f1a', padding: '8px', borderRadius: '6px', wordBreak: 'break-all',
}

function mask(token) {
  if (!token) return ''
  if (token.length <= 16) return token
  return `${token.slice(0, 8)}…${token.slice(-8)}`
}

export default function ClipperOverlay({ origin, pageUrl, pageTitle, onClose }) {
  const [status, setStatus] = useState('loading') // loading | authed | anon
  const [token, setToken] = useState(null)

  useEffect(() => {
    let alive = true
    // Laisse le temps à l'iframe bridge de charger avant d'interroger.
    const id = setTimeout(async () => {
      const t = await getTokenViaBridge()
      if (!alive) return
      setToken(t)
      setStatus(t ? 'authed' : 'anon')
    }, 400)
    return () => { alive = false; clearTimeout(id) }
  }, [])

  return (
    <div style={PANEL}>
      <div style={HEAD}>
        <span>JourDoc Clipper</span>
        <button style={CLOSE} onClick={onClose} aria-label="Fermer">×</button>
      </div>
      <div style={BODY}>
        {status === 'loading' && <p style={{ margin: 0 }}>Connexion à JourDoc…</p>}

        {status === 'authed' && (
          <>
            <p style={{ margin: '0 0 4px' }}>✅ Authentifié sur JourDoc.</p>
            <div style={CODE}>token : {mask(token)}</div>
          </>
        )}

        {status === 'anon' && (
          <p style={{ margin: 0 }}>
            ⚠️ Aucun JWT trouvé.<br />
            Connecte-toi sur <strong>{origin.replace(/^https?:\/\//, '')}</strong>,
            puis relance le clipper. (Mini-login intégré en phase 3.)
          </p>
        )}

        <div style={{ ...CODE, marginTop: '12px' }}>
          <div><strong>page</strong> : {pageTitle || '(sans titre)'}</div>
          <div><strong>url</strong> : {pageUrl}</div>
        </div>

        <div style={ROW}>
          <small style={{ opacity: .6 }}>Phase 1 — infra & auth</small>
        </div>
      </div>
    </div>
  )
}
