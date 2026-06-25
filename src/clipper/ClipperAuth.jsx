// src/clipper/ClipperAuth.jsx — mini-login (same-origin, dans la fenêtre JourDoc).
// La fenêtre étant first-party, on lit d'abord le token du localStorage (cf.
// ClipperApp) ; ce formulaire ne sert que si aucune session valide n'est présente.

import React, { useState } from 'react'
import { Btn, S } from './ui.jsx'

export default function ClipperAuth({ onToken, note }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!identifier || !password) { setError('Identifiant et mot de passe requis.'); return }
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/clip/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`)
      onToken(data.token)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <p style={{ margin: 0 }}>Connecte-toi à JourDoc.</p>
      {note && <p style={S.note}>{note}</p>}
      <label style={S.label}>Identifiant ou e-mail</label>
      <input style={S.field} autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
      <label style={S.label}>Mot de passe</label>
      <input style={S.field} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <Btn type="submit" disabled={busy}>{busy ? '…' : 'Se connecter'}</Btn>
      {error && <p style={S.err}>{error}</p>}
    </form>
  )
}
