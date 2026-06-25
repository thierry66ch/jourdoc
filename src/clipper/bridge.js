// src/clipper/bridge.js — récupération du JWT via popup first-party.
//
// Pourquoi une popup et pas une iframe : depuis le partitionnement du stockage tiers
// (Chrome 115+, Safari, Firefox), une iframe embarquée sur un site tiers n'a accès
// qu'à un localStorage PARTITIONNÉ — elle ne voit donc jamais le token first-party de
// JourDoc. Une popup vers l'origine JourDoc est un contexte top-level first-party :
// elle lit le vrai localStorage et renvoie le token par postMessage.
//
// ⚠️ Doit être appelé depuis un GESTE UTILISATEUR (clic) sous peine de blocage popup.

// Ouvre la popup d'auth et résout le token (ou null).
// Retour : { token, blocked } — blocked=true si le navigateur a bloqué la popup.
export function getTokenViaPopup(origin, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const w = window.open(
      `${origin}/clipper-auth.html`,
      'jd-clipper-auth',
      'width=420,height=520,menubar=no,toolbar=no',
    )
    if (!w) return resolve({ token: null, blocked: true })

    let done = false
    let pollId = 0
    const finish = (token) => {
      if (done) return
      done = true
      window.removeEventListener('message', handler)
      clearInterval(pollId)
      resolve({ token, blocked: false })
    }

    const handler = (e) => {
      if (e.origin !== origin) return // la popup est sur l'origine JourDoc
      if (e.data && e.data.type === 'JD_CLIP_TOKEN') {
        finish(e.data.token ?? null)
        try { w.close() } catch (_) {}
      }
    }

    window.addEventListener('message', handler)
    // Si l'utilisateur ferme la popup sans se connecter → résoudre null.
    pollId = setInterval(() => { if (w.closed) finish(null) }, 500)
    setTimeout(() => finish(null), timeoutMs)
  })
}
