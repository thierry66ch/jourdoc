import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import Footer from '../../components/Footer'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import ThemeToggle from '../../components/ThemeToggle'

export default function AdminLogin() {
  const { t } = useTranslation()
  const { adminLogin } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCredentials(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(API_ROUTES.ADMIN_LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) throw new Error()
      setStep('otp')
    } catch {
      setError(t('login.error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(API_ROUTES.ADMIN_VERIFY_OTP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      })
      if (!res.ok) throw new Error()
      const { token } = await res.json()
      adminLogin(token)
      navigate('/admin')
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
            <div className="auth-card__icon-mark">⚙</div>
          </div>

          <div className="auth-card__head">
            <h1>{t('admin.login')}</h1>
            <p>{step === 'credentials' ? t('admin.loginSubtitle') : t('admin.otpSent')}</p>
          </div>

          <div className="step-indicator">
            <div className={`step-indicator__dot ${step === 'credentials' ? 'current' : 'done'}`} />
            <div className={`step-indicator__dot ${step === 'otp' ? 'current' : ''}`} />
          </div>

          {step === 'credentials' ? (
            <form onSubmit={handleCredentials} className="auth-form">
              {error && <p className="msg msg-error">{error}</p>}
              <div className="form-field">
                <label className="form-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  placeholder="admin@pogil.ch"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
          ) : (
            <form onSubmit={handleOtp} className="auth-form">
              {error && <p className="msg msg-error">{error}</p>}
              <div className="form-field">
                <label className="form-label" htmlFor="otp">{t('admin.otp')}</label>
                <input
                  id="otp"
                  className="input input-otp"
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                />
              </div>
              <button className="btn btn-primary btn-full" type="submit" disabled={loading || otp.length < 6}>
                {loading ? '…' : t('admin.verify')}
              </button>
              <button type="button" className="btn btn-ghost btn-full" onClick={() => { setStep('credentials'); setOtp(''); setError('') }}>
                ← {t('admin.backToLogin')}
              </button>
            </form>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
