// src/clipper/main.jsx — point d'entrée du bundle clipper (IIFE autonome)
//
// Injecté par le bookmarklet sur une page tierce. Il :
//   1. déduit l'origine JourDoc depuis sa propre URL de script,
//   2. monte l'overlay React dans un shadow DOM (isolation des styles de l'hôte).
//
// L'auth passe par une POPUP first-party (cf. bridge.js) — pas d'iframe, car le
// localStorage d'une iframe tierce est partitionné et ne voit pas le token JourDoc.

import React from 'react'
import ReactDOM from 'react-dom/client'
import ClipperOverlay from './ClipperOverlay.jsx'

const ROOT_ID = 'jd-clipper-root'

// Origine JourDoc = origine du script clipper.js lui-même.
// Fonctionne en prod (jourdoc.pogil.ch) comme en dev (localhost:5173).
function resolveOrigin() {
  try {
    const src = document.currentScript?.src
    if (src) return new URL(src).origin
  } catch (_) {}
  const tag = [...document.scripts].find((s) => s.src.includes('clipper.js'))
  if (tag) {
    try { return new URL(tag.src).origin } catch (_) {}
  }
  return 'https://jourdoc.pogil.ch'
}

const ORIGIN = resolveOrigin()

function boot() {
  if (document.getElementById(ROOT_ID)) return // déjà injecté

  const host = document.createElement('div')
  host.id = ROOT_ID
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const mount = document.createElement('div')
  shadow.appendChild(mount)

  const close = () => {
    try { root.unmount() } catch (_) {}
    host.remove()
  }

  const root = ReactDOM.createRoot(mount)
  root.render(
    <React.StrictMode>
      <ClipperOverlay origin={ORIGIN} pageUrl={location.href} pageTitle={document.title} onClose={close} />
    </React.StrictMode>
  )
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}
