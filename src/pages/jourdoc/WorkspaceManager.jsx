import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'
import CsvImporter from './CsvImporter'

const ROLE_LABEL = { owner: 'Propriétaire', member: 'Membre' }

export default function WorkspaceManager() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const showCreateOnMount = searchParams.get('new') === '1'

  const [ws, setWs] = useState(null)
  const [members, setMembers] = useState([])
  const [allWs, setAllWs] = useState([])
  const [myRole, setMyRole] = useState('member')

  const [editName, setEditName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [inviteId, setInviteId] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteError, setInviteError] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)

  // ── Todoist ──
  const [tdConfig, setTdConfig]         = useState(null)   // { configured, project_id, project_nom }
  const [tdToken, setTdToken]           = useState('')
  const [tdProjects, setTdProjects]     = useState(null)   // liste après test
  const [tdProjectId, setTdProjectId]   = useState('')
  const [tdProjectNom, setTdProjectNom] = useState('')
  const [tdEditing, setTdEditing]       = useState(false)
  const [tdLoading, setTdLoading]       = useState(false)
  const [tdError, setTdError]           = useState('')
  const [tdSyncing, setTdSyncing]       = useState(false)
  const [tdSyncMsg, setTdSyncMsg]       = useState('')

  const loadTodoist = useCallback(async () => {
    const data = await fetch(API_ROUTES.JD_WS_TODOIST(wsId), { headers: authHeader(token) }).then(r => r.json())
    setTdConfig(data)
    setTdProjectId(data.project_id ?? '')
    setTdProjectNom(data.project_nom ?? '')
  }, [wsId, token])

  async function testAndLoadProjects() {
    setTdLoading(true); setTdError('')
    try {
      const res = await fetch(API_ROUTES.JD_WS_TODOIST_PROJS(wsId), {
        method: 'POST', headers: authHeader(token),
        body: JSON.stringify({ token: tdToken || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setTdError(data.error ?? 'Erreur'); return }
      setTdProjects(data.projects)
    } catch { setTdError('Erreur réseau') }
    finally { setTdLoading(false) }
  }

  async function saveTodoist() {
    setTdLoading(true); setTdError('')
    try {
      await fetch(API_ROUTES.JD_WS_TODOIST(wsId), {
        method: 'PUT', headers: authHeader(token),
        body: JSON.stringify({ token: tdToken || undefined, project_id: tdProjectId, project_nom: tdProjectNom }),
      })
      await loadTodoist()
      setTdEditing(false); setTdToken(''); setTdProjects(null)
      setMsg('Configuration Todoist enregistrée.')
    } catch { setTdError('Erreur réseau') }
    finally { setTdLoading(false) }
  }

  async function syncTodoist() {
    setTdSyncing(true); setTdSyncMsg('')
    try {
      const res = await fetch(API_ROUTES.JD_WS_TODOIST_SYNC(wsId), { method: 'POST', headers: authHeader(token) })
      if (!res.ok) {
        const body = await res.text().catch(() => `HTTP ${res.status}`)
        setTdSyncMsg(`Erreur ${res.status}: ${body.slice(0, 120)}`)
        return
      }
      const data = await res.json()
      if (!data.ok) { setTdSyncMsg(`Erreur: ${data.error ?? 'sync échouée'}`); return }
      const msg = data.synced === 0
        ? 'Aucune tâche à synchroniser.'
        : `${data.synced} tâche${data.synced > 1 ? 's' : ''} vérifiée${data.synced > 1 ? 's' : ''}${data.completed ? `, ${data.completed} terminée${data.completed > 1 ? 's' : ''}` : ''}.`
      setTdSyncMsg(msg)
      sessionStorage.setItem(`todoist_sync_${wsId}`, Date.now().toString())
      await loadTodoist()
    } catch (e) { setTdSyncMsg(`Exception: ${e?.message ?? String(e)}`) }
    finally { setTdSyncing(false) }
  }

  async function clearTodoist() {
    if (!confirm('Supprimer la configuration Todoist de ce workspace ?')) return
    await fetch(API_ROUTES.JD_WS_TODOIST(wsId), {
      method: 'PUT', headers: authHeader(token),
      body: JSON.stringify({ token: null, project_id: null, project_nom: null }),
    })
    await loadTodoist(); setMsg('Configuration Todoist supprimée.')
  }

  useEffect(() => { loadTodoist() }, [loadTodoist])

  const [importTab, setImportTab]   = useState('objets')
  const [elements, setElements]     = useState([])
  const [elEditing, setElEditing]   = useState({})   // id → nom en cours d'édition
  const [elMerge, setElMerge]       = useState(new Set())  // ids sélectionnés pour fusion
  const [mergeTarget, setMergeTarget] = useState('')
  const [elMsg, setElMsg]           = useState('')

  const loadElements = useCallback(async () => {
    const d = await fetch(API_ROUTES.JD_ELEMENTS(wsId), { headers: authHeader(token) }).then(r => r.json())
    setElements(d.elements ?? [])
  }, [wsId, token])

  useEffect(() => { loadElements() }, [loadElements])

  async function renameElement(id, nom) {
    await fetch(API_ROUTES.JD_ELEMENT(wsId, id), {
      method: 'PUT', headers: authHeader(token), body: JSON.stringify({ nom }),
    })
    setElEditing(e => { const n = { ...e }; delete n[id]; return n })
    loadElements()
  }

  async function deleteElement(id, nom) {
    if (!confirm(`Supprimer l'élément "${nom}" ?`)) return
    const res = await fetch(API_ROUTES.JD_ELEMENT(wsId, id), { method: 'DELETE', headers: authHeader(token) })
    const d = await res.json()
    if (!res.ok) { setElMsg(d.error ?? 'Erreur'); return }
    loadElements()
  }

  async function mergeElements() {
    if (!mergeTarget.trim() || elMerge.size === 0) return
    await fetch(API_ROUTES.JD_ELEMENTS_MERGE(wsId), {
      method: 'POST', headers: authHeader(token),
      body: JSON.stringify({ source_ids: [...elMerge], target_nom: mergeTarget }),
    })
    setElMerge(new Set()); setMergeTarget(''); setElMsg('Fusion effectuée.')
    loadElements()
  }
  const [exporting, setExporting]   = useState(false)

  async function downloadExport(format, withMedias) {
    setExporting(true)
    try {
      const url = API_ROUTES.JD_WS_EXPORT(wsId, format, withMedias)
      const res = await fetch(url, { headers: authHeader(token) })
      if (!res.ok) {
        const body = await res.text().catch(() => `HTTP ${res.status}`)
        setMsg(`Erreur export (${res.status}): ${body.slice(0, 200)}`)
        return
      }
      const blob = await res.blob()
      const cd = res.headers.get('content-disposition') ?? ''
      const filename = cd.match(/filename="?([^"]+)"?/)?.[1]
        ?? `export-${wsId}.${format === 'json' ? 'json' : 'zip'}`
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    } catch { setMsg('Erreur réseau') }
    finally { setExporting(false) }
  }
  const [searchDepth, setSearchDepth] = useState(3)
  const [depthSaved, setDepthSaved] = useState(false)

  useEffect(() => {
    fetch(API_ROUTES.JD_WS(wsId), { headers: authHeader(token) })
      .then(r => r.json()).then(d => setSearchDepth(d.workspace?.search_depth ?? 3))
  }, [wsId, token])

  async function saveDepth(d) {
    setSearchDepth(d)
    await fetch(API_ROUTES.JD_WS_SEARCH_DEPTH(wsId), {
      method: 'PATCH', headers: authHeader(token),
      body: JSON.stringify({ depth: d }),
    })
    setDepthSaved(true)
    setTimeout(() => setDepthSaved(false), 2000)
  }
  const [newWsName, setNewWsName] = useState('')
  const [showCreate, setShowCreate] = useState(showCreateOnMount)
  const [createLoading, setCreateLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const [wsData, membersData, wsListData] = await Promise.all([
      fetch(API_ROUTES.JD_WS(wsId), { headers: authHeader(token) }).then(r => r.json()),
      fetch(API_ROUTES.JD_WS_MEMBERS(wsId), { headers: authHeader(token) }).then(r => r.json()),
      fetch(API_ROUTES.JD_WORKSPACES(), { headers: authHeader(token) }).then(r => r.json()),
    ])
    setWs(wsData.workspace)
    setEditName(wsData.workspace?.name ?? '')
    const mems = membersData.members ?? []
    setMembers(mems)
    setAllWs(wsListData.workspaces ?? [])

    // Determine current user's role
    const userId = JSON.parse(atob(token.split('.')[1])).sub
    const me = mems.find(m => m.id === userId)
    setMyRole(me?.role ?? 'member')
  }

  useEffect(() => { load() }, [wsId, token])

  const isOwner = myRole === 'owner'

  async function saveName() {
    if (!editName.trim() || editName === ws?.name) { setEditingName(false); return }
    const res = await fetch(`/api/jourdoc/${wsId}`, {
      method: 'PATCH', headers: authHeader(token), body: JSON.stringify({ name: editName.trim() })
    })
    if (res.ok) { await load(); setEditingName(false); setMsg('Workspace renommé.') }
  }

  async function deleteWs() {
    if (!confirm(`Supprimer le workspace "${ws?.name}" et TOUTES ses données (notes, objets, thèmes, médias) ? Cette action est irréversible.`)) return
    const res = await fetch(`/api/jourdoc/${wsId}`, { method: 'DELETE', headers: authHeader(token) })
    if (res.ok) navigate('/')
  }

  async function invite(e) {
    e.preventDefault()
    setInviteError('')
    setInviteLoading(true)
    try {
      const res = await fetch(API_ROUTES.JD_WS_MEMBERS(wsId), {
        method: 'POST', headers: authHeader(token),
        body: JSON.stringify({ identifier: inviteId, role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) { setInviteError(data.error ?? 'Erreur'); return }
      setInviteId('')
      await load()
      setMsg(`${data.user?.username ?? 'Utilisateur'} ajouté.`)
    } finally { setInviteLoading(false) }
  }

  async function changeRole(uid, role) {
    await fetch(API_ROUTES.JD_WS_MEMBER(wsId, uid), {
      method: 'PUT', headers: authHeader(token), body: JSON.stringify({ role })
    })
    await load()
  }

  async function removeMember(uid, username) {
    if (!confirm(`Retirer ${username} du workspace ?`)) return
    await fetch(API_ROUTES.JD_WS_MEMBER(wsId, uid), { method: 'DELETE', headers: authHeader(token) })
    await load()
  }

  async function createWs(e) {
    e.preventDefault()
    if (!newWsName.trim()) return
    setCreateLoading(true)
    try {
      const res = await fetch(API_ROUTES.JD_WORKSPACES(), {
        method: 'POST', headers: authHeader(token), body: JSON.stringify({ name: newWsName.trim() })
      })
      let data
      try { data = await res.json() } catch { data = {} }
      if (res.ok && data.id) {
        navigate(`/jourdoc/${data.id}`)
      } else {
        setMsg(`Erreur ${res.status} : ${data.error ?? 'impossible de créer le workspace'}`)
      }
    } catch (err) {
      setMsg(`Erreur réseau : ${err.message}`)
    } finally {
      setCreateLoading(false)
    }
  }

  return (
    <div className="ws-manager">
      <div className="jd-form-header">
        <button className="btn btn-ghost" style={{ padding: '.35rem .6rem', fontSize: '.875rem' }}
          onClick={() => navigate(-1)}>← Retour</button>
        <h2>⚙️ Workspace</h2>
      </div>

      {msg && <p className="msg msg-success" style={{ marginBottom: '1rem' }}>{msg}</p>}

      {/* ── Infos workspace courant ── */}
      <section className="ws-manager__section">
        <h3 className="ws-manager__title">Workspace courant</h3>

        {editingName ? (
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input className="input" value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveName()}
              autoFocus style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={saveName}>✓</button>
            <button className="btn btn-ghost" onClick={() => { setEditingName(false); setEditName(ws?.name ?? '') }}>✕</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '1.125rem', fontWeight: 700 }}>{ws?.name}</span>
            {isOwner && (
              <>
                <button className="btn btn-secondary" style={{ padding: '.35rem .7rem', fontSize: '.8rem' }}
                  onClick={() => setEditingName(true)}>✏️ Renommer</button>
                <button className="btn btn-danger" style={{ padding: '.35rem .7rem', fontSize: '.8rem' }}
                  onClick={deleteWs}>🗑 Supprimer</button>
              </>
            )}
          </div>
        )}
      </section>

      {/* ── Membres ── */}
      <section className="ws-manager__section">
        <h3 className="ws-manager__title">Membres</h3>

        <div className="ws-manager__members">
          {members.map(m => (
            <div key={m.id} className="ws-manager__member">
              <div className="ws-manager__member-info">
                <span className="ws-manager__member-name">{m.username}</span>
                <span className="ws-manager__member-email">{m.email}</span>
              </div>
              <div className="ws-manager__member-actions">
                {isOwner ? (
                  <select
                    className="input"
                    style={{ padding: '.25rem .5rem', fontSize: '.8125rem', width: 'auto' }}
                    value={m.role}
                    onChange={e => changeRole(m.id, e.target.value)}
                  >
                    <option value="owner">Propriétaire</option>
                    <option value="member">Membre</option>
                  </select>
                ) : (
                  <span className="badge badge-accent">{ROLE_LABEL[m.role]}</span>
                )}
                {isOwner && (
                  <button className="btn btn-danger" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }}
                    onClick={() => removeMember(m.id, m.username)}>Retirer</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {isOwner && (
          <form onSubmit={invite} className="ws-manager__invite">
            <h4 className="ws-manager__subtitle">Inviter un utilisateur</h4>
            {inviteError && <p className="msg msg-error" style={{ marginBottom: '.5rem' }}>{inviteError}</p>}
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <input className="input" value={inviteId}
                onChange={e => setInviteId(e.target.value)}
                placeholder="Nom d'utilisateur ou email"
                style={{ flex: 1, minWidth: '180px' }} required />
              <select className="input" value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                style={{ width: 'auto', padding: '.6rem .75rem' }}>
                <option value="member">Membre</option>
                <option value="owner">Propriétaire</option>
              </select>
              <button className="btn btn-primary" type="submit" disabled={inviteLoading}>
                {inviteLoading ? '…' : 'Ajouter'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ── Mes autres workspaces ── */}
      <section className="ws-manager__section">
        <h3 className="ws-manager__title">Mes workspaces JourDoc</h3>
        <div className="ws-manager__ws-list">
          {allWs.map(w => (
            <button key={w.id}
              className={`ws-manager__ws-item${w.id === Number(wsId) ? ' current' : ''}`}
              onClick={() => w.id !== Number(wsId) && navigate(`/jourdoc/${w.id}`)}>
              {w.name}
              <span className="ws-manager__ws-role">{w.role === 'owner' ? 'owner' : 'membre'}</span>
            </button>
          ))}
        </div>

        {showCreate ? (
          <form onSubmit={createWs} style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
            <input className="input" value={newWsName} onChange={e => setNewWsName(e.target.value)}
              placeholder="Nom du nouveau workspace" style={{ flex: 1 }} required autoFocus />
            <button className="btn btn-primary" type="submit" disabled={createLoading}>
              {createLoading ? '…' : 'Créer'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => { setShowCreate(false); setNewWsName('') }}>
              Annuler
            </button>
          </form>
        ) : (
          <button className="btn btn-secondary" style={{ marginTop: '.75rem' }}
            onClick={() => setShowCreate(true)}>
            ✚ Créer un nouveau workspace
          </button>
        )}
      </section>

      {/* ── Éléments ── */}
      <section className="ws-manager__section">
        <h3 className="ws-manager__title">🔩 Éléments</h3>
        <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>
          Gérer les éléments (renommer, supprimer, fusionner) dans la page dédiée.
        </p>
        <button className="btn btn-secondary" style={{ fontSize: '.8rem' }}
          onClick={() => navigate(`/jourdoc/${wsId}/elements`)}>
          🔩 Gérer les éléments →
        </button>
      </section>

      {/* ── Export ── */}
      <section className="ws-manager__section">
        <h3 className="ws-manager__title">📤 Exporter les données</h3>
        <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>
          Exporte toutes les données du workspace (objets, thèmes, notes, médias).
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
          <button className="btn btn-secondary" style={{ fontSize: '.8rem' }}
            onClick={() => downloadExport('json', false)} disabled={exporting}>
            ↓ JSON
          </button>
          <button className="btn btn-secondary" style={{ fontSize: '.8rem' }}
            onClick={() => downloadExport('csv', false)} disabled={exporting}>
            ↓ CSV (ZIP)
          </button>
          <button className="btn btn-secondary" style={{ fontSize: '.8rem' }}
            onClick={() => downloadExport('csv', true)} disabled={exporting}>
            {exporting ? '…' : '↓ CSV + médias (ZIP)'}
          </button>
        </div>
      </section>

      {/* ── Profondeur de recherche ── */}
      <section className="ws-manager__section">
        <h3 className="ws-manager__title">🔍 Profondeur de recherche hiérarchique</h3>
        <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>
          Nombre de niveaux parcourus lors de la recherche par objet ou thème (fiches, calendrier, analyse).
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
          <div className="jd-segmented">
            {[1, 2, 3, 5, 10].map(d => (
              <button key={d} type="button"
                className={`jd-seg-btn${searchDepth === d ? ' active' : ''}`}
                onClick={() => saveDepth(d)}>{d}</button>
            ))}
          </div>
          <span style={{ fontSize: '.8125rem', color: 'var(--text-muted)' }}>
            {depthSaved ? '✓ Enregistré' : `Actuellement : ${searchDepth} niveau${searchDepth > 1 ? 'x' : ''}`}
          </span>
        </div>
      </section>

      {/* ── Todoist ── */}
      <section className="ws-manager__section">
        <h3 className="ws-manager__title">✓ Intégration Todoist</h3>

        {tdConfig === null ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '.875rem' }}>Chargement…</p>
        ) : !tdEditing && tdConfig.configured ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', alignItems: 'center' }}>
              <span style={{ fontSize: '.875rem' }}>
                Configuré ✓ — Projet : <strong>{tdConfig.project_nom ?? '(aucun)'}</strong>
              </span>
              <button className="btn btn-primary" style={{ fontSize: '.8rem', padding: '.3rem .7rem' }}
                onClick={syncTodoist} disabled={tdSyncing}>
                {tdSyncing ? '…' : '🔄 Sync maintenant'}
              </button>
              <button className="btn btn-secondary" style={{ fontSize: '.8rem', padding: '.3rem .6rem' }}
                onClick={() => setTdEditing(true)}>Modifier</button>
              <button className="btn btn-ghost" style={{ fontSize: '.8rem', padding: '.3rem .6rem', color: 'var(--danger)' }}
                onClick={clearTodoist}>Supprimer</button>
            </div>
            {(tdConfig.last_sync_at || tdSyncMsg) && (
              <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: 0 }}>
                {tdSyncMsg && <span style={{ color: 'var(--success)', marginRight: '.5rem' }}>{tdSyncMsg}</span>}
                {tdConfig.last_sync_at && (
                  <span>Dernière sync : {new Date(tdConfig.last_sync_at).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}</span>
                )}
              </p>
            )}
          </div>
        ) : (
          <div className="todoist-config-form">
            <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>
              Entrez votre clé API Todoist (disponible dans Todoist → Paramètres → Intégrations → API token).
            </p>
            {tdError && <p style={{ color: 'var(--danger)', fontSize: '.8rem', marginBottom: '.5rem' }}>{tdError}</p>}

            <div className="todoist-config-row">
              <input className="input" type="password" placeholder="Clé API Todoist…"
                value={tdToken} onChange={e => setTdToken(e.target.value)}
                style={{ flex: 1, fontSize: '.875rem' }} />
              <button className="btn btn-secondary" onClick={testAndLoadProjects}
                disabled={tdLoading || (!tdToken && !tdConfig.configured)}>
                {tdLoading ? '…' : 'Tester & Charger projets'}
              </button>
            </div>

            {tdProjects && (
              <div className="todoist-config-row" style={{ marginTop: '.5rem' }}>
                <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Projet cible</label>
                <select className="input" style={{ flex: 1, fontSize: '.875rem' }}
                  value={tdProjectId}
                  onChange={e => {
                    const proj = tdProjects.find(p => p.id === e.target.value)
                    setTdProjectId(e.target.value)
                    setTdProjectNom(proj?.name ?? '')
                  }}>
                  <option value="">— Boîte de réception —</option>
                  {tdProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            {(tdProjects || tdConfig.configured) && (
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
                <button className="btn btn-primary" onClick={saveTodoist} disabled={tdLoading}>
                  {tdLoading ? '…' : 'Enregistrer'}
                </button>
                <button className="btn btn-ghost" onClick={() => {
                  setTdEditing(false); setTdToken(''); setTdProjects(null); setTdError('')
                }}>Annuler</button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Import CSV ── */}
      <section className="ws-manager__section">
        <h3 className="ws-manager__title">📥 Importer des données CSV</h3>
        <p style={{ fontSize: '.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Importez en masse des objets ou des thèmes depuis un fichier CSV. Les doublons sont ignorés.
        </p>

        <div className="ws-manager__import-tabs">
          <button
            className={`ws-manager__import-tab${importTab === 'objets' ? ' active' : ''}`}
            onClick={() => setImportTab('objets')}>🌿 Objets</button>
          <button
            className={`ws-manager__import-tab${importTab === 'themes' ? ' active' : ''}`}
            onClick={() => setImportTab('themes')}>🏷️ Thèmes</button>
        </div>

        <CsvImporter key={importTab} wsId={wsId} token={token} type={importTab} onDone={() => setMsg(`Import ${importTab} terminé.`)} />
      </section>
    </div>
  )
}
