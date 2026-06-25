// src/clipper/ClipperOverlay.jsx — orchestrateur du clipper (stepper).
//
// Étapes : auth → workspace → meta (classification) → preview → done.
// Auth : popup first-party OU mini-login (cf. ClipperAuth). Données taxonomie et
// capture sous /api/clip/* (CORS tiers). Cf. docs/dev/clipper.md.

import React, { useState } from 'react'
import { authHeader, buildTitreAlt, S } from './ui.jsx'
import ClipperAuth from './ClipperAuth.jsx'
import ClipperWorkspace from './ClipperWorkspace.jsx'
import ClipperMeta from './ClipperMeta.jsx'
import ClipperPreview from './ClipperPreview.jsx'

// Sérialise le HTML de la page en retirant tout ce dont Readability n'a pas besoin
// (scripts, styles, SVG inline, médias, iframes, notre overlay, gros data: URIs).
function cleanPageHtml() {
  const root = document.documentElement.cloneNode(true)
  root.querySelectorAll(
    'script,style,noscript,svg,link,template,iframe,canvas,video,audio,object,embed,#jd-clipper-root'
  ).forEach((el) => el.remove())
  root.querySelectorAll('img[src^="data:"]').forEach((img) => {
    if ((img.getAttribute('src') || '').length > 5000) img.removeAttribute('src')
  })
  return `<!DOCTYPE html>${root.outerHTML}`
}

const STEP_LABEL = { workspace: '1/3', meta: '2/3', preview: '3/3' }

export default function ClipperOverlay({ origin, pageUrl, pageTitle, onClose }) {
  const [step, setStep] = useState('auth') // auth | workspace | meta | preview
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [workspaces, setWorkspaces] = useState([])
  const [wsId, setWsId] = useState(null)
  const [taxonomy, setTaxonomy] = useState({ objets: [], themes: [], docCategories: [] })

  const [title, setTitle] = useState(pageTitle || '')
  const [objetIds, setObjetIds] = useState([])
  const [themeIds, setThemeIds] = useState([])
  const [docCategorieId, setDocCategorieId] = useState(null)

  const [clipStatus, setClipStatus] = useState('idle') // idle | clipping | done | error
  const [result, setResult] = useState(null)

  async function api(path, opts = {}) {
    const r = await fetch(`${origin}${path}`, { ...opts, headers: { ...authHeader(token), ...(opts.headers || {}) } })
    if (r.status === 401) { setToken(null); setStep('auth'); setError('Session expirée, reconnecte-toi.'); throw new Error('401') }
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`)
    return data
  }

  // Auth réussie → charge les workspaces
  async function onToken(t) {
    setToken(t); setError(''); setLoading(true)
    try {
      const r = await fetch(`${origin}/api/clip/workspaces`, { headers: authHeader(t) })
      if (r.status === 401) throw new Error('Session invalide.')
      const { workspaces: ws } = await r.json()
      setWorkspaces(ws)
      setWsId(ws[0]?.id ?? null)
      setStep('workspace')
    } catch (e) {
      setError(`Chargement des workspaces impossible (${e.message}).`)
      setToken(null)
    } finally {
      setLoading(false)
    }
  }

  // Workspace choisi → charge la taxonomie
  async function loadTaxonomy() {
    setLoading(true); setError('')
    try {
      const tax = await api(`/api/clip/ws/${wsId}/taxonomy`)
      setTaxonomy(tax)
      // reset classification au changement de workspace
      setObjetIds([]); setThemeIds([]); setDocCategorieId(null)
      setStep('meta')
    } catch (e) {
      if (e.message !== '401') setError(`Taxonomie indisponible (${e.message}).`)
    } finally {
      setLoading(false)
    }
  }

  // Titre court (titre_alt) dérivé des objets/thèmes sélectionnés, ordre taxonomie.
  const selObjets = (taxonomy.objets || []).filter((o) => objetIds.includes(o.id))
  const selThemes = (taxonomy.themes || []).filter((t) => themeIds.includes(t.id))
  const titreAlt = buildTitreAlt(selObjets, selThemes)

  async function doClip() {
    setClipStatus('clipping'); setError('')
    try {
      const data = await api('/api/clip', {
        method: 'POST',
        body: JSON.stringify({
          url: pageUrl,
          html: cleanPageHtml(),
          title: title.trim() || pageTitle,
          titre_alt: titreAlt || null,
          workspaceId: wsId,
          objet_ids: objetIds,
          theme_ids: themeIds,
          doc_categorie_id: docCategorieId,
        }),
      })
      setResult(data); setClipStatus('done')
    } catch (e) {
      if (e.message === '401') { setClipStatus('idle') } // l'API a déjà renvoyé à l'auth
      else { setError(e.message); setClipStatus('error') }
    }
  }

  const wsName = workspaces.find((w) => w.id === wsId)?.name || ''

  return (
    <div style={S.panel}>
      <div style={S.head}>
        <span>JourDoc Clipper</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {STEP_LABEL[step] && <span style={S.steps}>{STEP_LABEL[step]}</span>}
          <button style={S.close} onClick={onClose} aria-label="Fermer">×</button>
        </span>
      </div>

      <div style={S.body}>
        {loading && <p style={{ margin: 0 }}>Chargement…</p>}

        {!loading && step === 'auth' && (
          <>
            <ClipperAuth origin={origin} onToken={onToken} />
            {error && <p style={S.err}>{error}</p>}
          </>
        )}

        {!loading && step === 'workspace' && (
          <ClipperWorkspace workspaces={workspaces} wsId={wsId} setWsId={setWsId} onNext={loadTaxonomy} />
        )}

        {!loading && step === 'meta' && (
          <ClipperMeta
            taxonomy={taxonomy}
            title={title} setTitle={setTitle}
            objetIds={objetIds} setObjetIds={setObjetIds}
            themeIds={themeIds} setThemeIds={setThemeIds}
            docCategorieId={docCategorieId} setDocCategorieId={setDocCategorieId}
            onBack={() => setStep('workspace')}
            onNext={() => setStep('preview')}
          />
        )}

        {!loading && step === 'preview' && (
          <ClipperPreview
            origin={origin} pageUrl={pageUrl} title={title} titreAlt={titreAlt} wsName={wsName} taxonomy={taxonomy}
            objetIds={objetIds} themeIds={themeIds} docCategorieId={docCategorieId}
            status={clipStatus} result={result} error={error}
            onBack={() => { setClipStatus('idle'); setStep('meta') }}
            onClip={doClip} onClose={onClose}
          />
        )}

        {step !== 'preview' && error && step !== 'auth' && <p style={S.err}>{error}</p>}
      </div>
    </div>
  )
}
