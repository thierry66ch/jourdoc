// src/clipper/main.jsx — point d'entrée du bundle clipper (IIFE autonome)
//
// Injecté par le bookmarklet sur une page tierce. Il :
//   1. déduit l'origine JourDoc depuis sa propre URL de script,
//   2. injecte l'iframe cachée auth-bridge.html (lecture du JWT),
//   3. monte l'overlay React dans un shadow DOM (isolation des styles de l'hôte).

import React from 'react'
import ReactDOM from 'react-dom/client'
import ClipperOverlay from './ClipperOverlay.jsx'

const ROOT_ID = 'jd-clipper-root'
const BRIDGE_ID = 'jd-clipper-bridge'

// Origine JourDoc = origine du script clipper.js lui-même.
// Fonctionne en prod (jourdoc.pogil.ch) comme en dev (localhost:5173).
function resolveOrigin() {
  try {
    const src = document.currentScript?.src
    if (src) return new URL(src).origin
  } catch (_) {}
  // Repli : chercher un <script> dont le src contient clipper.js
  const tag = [...document.scripts].find((s) => s.src.includes('clipper.js'))
  if (tag) {
    try { return new URL(tag.src).origin } catch (_) {}
  }
  return 'https://jourdoc.pogil.ch'
}

const ORIGIN = resolveOrigin()

function boot() {
  if (document.getElementById(ROOT_ID)) return // déjà injecté

  // 1. Iframe bridge cachée
  const iframe = document.createElement('iframe')
  iframe.id = BRIDGE_ID
  iframe.src = `${ORIGIN}/auth-bridge.html`
  iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;left:-9999px;'
  document.body.appendChild(iframe)

  // 2. Hôte de l'overlay + shadow DOM (isolation styles)
  const host = document.createElement('div')
  host.id = ROOT_ID
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const mount = document.createElement('div')
  shadow.appendChild(mount)

  const close = () => {
    try { ReactDOM.createRoot && root.unmount() } catch (_) {}
    host.remove()
    iframe.remove()
  }

  const root = ReactDOM.createRoot(mount)
  root.render(
    <React.StrictMode>
      <ClipperOverlay origin={ORIGIN} pageUrl={location.href} pageTitle={document.title} onClose={close} />
    </React.StrictMode>
  )
}

// currentScript n'est valable que pendant l'exécution synchrone du script.
// ORIGIN est déjà capturé ; on peut différer le boot jusqu'au DOM prêt.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}
