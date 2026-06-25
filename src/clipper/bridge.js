// src/clipper/bridge.js — communication postMessage avec auth-bridge.html
//
// L'iframe bridge est hébergée sur l'origine JourDoc (jourdoc.pogil.ch en prod,
// localhost:5173 en dev). Elle seule peut lire le JWT dans le localStorage de cette
// origine. Ce module l'interroge depuis le bundle clipper injecté sur une page tierce.

const IFRAME_ID = 'jd-clipper-bridge'

// Récupère le JWT via le bridge. Résout null si l'iframe ne répond pas (timeout).
export function getTokenViaBridge(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const iframe = document.getElementById(IFRAME_ID)
    if (!iframe || !iframe.contentWindow) return resolve(null)

    let done = false
    const finish = (value) => {
      if (done) return
      done = true
      window.removeEventListener('message', handler)
      resolve(value)
    }

    const handler = (e) => {
      if (e.source !== iframe.contentWindow) return
      if (e.data && e.data.type === 'TOKEN') finish(e.data.token ?? null)
    }

    window.addEventListener('message', handler)
    iframe.contentWindow.postMessage('GET_TOKEN', '*')
    setTimeout(() => finish(null), timeoutMs)
  })
}

// Écrit un JWT dans le localStorage JourDoc via le bridge (utilisé par le mini-login,
// phase 3). Résout true si confirmé, false sinon.
export function setTokenViaBridge(token, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const iframe = document.getElementById(IFRAME_ID)
    if (!iframe || !iframe.contentWindow) return resolve(false)

    let done = false
    const finish = (value) => {
      if (done) return
      done = true
      window.removeEventListener('message', handler)
      resolve(value)
    }

    const handler = (e) => {
      if (e.source !== iframe.contentWindow) return
      if (e.data && e.data.type === 'TOKEN_SET') finish(!!e.data.ok)
    }

    window.addEventListener('message', handler)
    iframe.contentWindow.postMessage({ type: 'SET_TOKEN', token }, '*')
    setTimeout(() => finish(false), timeoutMs)
  })
}
