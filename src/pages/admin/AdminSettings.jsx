import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'

export default function AdminSettings() {
  const { t } = useTranslation()
  const { adminToken } = useAuth()
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('form')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRequestOtp(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!newEmail && !newPassword) return setError(t('admin.settings.errorEmpty'))
    if (newPassword && newPassword !== confirmPassword) return setError(t('admin.settings.errorPasswordMismatch'))
    setLoading(true)
    try {
      const res = await fetch(API_ROUTES.ADMIN_SETTINGS_REQUEST_OTP, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      if (!res.ok) throw new Error()
      setStep('otp')
    } catch {
      setError(t('admin.settings.errorRequest'))
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(API_ROUTES.ADMIN_SETTINGS_CONFIRM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ otp, newEmail: newEmail || undefined, newPassword: newPassword || undefined }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setSuccess(t('admin.settings.success'))
      setStep('form')
      setNewEmail(''); setNewPassword(''); setConfirmPassword(''); setOtp('')
    } catch (err) {
      setError(err.message === 'Invalid or expired OTP'
        ? t('admin.settings.errorOtp')
        : t('admin.settings.errorRequest'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {success && <p className="msg msg-success" style={{ margin: '1rem 1.5rem 0' }}>{success}</p>}
      {step === 'form' ? (
        <form onSubmit={handleRequestOtp} className="settings-form">
          {error && <p className="msg msg-error">{error}</p>}
          <div className="form-field">
            <label className="form-label">{t('admin.settings.newEmail')}</label>
            <input className="input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={t('admin.settings.newEmailPlaceholder')} />
          </div>
          <div className="form-field">
            <label className="form-label">{t('admin.settings.newPassword')}</label>
            <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t('admin.settings.newPasswordPlaceholder')} />
          </div>
          {newPassword && (
            <div className="form-field">
              <label className="form-label">{t('admin.settings.confirmPassword')}</label>
              <input className="input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t('admin.settings.confirmPasswordPlaceholder')} />
            </div>
          )}
          <div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? '…' : t('admin.settings.requestOtp')}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleConfirm} className="settings-form">
          <p className="msg msg-info">{t('admin.settings.otpSent')}</p>
          {error && <p className="msg msg-error">{error}</p>}
          <div className="form-field">
            <label className="form-label">{t('admin.otp')}</label>
            <input
              className="input input-otp"
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              autoFocus
              required
            />
          </div>
          <div className="form-actions">
            <button className="btn btn-ghost" type="button" onClick={() => { setStep('form'); setOtp(''); setError('') }}>
              {t('admin.cancel')}
            </button>
            <button className="btn btn-primary" type="submit" disabled={loading || otp.length < 6}>
              {loading ? '…' : t('admin.verify')}
            </button>
          </div>
        </form>
      )}
    </>
  )
}
