import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { API_ROUTES } from '@pogil/shared'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!token) return (
    <div className="login-page">
      <div className="login-card">
        <p className="msg msg-error">Lien invalide.</p>
        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link to="/forgot-password">Demander un nouveau lien</Link>
        </p>
      </div>
    </div>
  )

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) return setError('Les mots de passe ne correspondent pas.')
    if (password.length < 8) return setError('Minimum 8 caractères.')
    setLoading(true)
    try {
      const res = await fetch(API_ROUTES.AUTH_RESET_PASSWORD, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) return setError(data.error ?? 'Erreur lors de la réinitialisation.')
      navigate('/login', { state: { message: 'Mot de passe modifié. Vous pouvez vous connecter.' } })
    } catch {
      setError('Erreur réseau.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Nouveau mot de passe</h1>
        <form onSubmit={handleSubmit}>
          {error && <p className="msg msg-error">{error}</p>}
          <div className="form-field">
            <label className="form-label" htmlFor="password">Nouveau mot de passe</label>
            <input id="password" className="input" type="password" value={password}
              onChange={e => setPassword(e.target.value)} required autoFocus />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="confirm">Confirmer</label>
            <input id="confirm" className="input" type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)} required />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button className="btn btn-primary" type="submit" disabled={loading || !password || !confirm}>
              {loading ? '…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
