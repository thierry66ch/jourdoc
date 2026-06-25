// src/clipper/ClipperAuth.jsx — étape d'authentification.
// Deux voies : connexion rapide via popup first-party (si déjà connecté à JourDoc
// dans ce navigateur) OU mini-login par identifiants (POST /api/clip/login).

import React, { useState } from 'react'
import { Btn, S } from './ui.jsx'
import { getTokenViaPopup } from './bridge.js'

export default function ClipperAuth({ origin, onToken }) {
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function quickConnect() {
    setBusy(true); setError('')
    const { token, blocked } = await getTokenViaPopup(origin)
    setBusy(false)
    if (blocked) { setError('Popup bloquée — autorise les pop-ups, ou utilise les identifiants.'); setShowForm(true); return }
    if (!token) { setError('Pas de session JourDoc active. Connecte-toi ci-dessous.'); setShowForm(true); return }
    onToken(token)
  }

  async function loginWithCreds(e) {
    e.preventDefault()
    if (!identifier || !password) { setError('Identifiant et mot de passe requis.'); return }
    setBusy(true); setError('')
    try {
      const r = await fetch(`${origin}/api/clip/login`, {
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
    <>
      <p style={{ margin: 0 }}>Connecte le clipper à ton compte JourDoc.</p>
      <Btn disabled={busy} onClick={quickConnect}>
        {busy ? 'Connexion…' : 'Connexion rapide'}
      </Btn>

      {!showForm && (
        <Btn ghost onClick={() => { setShowForm(true); setError('') }}>Se connecter avec mes identifiants</Btn>
      )}

      {showForm && (
        <form onSubmit={loginWithCreds}>
          <label style={S.label}>Identifiant ou e-mail</label>
          <input style={S.field} autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          <label style={S.label}>Mot de passe</label>
          <input style={S.field} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Btn type="submit" disabled={busy}>{busy ? '…' : 'Se connecter'}</Btn>
        </form>
      )}

      {error && <p style={S.err}>{error}</p>}
    </>
  )
}
