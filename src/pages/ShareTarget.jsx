// src/pages/ShareTarget.jsx — destination du partage natif Android (« Partager → JourDoc »).
//
// Le service worker (src/sw.js) a stocké le contenu partagé dans le Cache Storage et
// redirigé ici. On lit ce contenu, on choisit un workspace, puis :
//   - lien  → fiche en création (documentation) avec capture serveur automatique ;
//   - photos/PDF → upload (réduction/JPG via l'upload média existant) → fiche en
//     création avec les médias pré-attachés.
// Tout est same-origin (PWA installée, utilisateur connecté).

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const SHARE_CACHE = 'jd-share'

async function readShared() {
  if (!('caches' in window)) return null
  const cache = await caches.open(SHARE_CACHE)
  const metaRes = await cache.match('/__share/meta')
  if (!metaRes) return null
  const meta = await metaRes.json()
  const files = []
  for (let i = 0; i < (meta.fileCount || 0); i++) {
    const r = await cache.match(`/__share/file/${i}`)
    if (!r) continue
    const blob = await r.blob()
    files.push({
      blob,
      name: decodeURIComponent(r.headers.get('x-filename') || `fichier-${i}`),
      type: blob.type, size: blob.size,
      objectUrl: blob.type.startsWith('image/') ? URL.createObjectURL(blob) : null,
    })
  }
  return { meta, files }
}

async function clearShared() {
  if ('caches' in window) await caches.delete(SHARE_CACHE)
}

function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s]+/i)
  return m ? m[0] : ''
}

export default function ShareTarget() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [data, setData] = useState(undefined) // undefined = chargement, null = rien
  const [workspaces, setWorkspaces] = useState([])
  const [wsId, setWsId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    readShared().then(setData).catch(() => setData(null))
    fetch('/api/clip/workspaces', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(({ workspaces: ws }) => {
        setWorkspaces(ws || [])
        const last = Number(localStorage.getItem('jd_last_ws'))
        setWsId(ws?.find(w => w.id === last)?.id ?? ws?.[0]?.id ?? null)
      })
      .catch(() => {})
  }, [token])

  function rememberWs() { if (wsId) localStorage.setItem('jd_last_ws', String(wsId)) }

  // Lien partagé → fiche documentation + capture auto
  async function captureLink(url) {
    rememberWs()
    await clearShared()
    navigate(`/jourdoc/${wsId}/new`, {
      state: { type: 'documentation', source_url: url, autocapture: true, titre: data.meta.title || '' },
    })
  }

  // Photos/PDF → upload puis fiche en création avec médias attachés
  async function attachFilesToNewNote() {
    if (!wsId || data.files.length === 0) return
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      for (const f of data.files) fd.append('files', f.blob, f.name)
      const res = await fetch(`/api/jourdoc/${wsId}/medias`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Upload échoué (${res.status})`)
      const ids = (d.medias || []).map(m => m.id)
      if (ids.length === 0) throw new Error('Aucun fichier accepté.')
      rememberWs()
      await clearShared()
      navigate(`/jourdoc/${wsId}/new`, { state: { media_ids: ids, titre: data.meta.title || '' } })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (data === undefined) return <div className="ws-manager"><p>Lecture du partage…</p></div>

  if (!data) {
    return (
      <div className="ws-manager">
        <h2>📥 Partage JourDoc</h2>
        <p className="msg msg-error">Aucun contenu partagé reçu.</p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>← Accueil</button>
      </div>
    )
  }

  const { meta, files } = data
  const sharedUrl = meta.url || extractUrl(meta.text)
  const hasFiles = files.length > 0

  return (
    <div className="ws-manager">
      <div className="jd-form-header">
        <button className="btn btn-ghost" style={{ padding: '.35rem .6rem', fontSize: '.875rem' }}
          onClick={() => clearShared().then(() => navigate('/'))}>← Annuler</button>
        <h2>📥 Partage reçu</h2>
      </div>

      {error && <p className="msg msg-error">{error}</p>}

      {/* Workspace */}
      <section className="ws-manager__section">
        <h3 className="ws-manager__title">Workspace</h3>
        <select className="input" value={wsId ?? ''} onChange={e => setWsId(Number(e.target.value))}>
          {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </section>

      {/* Aperçu + action */}
      {hasFiles ? (
        <section className="ws-manager__section">
          <h3 className="ws-manager__title">{files.length} fichier{files.length > 1 ? 's' : ''}</h3>
          <div className="jd-media-selected" style={{ marginBottom: '.75rem' }}>
            {files.map((f, i) => (
              <div key={i} className="jd-media-selected__item" title={f.name}>
                {f.objectUrl
                  ? <img className="jd-thumb" src={f.objectUrl} alt={f.name} />
                  : <div className="jd-thumb jd-thumb--pdf">📄</div>}
              </div>
            ))}
          </div>
          <button className="btn btn-primary" disabled={busy || !wsId} onClick={attachFilesToNewNote}>
            {busy ? '⏳ Envoi…' : '➕ Joindre à une nouvelle note'}
          </button>
          <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: '.5rem' }}>
            Les images sont réduites et converties en JPG, comme un upload classique.
          </p>
        </section>
      ) : sharedUrl ? (
        <section className="ws-manager__section">
          <h3 className="ws-manager__title">Lien</h3>
          <p style={{ wordBreak: 'break-all', fontSize: '.85rem' }}>{sharedUrl}</p>
          <button className="btn btn-primary" disabled={!wsId} onClick={() => captureLink(sharedUrl)}>
            🔖 Capturer dans une nouvelle note
          </button>
          <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: '.5rem' }}>
            Capture le contenu de la page en Markdown (sites « article » ; échoue sur les SPA).
          </p>
        </section>
      ) : (
        <section className="ws-manager__section">
          <p className="msg msg-error">Contenu partagé non exploitable (ni lien ni fichier).</p>
          {meta.text && <p style={{ wordBreak: 'break-word' }}>{meta.text}</p>}
        </section>
      )}
    </div>
  )
}
