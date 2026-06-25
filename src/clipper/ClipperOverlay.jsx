// src/clipper/ClipperOverlay.jsx — overlay du clipper.
//
// Phase 2 : auth popup (phase 1) + flux e2e minimal — choix du workspace, titre,
// puis POST /api/clip (Readability + Turndown côté serveur, sans images encore).
// La classification fine (objet/thème/catégorie) et le stepper arrivent en phase 3.

import React, { useState } from 'react'
import { getTokenViaPopup } from './bridge.js'

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
const BTN = {
  display: 'block', width: '100%', minHeight: '48px', marginTop: '12px',
  cursor: 'pointer', border: 0, borderRadius: '8px',
  background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: '15px',
}
const FIELD = {
  display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '6px',
  padding: '10px', borderRadius: '8px', border: '1px solid #33334d',
  background: '#0f0f1a', color: '#e6e6f0', fontSize: '14px',
}
const LABEL = { display: 'block', marginTop: '10px', fontSize: '12px', opacity: .8 }
const NOTE = { fontSize: '12px', opacity: .6, marginTop: '10px' }

// Sérialise le HTML de la page en retirant tout ce dont Readability n'a pas besoin
// (scripts, styles, SVG inline, médias, iframes, notre overlay, gros data: URIs).
// Réduit massivement la taille pour rester sous la limite serveur / Vercel.
function cleanPageHtml() {
  const root = document.documentElement.cloneNode(true)
  root.querySelectorAll(
    'script,style,noscript,svg,link,template,iframe,canvas,video,audio,object,embed,#jd-clipper-root'
  ).forEach((el) => el.remove())
  // Retire les images base64 volumineuses (rapatriées en phase 4 si besoin).
  root.querySelectorAll('img[src^="data:"]').forEach((img) => {
    if ((img.getAttribute('src') || '').length > 5000) img.removeAttribute('src')
  })
  return `<!DOCTYPE html>${root.outerHTML}`
}

export default function ClipperOverlay({ origin, pageUrl, pageTitle, onClose }) {
  // auth | ready | clipping | done | error
  const [phase, setPhase] = useState('auth')
  const [authState, setAuthState] = useState('idle') // idle | connecting | blocked
  const [token, setToken] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [wsId, setWsId] = useState(null)
  const [title, setTitle] = useState(pageTitle || '')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  }

  async function connect() {
    setAuthState('connecting')
    const { token: t, blocked } = await getTokenViaPopup(origin)
    if (blocked) { setAuthState('blocked'); return }
    if (!t) { setAuthState('idle'); setError('Pas connecté à JourDoc.'); return }
    setToken(t)
    // Charge les workspaces
    try {
      const r = await fetch(`${origin}/api/clip/workspaces`, { headers: { Authorization: `Bearer ${t}` } })
      if (!r.ok) throw new Error(`workspaces ${r.status}`)
      const { workspaces: ws } = await r.json()
      setWorkspaces(ws)
      setWsId(ws[0]?.id ?? null)
      setPhase('ready')
    } catch (e) {
      setError(`Chargement des workspaces impossible (${e.message}).`)
      setAuthState('idle')
    }
  }

  async function doClip() {
    if (!wsId) { setError('Choisis un workspace.'); return }
    setPhase('clipping'); setError('')
    try {
      const r = await fetch(`${origin}/api/clip`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          url: pageUrl,
          html: cleanPageHtml(),
          title: title.trim() || pageTitle,
          workspaceId: wsId,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error([data.error, data.detail].filter(Boolean).join(' — ') || `Erreur ${r.status}`)
      setResult(data)
      setPhase('done')
    } catch (e) {
      setError(e.message)
      setPhase('error')
    }
  }

  const host = origin.replace(/^https?:\/\//, '')

  return (
    <div style={PANEL}>
      <div style={HEAD}>
        <span>JourDoc Clipper</span>
        <button style={CLOSE} onClick={onClose} aria-label="Fermer">×</button>
      </div>
      <div style={BODY}>
        {phase === 'auth' && (
          <>
            {authState !== 'blocked' && <p style={{ margin: 0 }}>Connecte le clipper à ton compte JourDoc.</p>}
            {authState === 'blocked' && (
              <p style={{ margin: 0 }}>🚫 Popup bloquée. Autorise les pop-ups pour ce site, puis réessaie.</p>
            )}
            {authState === 'connecting'
              ? <p style={NOTE}>Ouverture de la fenêtre de connexion…</p>
              : <button style={BTN} onClick={connect}>Connexion à JourDoc</button>}
            {error && <p style={{ ...NOTE, color: '#ff9d9d' }}>{error}</p>}
          </>
        )}

        {phase === 'ready' && (
          <>
            <label style={LABEL}>Workspace</label>
            <select style={FIELD} value={wsId ?? ''} onChange={(e) => setWsId(Number(e.target.value))}>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>

            <label style={LABEL}>Titre de la note</label>
            <input style={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} />

            <button style={BTN} onClick={doClip}>Clipper cette page</button>
            <p style={NOTE}>Documentation + .md joint (images en phase 4).</p>
            {error && <p style={{ ...NOTE, color: '#ff9d9d' }}>{error}</p>}
          </>
        )}

        {phase === 'clipping' && (
          <p style={{ margin: 0 }}>⏳ Extraction et enregistrement… (5–15 s)</p>
        )}

        {phase === 'done' && result && (
          <>
            <p style={{ margin: '0 0 8px' }}>✅ Note créée dans JourDoc.</p>
            <a
              href={`${origin}${result.noteUrl}`}
              target="_blank" rel="noreferrer"
              style={{ ...BTN, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box', paddingTop: '13px' }}
            >
              Ouvrir la note
            </a>
            <button style={{ ...BTN, background: '#33334d' }} onClick={onClose}>Fermer</button>
          </>
        )}

        {phase === 'error' && (
          <>
            <p style={{ margin: 0, color: '#ff9d9d' }}>❌ {error}</p>
            <button style={BTN} onClick={() => setPhase('ready')}>Réessayer</button>
          </>
        )}

        <div style={NOTE}>{host} · Phase 2</div>
      </div>
    </div>
  )
}
