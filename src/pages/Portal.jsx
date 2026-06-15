import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import AppCard from '../components/AppCard'
import TopBar from '../components/TopBar'
import Footer from '../components/Footer'

export default function Portal() {
  const { t } = useTranslation()
  const { token, logout } = useAuth()
  const [apps, setApps] = useState([])
  const [user, setUser] = useState(null)

  useEffect(() => {
    fetch(API_ROUTES.ME_APPS, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setApps(data.apps ?? [])
        setUser(data.user ?? null)
      })
  }, [token])

  return (
    <div className="app-layout">
      <TopBar user={user} onLogout={logout} />
      <main className="main-content">
        <div className="portal-hero">
          <h1>{t('portal.greeting', { name: user?.username ?? '…' })}</h1>
          <p className="portal-hero__sub">{t('portal.subtitle')}</p>
        </div>
        {apps.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">📦</div>
            <p>{t('portal.noApps')}</p>
          </div>
        ) : (
          <div className="app-grid">
            {apps.map((app) => (
              <AppCard key={app.slug} app={app} token={token} />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
