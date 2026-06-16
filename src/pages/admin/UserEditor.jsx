import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function UserEditor({ user, adminToken, onClose }) {
  const { t } = useTranslation()
  const isNew = !user.id
  const [form, setForm] = useState({
    username:  user.username  ?? '',
    email:     user.email     ?? '',
    password:  '',
    is_active: user.is_active ?? true,
  })
  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    const url = isNew ? '/api/admin/users' : `/api/admin/users/${user.id}`
    await fetch(url, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(form),
    })
    onClose()
  }

  async function handleDelete() {
    if (!confirm(t('admin.confirmDelete', { name: user.username }))) return
    await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onSubmit={handleSave} onClick={e => e.stopPropagation()}>
        <h2 className="modal__title">
          {isNew ? t('admin.addUser') : <span>{user.username}</span>}
        </h2>

        <div className="form-field">
          <label className="form-label">{t('admin.username')}</label>
          <input className="input" name="username" placeholder={t('admin.username')}
            value={form.username} onChange={handleChange} required />
        </div>
        <div className="form-field">
          <label className="form-label">Email</label>
          <input className="input" name="email" type="email" placeholder="email@pogil.ch"
            value={form.email} onChange={handleChange} required />
        </div>
        <div className="form-field">
          <label className="form-label">
            {t('login.password')}
            {!isNew && <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}> ({t('admin.passwordOptional')})</span>}
          </label>
          <input className="input" name="password" type="password" placeholder={t('login.password')}
            value={form.password} onChange={handleChange} required={isNew} />
        </div>

        <label className="checkbox-row">
          <input name="is_active" type="checkbox" checked={form.is_active} onChange={handleChange} />
          {t('admin.active')}
        </label>

        <div className="modal-actions">
          {!isNew && (
            <button type="button" className="btn btn-danger" onClick={handleDelete}>
              {t('admin.delete')}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('admin.cancel')}</button>
          <button type="submit" className="btn btn-primary">{t('admin.save')}</button>
        </div>
      </form>
    </div>
  )
}
