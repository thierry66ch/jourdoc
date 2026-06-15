import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import Footer from '../components/Footer'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ThemeToggle from '../components/ThemeToggle'

export default function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(API_ROUTES.AUTH_LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })
      if (!res.ok) throw new Error()
      const { token } = await res.json()
      login(token)
      navigate('/')
    } catch {
      setError(t('login.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-auth">
      <header className="page-auth__header">
        <a href="/" className="page-auth__brand">
          <div className="page-auth__logo">P</div>
          <span>pogil</span>
        </a>
        <div className="page-auth__controls">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </header>

      <main className="page-auth__main">
        <div className="auth-card">
          <div className="auth-card__icon">
            <div className="auth-card__icon-mark">P</div>
          </div>

          <div className="auth-card__head">
            <h1>{t('login.title')}</h1>
            <p>{t('login.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && <p className="msg msg-error">{error}</p>}
            <div className="form-field">
              <label className="form-label" htmlFor="identifier">{t('login.email')}</label>
              <input
                id="identifier"
                className="input"
                type="text"
                placeholder={t('login.email')}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="password">{t('login.password')}</label>
              <input
                id="password"
                className="input"
                type="password"
                placeholder={t('login.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
              {loading ? '…' : t('login.submit')}
            </button>
          </form>

          <p className="auth-footer">
            <a href="/forgot-password">{t('login.forgotPassword')}</a>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  )
}
