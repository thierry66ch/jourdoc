// src/clipper/ClipperApp.jsx — orchestrateur de la fenêtre clipper (first-party).
//
// Reçoit { url, title, html } de la page hôte par postMessage (envoyé par le lanceur
// injecté), puis déroule le stepper. Auth = token du localStorage JourDoc (lecture
// directe, on est first-party) ou mini-login. Tous les appels API sont same-origin
// → insensibles à la CSP du site clippé. Cf. docs/dev/clipper.md.

import React, { useEffect, useState, useRef } from 'react'
import { authHeader, buildTitreAlt, Btn } from './ui.jsx'
import ClipperAuth from './ClipperAuth.jsx'
import ClipperWorkspace from './ClipperWorkspace.jsx'
import ClipperMeta from './ClipperMeta.jsx'
import ClipperPreview from './ClipperPreview.jsx'

const APP = {
  wrap: { maxWidth: '460px', margin: '0 auto', minHeight: '100vh', background: '#1a1a2e' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', background: '#6366f1', color: '#fff', fontWeight: 600 },
  steps: { fontSize: '11px', opacity: .85 },
  body: { padding: '16px' },
  err: { fontSize: '12px', color: '#ff9d9d', marginTop: '10px' },
}
const STEP_LABEL = { workspace: '1/3', meta: '2/3', preview: '3/3' }

// On mémorise le résultat d'une capture réussie dans le sessionStorage de la fenêtre
// clipper. Ainsi, après « Ouvrir la note » (qui navigue dans la même fenêtre), le retour
// arrière restaure l'écran final AVEC le bouton « Annuler », au lieu de repartir à zéro.
// sessionStorage est propre à chaque fenêtre → un nouveau lancement du clipper repart neuf.
const CLIP_DONE_KEY = 'jd_clip_done'
const readClipDone  = () => { try { return JSON.parse(sessionStorage.getItem(CLIP_DONE_KEY) || 'null') } catch { return null } }
const writeClipDone = (v) => { try { sessionStorage.setItem(CLIP_DONE_KEY, JSON.stringify(v)) } catch { /* */ } }
const clearClipDone = () => { try { sessionStorage.removeItem(CLIP_DONE_KEY) } catch { /* */ } }

export default function ClipperApp() {
  const restored = readClipDone()
  const [payload, setPayload] = useState(null)            // { url, title, html }
  const [token, setToken] = useState(() => { try { return localStorage.getItem('token') } catch { return null } })
  const [step, setStep] = useState(restored ? 'preview' : 'workspace')  // workspace | meta | preview
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [undone, setUndone] = useState(false)             // capture annulée depuis un retour arrière
  const restoredRef = useRef(!!restored)                  // fenêtre revenue sur un écran final restauré

  const [workspaces, setWorkspaces] = useState([])
  const [wsId, setWsId] = useState(restored?.wsId ?? null)
  const [taxonomy, setTaxonomy] = useState({ objets: [], themes: [], docCategories: [] })

  const [title, setTitle] = useState('')
  const [objetIds, setObjetIds] = useState([])
  const [themeIds, setThemeIds] = useState([])
  const [docCategorieId, setDocCategorieId] = useState(null)

  const [clipStatus, setClipStatus] = useState(restored ? 'done' : 'idle')  // idle | clipping | done | error
  const [result, setResult] = useState(restored?.result ?? null)
  const [undoStatus, setUndoStatus] = useState('idle')    // idle | undoing
  const [authNote, setAuthNote] = useState('')
  const [existing, setExisting] = useState([])            // notes déjà clippées (même URL)

  // Réception de la page depuis le lanceur + handshake "prêt".
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data && e.data.type === 'JD_CLIP_PAGE') {
        // Retour arrière sur un écran final restauré : le re-handshake de la page hôte
        // ne doit pas réinitialiser le stepper (sinon on perd le bouton « Annuler »).
        if (restoredRef.current) return
        setPayload({ url: e.data.url, html: e.data.html, title: e.data.title })
        setTitle((t) => t || e.data.title || '')
      }
    }
    window.addEventListener('message', onMsg)
    try { window.opener && window.opener.postMessage({ type: 'JD_CLIP_READY' }, '*') } catch { /* */ }
    return () => window.removeEventListener('message', onMsg)
  }, [])

  // Charge les workspaces dès qu'on a un token (sauf écran final restauré : inutile).
  useEffect(() => {
    if (token && workspaces.length === 0 && !restoredRef.current) loadWorkspaces()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function api(path, opts = {}) {
    const r = await fetch(path, { ...opts, headers: { ...authHeader(token), ...(opts.headers || {}) } })
    if (r.status === 401) {
      setToken(null); try { localStorage.removeItem('token') } catch { /* */ }
      setAuthNote('Session expirée, reconnecte-toi.')
      throw new Error('401')
    }
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`)
    return data
  }

  async function loadWorkspaces() {
    setLoading(true); setError('')
    try {
      const { workspaces: ws } = await api('/api/clip/workspaces')
      setWorkspaces(ws)
      setWsId((id) => id ?? ws[0]?.id ?? null)
      setStep('workspace')
    } catch (e) {
      if (e.message !== '401') setError(`Chargement des workspaces impossible (${e.message}).`)
    } finally {
      setLoading(false)
    }
  }

  async function loadTaxonomy() {
    setLoading(true); setError('')
    try {
      const tax = await api(`/api/clip/ws/${wsId}/taxonomy`)
      setTaxonomy(tax)
      setObjetIds([]); setThemeIds([]); setDocCategorieId(null)
      setStep('meta')
    } catch (e) {
      if (e.message !== '401') setError(`Taxonomie indisponible (${e.message}).`)
    } finally {
      setLoading(false)
    }
  }

  // Passe à l'aperçu et vérifie si l'URL a déjà été clippée dans ce workspace.
  async function goPreview() {
    setStep('preview')
    setExisting([])
    if (!payload?.url) return
    try {
      const { existing: ex } = await api(`/api/clip/ws/${wsId}/exists?url=${encodeURIComponent(payload.url)}`)
      setExisting(ex || [])
    } catch { /* non bloquant */ }
  }

  const selObjets = (taxonomy.objets || []).filter((o) => objetIds.includes(o.id))
  const selThemes = (taxonomy.themes || []).filter((t) => themeIds.includes(t.id))
  const titreAlt = buildTitreAlt(selObjets, selThemes)

  async function doClip() {
    if (!payload) { setError('Page non reçue. Relance le clipper depuis l’onglet d’origine.'); return }
    setClipStatus('clipping'); setError('')
    try {
      const data = await api('/api/clip', {
        method: 'POST',
        body: JSON.stringify({
          url: payload.url,
          html: payload.html,
          title: title.trim() || payload.title,
          titre_alt: titreAlt || null,
          workspaceId: wsId,
          objet_ids: objetIds,
          theme_ids: themeIds,
          doc_categorie_id: docCategorieId,
        }),
      })
      setResult(data); setClipStatus('done')
      writeClipDone({ result: data, wsId })   // pour restaurer l'écran final au retour arrière
    } catch (e) {
      if (e.message === '401') setClipStatus('idle')
      else { setError(e.message); setClipStatus('error') }
    }
  }

  // Annuler la capture qui vient d'être créée (note + .md + assets), tant qu'on est
  // encore dans le clipper. Revient à l'aperçu pour permettre un nouvel essai.
  async function undoClip() {
    if (!result?.noteId) return
    setUndoStatus('undoing'); setError('')
    try {
      await api(`/api/clip/ws/${wsId}/note/${result.noteId}`, { method: 'DELETE' })
      clearClipDone()
      setResult(null); setClipStatus('idle')
      // Écran restauré (retour arrière) : plus de payload/taxonomie → état terminal « annulée ».
      // Flux normal (annulation juste après le clip) : on revient à l'aperçu pour re-clipper.
      if (restoredRef.current) setUndone(true)
      else setStep('preview')
    } catch (e) {
      if (e.message !== '401') setError(`Annulation impossible (${e.message}).`)
    } finally {
      setUndoStatus('idle')
    }
  }

  function onToken(t) {
    try { localStorage.setItem('token', t) } catch { /* */ }
    setAuthNote(''); setToken(t)
  }

  const wsName = workspaces.find((w) => w.id === wsId)?.name || ''
  const authed = !!token

  return (
    <div style={APP.wrap}>
      <div style={APP.head}>
        <span>JourDoc Clipper</span>
        {authed && STEP_LABEL[step] && <span style={APP.steps}>{STEP_LABEL[step]}</span>}
      </div>

      <div style={APP.body}>
        {undone ? (
          <>
            <p style={{ margin: '0 0 12px' }}>↩︎ Capture annulée (note et .md supprimés).</p>
            <Btn onClick={() => window.close()}>Fermer</Btn>
          </>
        ) : (
        <>
        {!payload && !restoredRef.current && clipStatus !== 'done' &&
          <p style={{ margin: '0 0 12px', opacity: .7 }}>Réception de la page…</p>}

        {!authed && <ClipperAuth onToken={onToken} note={authNote} />}

        {authed && loading && <p style={{ margin: 0 }}>Chargement…</p>}

        {authed && !loading && step === 'workspace' && (
          <ClipperWorkspace workspaces={workspaces} wsId={wsId} setWsId={setWsId} onNext={loadTaxonomy} />
        )}

        {authed && !loading && step === 'meta' && (
          <ClipperMeta
            taxonomy={taxonomy}
            title={title} setTitle={setTitle}
            objetIds={objetIds} setObjetIds={setObjetIds}
            themeIds={themeIds} setThemeIds={setThemeIds}
            docCategorieId={docCategorieId} setDocCategorieId={setDocCategorieId}
            onBack={() => setStep('workspace')}
            onNext={goPreview}
          />
        )}

        {authed && !loading && step === 'preview' && (
          <ClipperPreview
            origin={window.location.origin} wsId={wsId}
            pageUrl={payload?.url || ''} title={title} titreAlt={titreAlt} wsName={wsName} taxonomy={taxonomy}
            objetIds={objetIds} themeIds={themeIds} docCategorieId={docCategorieId} existing={existing}
            status={clipStatus} result={result} error={error}
            undoStatus={undoStatus} onUndo={undoClip}
            onBack={() => { setClipStatus('idle'); setStep('meta') }}
            onClip={doClip} onClose={() => { clearClipDone(); window.close() }}
          />
        )}

        {authed && step !== 'preview' && error && <p style={APP.err}>{error}</p>}
        </>
        )}
      </div>
    </div>
  )
}
