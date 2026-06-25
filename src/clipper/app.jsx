// src/clipper/app.jsx — point d'entrée de la fenêtre clipper (clipper-app.js).
// Servie first-party par JourDoc : tous les appels API sont same-origin.

import React from 'react'
import ReactDOM from 'react-dom/client'
import ClipperApp from './ClipperApp.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClipperApp />
  </React.StrictMode>
)
