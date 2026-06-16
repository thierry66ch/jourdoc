import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import TopBar from '../components/TopBar'
import Footer from '../components/Footer'

export default function Portal() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [wsName, setWsName]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    async function init() {
      const [meRes, wsRes] = await Promise.all([
        fetch(API_ROUTES.ME_APPS, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(API_ROUTES.ME_WORKSPACES('jourdoc'), { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const meData = await meRes.json()
      setUser(meData.user ?? null)

      if (wsRes.ok) {
        const wsData = await wsRes.json()
        const ws = wsData.workspaces ?? []
        if (ws.length > 0) {
          navigate(`/jourdoc/${ws[0].id}`, { replace: true })
          return
        }
      }
      setLoading(false)
    }
    init().catch(err => { setError(err.message); setLoading(false) })
  }, [token, navigate])

  async function createWorkspace(e) {
    e.preventDefault()
    if (!wsName.trim()) return
    setSaving(true)
    try {
      const res = await fetch(API_ROUTES.JD_WORKSPACES(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wsName.trim() }),
      })
      const data = await res.json()
      if (data.id) navigate(`/jourdoc/${data.id}`, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <div className="app-layout">
      <TopBar user={user} onLogout={logout} />
      <main className="main-content">
        <div className="portal-hero">
          <h1>Bienvenue{user ? `, ${user.username}` : ''} 👋</h1>
        </div>

        {error && <p style={{ color: 'var(--color-error)' }}>{error}</p>}

        <div style={{ maxWidth: 400, margin: '2rem auto', padding: '1.5rem', background: 'var(--bg-surface)', borderRadius: '0.75rem' }}>
          <p style={{ marginBottom: '1rem' }}>Créez votre premier espace de travail pour commencer :</p>
          <form onSubmit={createWorkspace}>
            <input
              className="input"
              placeholder="Nom du workspace (ex. Jardin)"
              value={wsName}
              onChange={e => setWsName(e.target.value)}
              required
              autoFocus
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{ marginTop: '0.75rem', width: '100%' }}
              disabled={saving}
            >
              {saving ? 'Création…' : '✚ Créer le workspace'}
            </button>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  )
}
