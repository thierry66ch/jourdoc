import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'
import TopBar from '../../components/TopBar'
import Footer from '../../components/Footer'

const NAV = [
  { path: '',               icon: '📔', label: 'Journal' },
  { path: 'calendar',       icon: '📅', label: 'Calendrier' },
  { path: 'medias',         icon: '📷', label: 'Médias' },
  { path: 'objets',         icon: '🌿', label: 'Objets' },
  { path: 'themes',         icon: '🏷️', label: 'Thèmes' },
  { path: 'todoist-tasks',  icon: '✓',  label: 'Tâches' },
  { path: 'analyse',        icon: '📊', label: 'Analyse' },
  { path: 'settings',       icon: '⚙️', label: 'Workspace' },
]

export default function JourDocApp() {
  const { wsId } = useParams()
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [ws, setWs] = useState(null)
  const [allWs, setAllWs] = useState([])
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [menuRect, setMenuRect] = useState(null)
  const wsBtnRef = useRef(null)

  useEffect(() => {
    fetch(API_ROUTES.JD_WS(wsId), { headers: authHeader(token) })
      .then(r => r.json())
      .then(data => setWs(data.workspace))
  }, [wsId, token])

  useEffect(() => {
    fetch(API_ROUTES.JD_WORKSPACES(), { headers: authHeader(token) })
      .then(r => r.json())
      .then(data => setAllWs(data.workspaces ?? []))
  }, [token])

  // Recharger ws si nom changé depuis WorkspaceManager
  useEffect(() => {
    const found = allWs.find(w => w.id === Number(wsId))
    if (found && ws && found.name !== ws.name) setWs(w => ({ ...w, name: found.name }))
  }, [allWs, wsId])

  // Sync Todoist silencieuse — au montage, changement workspace, et retour au premier plan
  useEffect(() => {
    function runSync() {
      if (document.hidden) return
      const key = `todoist_sync_${wsId}`
      const last = Number(sessionStorage.getItem(key) ?? 0)
      if (Date.now() - last < 60 * 1000) return
      fetch(API_ROUTES.JD_WS_TODOIST_SYNC(wsId), { method: 'POST', headers: authHeader(token) })
        .then(r => r.json())
        .then(d => {
          if (!d.ok) return
          sessionStorage.setItem(key, Date.now().toString())
          if (d.completed > 0) navigate(`/jourdoc/${wsId}/todoist-tasks`)
        })
        .catch(() => {})
    }
    runSync()
    document.addEventListener('visibilitychange', runSync)
    return () => document.removeEventListener('visibilitychange', runSync)
  }, [wsId, token])

  function isActive(path) {
    const base = `/jourdoc/${wsId}`
    if (path === '') return location.pathname === base || location.pathname === base + '/'
    return location.pathname.includes(`${base}/${path}`)
  }

  const others = allWs.filter(w => w.id !== Number(wsId))

  return (
    <div className="app-layout jd-app">
      <TopBar user={ws ? { username: ws.name } : null} onLogout={logout} />

      <div className="jd-layout">
        <nav className="jd-nav">

          {/* ── Workspace switcher ── */}
          <div className="ws-switch">
            <button
              ref={wsBtnRef}
              className="ws-switch__btn"
              onClick={() => {
                if (!showSwitcher && wsBtnRef.current) setMenuRect(wsBtnRef.current.getBoundingClientRect())
                setShowSwitcher(o => !o)
              }}
              title="Changer de workspace"
            >
              <span className="ws-switch__name">{ws?.name ?? '…'}</span>
              <span className="ws-switch__chevron">{showSwitcher ? '▴' : '▾'}</span>
            </button>

            {showSwitcher && createPortal(
              <>
                <div className="ws-switch__menu" style={menuRect && window.innerWidth >= 768 ? {
                  position: 'fixed',
                  top: menuRect.bottom + 4,
                  left: menuRect.left,
                  width: menuRect.width,
                  bottom: 'auto',
                } : undefined}>
                  {others.length > 0 && (
                    <>
                      <div className="ws-switch__section-label">Basculer vers</div>
                      {others.map(w => (
                        <button key={w.id} className="ws-switch__item"
                          onClick={() => { navigate(`/jourdoc/${w.id}`); setShowSwitcher(false) }}>
                          {w.name}
                          {w.role === 'owner' && <span className="ws-switch__role">owner</span>}
                        </button>
                      ))}
                      <hr className="ws-switch__hr" />
                    </>
                  )}
                  <button className="ws-switch__item ws-switch__create"
                    onClick={() => { setShowSwitcher(false); navigate(`/jourdoc/${wsId}/settings?new=1`) }}>
                    ✚ Nouveau workspace
                  </button>
                </div>
                <div className="ws-switch__backdrop" onClick={() => setShowSwitcher(false)} />
              </>,
              document.body
            )}
          </div>

          {/* ── Items de navigation ── */}
          {NAV.map(({ path, icon, label }) => (
            <button
              key={path}
              className={`jd-nav-item${isActive(path) ? ' active' : ''}`}
              onClick={() => { navigate(`/jourdoc/${wsId}${path ? '/' + path : ''}`); setShowSwitcher(false) }}
            >
              <span className="jd-nav-icon">{icon}</span>
              <span className="jd-nav-label">{label}</span>
            </button>
          ))}

          <button
            className="jd-nav-item jd-nav-new"
            onClick={() => navigate(`/jourdoc/${wsId}/new`)}
          >
            <span className="jd-nav-icon">✚</span>
            <span className="jd-nav-label">Nouvelle note</span>
          </button>
        </nav>

        <main className={`jd-main${/\/analyse$/.test(location.pathname) ? ' jd-main--wide' : ''}`}>
          <Outlet />
        </main>
      </div>

      <Footer />
    </div>
  )
}
