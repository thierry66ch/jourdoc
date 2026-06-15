import { useTranslation } from 'react-i18next'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from './ThemeToggle'

const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)

export default function TopBar({ user, isAdmin, onLogout }) {
  const { t } = useTranslation()

  return (
    <header className="topbar">
      <a href="/" className="topbar__brand">
        <img src="/icon-192.png" alt="pogil" className="topbar__logo" />
        <span>pogil</span>
        {isAdmin && <span className="topbar__badge">admin</span>}
      </a>

      <div className="topbar__spacer" />

      <div className="topbar__controls">
        {user && (
          <span className="topbar__user">{user.username ?? user.email}</span>
        )}
        <LanguageSwitcher />
        <ThemeToggle />
        {onLogout && (
          <button className="icon-btn" onClick={onLogout} title={t('portal.logout')} aria-label={t('portal.logout')}>
            <LogoutIcon />
          </button>
        )}
      </div>
    </header>
  )
}
