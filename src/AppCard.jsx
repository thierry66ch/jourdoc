import { useState } from 'react'
import { API_ROUTES } from '@pogil/shared'
import WorkspaceSelector from './WorkspaceSelector'

export default function AppCard({ app, token }) {
  const [workspaces, setWorkspaces] = useState(null)
  const [open, setOpen]             = useState(false)
  const [creating, setCreating]     = useState(false)
  const [wsName, setWsName]         = useState('')
  const [saving, setSaving]         = useState(false)

  async function handleClick() {
    if (workspaces === null) {
      const res = await fetch(API_ROUTES.ME_WORKSPACES(app.slug), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      const ws = data.workspaces ?? []
      setWorkspaces(ws)
      if (ws.length === 1) {
        window.location.href = `/${app.slug}/${ws[0].id}`
        return
      }
      if (ws.length === 0) {
        // Aucun workspace — proposer la création immédiatement
        setCreating(true)
        return
      }
    }
    setOpen(v => !v)
  }

  async function createWorkspace(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!wsName.trim()) return
    setSaving(true)
    try {
      const res = await fetch(API_ROUTES.JD_WORKSPACES(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wsName.trim() }),
      })
      const data = await res.json()
      if (data.id) window.location.href = `/${app.slug}/${data.id}`
    } finally { setSaving(false) }
  }

  return (
    <div className="app-card" onClick={handleClick}>
      <div className="app-card__icon">{app.icon ?? '📦'}</div>
      <span className="app-card__name">{app.name}</span>

      {/* Aucun workspace — formulaire de création inline */}
      {creating && (
        <form className="app-card__create-ws" onSubmit={createWorkspace} onClick={e => e.stopPropagation()}>
          <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '.5rem' }}>
            Créer votre premier workspace pour commencer :
          </p>
          <input
            className="input" style={{ fontSize: '.875rem', marginBottom: '.5rem' }}
            placeholder="Nom du workspace (ex. Jardin)"
            value={wsName} onChange={e => setWsName(e.target.value)}
            autoFocus required
          />
          <button type="submit" className="btn btn-primary" style={{ width: '100%', fontSize: '.875rem' }}
            disabled={saving}>
            {saving ? 'Création…' : '✚ Créer le workspace'}
          </button>
        </form>
      )}

      {open && workspaces && workspaces.length > 1 && (
        <WorkspaceSelector workspaces={workspaces} appSlug={app.slug} />
      )}
    </div>
  )
}
