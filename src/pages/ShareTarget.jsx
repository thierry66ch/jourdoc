// src/pages/ShareTarget.jsx — destination du partage natif Android (« Partager → JourDoc »).
//
// SOCLE (phase 1) : lit le contenu partagé (stocké par le service worker dans le Cache
// Storage, cf. src/sw.js) et l'affiche, pour valider la réception sur un Android réel.
// Les étapes suivantes (lien → capture, photos → upload/attache) viendront ensuite.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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

function fmtSize(n) {
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`
  return `${(n / 1024 / 1024).toFixed(1)} Mo`
}

export default function ShareTarget() {
  const navigate = useNavigate()
  const [data, setData] = useState(undefined) // undefined = chargement, null = rien

  useEffect(() => {
    readShared().then(setData).catch(() => setData(null))
  }, [])

  if (data === undefined) {
    return <div className="ws-manager"><p>Lecture du partage…</p></div>
  }

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
  return (
    <div className="ws-manager">
      <div className="jd-form-header">
        <button className="btn btn-ghost" style={{ padding: '.35rem .6rem', fontSize: '.875rem' }}
          onClick={() => navigate('/')}>← Accueil</button>
        <h2>📥 Partage reçu</h2>
      </div>

      <p className="msg msg-success">Socle de test — réception OK ✓ ({new Date(meta.ts).toLocaleTimeString('fr-CH')})</p>

      <section className="ws-manager__section">
        <h3 className="ws-manager__title">Contenu</h3>
        {meta.url && <p style={{ wordBreak: 'break-all' }}><strong>URL :</strong> {meta.url}</p>}
        {meta.title && <p><strong>Titre :</strong> {meta.title}</p>}
        {meta.text && <p style={{ wordBreak: 'break-word' }}><strong>Texte :</strong> {meta.text}</p>}
        <p><strong>Fichiers :</strong> {files.length}</p>

        {files.length > 0 && (
          <div className="jd-media-selected" style={{ marginTop: '.75rem' }}>
            {files.map((f, i) => (
              <div key={i} className="jd-media-selected__item" title={`${f.name} · ${f.type} · ${fmtSize(f.size)}`}>
                {f.objectUrl
                  ? <img className="jd-thumb" src={f.objectUrl} alt={f.name} />
                  : <div className="jd-thumb jd-thumb--pdf">📄</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <button className="btn btn-secondary" onClick={() => clearShared().then(() => navigate('/'))}>
        Effacer et fermer
      </button>
    </div>
  )
}
