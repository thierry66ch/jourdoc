import { useState } from 'react'
import { Link } from 'react-router-dom'
import { API_ROUTES } from '@pogil/shared'

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('')
  const [status, setStatus] = useState(null) // null | 'sent' | 'error'
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(API_ROUTES.AUTH_FORGOT_PASSWORD, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      })
      if (!res.ok) throw new Error()
      setStatus('sent')
    } catch {
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Mot de passe oublié</h1>

        {status === 'sent' ? (
          <div>
            <p className="msg msg-success">
              Si ce compte existe, un email de réinitialisation a été envoyé.
            </p>
            <p style={{ marginTop: '1rem', textAlign: 'center' }}>
              <Link to="/login">← Retour à la connexion</Link>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {status === 'error' && (
              <p className="msg msg-error">Une erreur est survenue. Réessayez.</p>
            )}
            <div className="form-field">
              <label className="form-label" htmlFor="identifier">Email ou nom d'utilisateur</label>
              <input
                id="identifier"
                className="input"
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
              <Link to="/login" style={{ fontSize: '.875rem' }}>← Retour</Link>
              <button className="btn btn-primary" type="submit" disabled={loading || !identifier}>
                {loading ? '…' : 'Envoyer le lien'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
