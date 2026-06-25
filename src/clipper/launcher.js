// src/clipper/launcher.js — script injecté par le bookmarklet (entrée de clipper.js).
//
// CSP-proof : ne fait AUCUN appel réseau vers l'API JourDoc (la `connect-src` du site
// hôte le bloquerait). Il se contente de :
//   1) déduire l'origine JourDoc depuis sa propre URL de script,
//   2) afficher un petit bouton in-page (shadow DOM, isolé des styles de l'hôte),
//   3) au clic (geste utilisateur → window.open autorisé) : nettoyer le HTML de la
//      page et ouvrir la fenêtre clipper-app (sur JourDoc), à qui il transmet
//      { url, title, html } par postMessage. Tout le réseau se fait dans cette
//      fenêtre, en same-origin, hors de portée de la CSP du site.
// JS pur (pas de React) → bundle minuscule, injection rapide.

const ROOT_ID = 'jd-clipper-root'

function resolveOrigin() {
  try {
    const src = document.currentScript && document.currentScript.src
    if (src) return new URL(src).origin
  } catch (_) {}
  const tag = [...document.scripts].find((s) => s.src.includes('clipper.js'))
  if (tag) { try { return new URL(tag.src).origin } catch (_) {} }
  return 'https://jourdoc.pogil.ch'
}

const ORIGIN = resolveOrigin()

// Sérialise le HTML en retirant tout ce dont Readability n'a pas besoin (réduit la
// taille pour rester sous la limite serveur).
function cleanPageHtml() {
  const root = document.documentElement.cloneNode(true)
  root.querySelectorAll(
    'script,style,noscript,svg,link,template,iframe,canvas,video,audio,object,embed,#' + ROOT_ID
  ).forEach((el) => el.remove())
  root.querySelectorAll('img[src^="data:"]').forEach((img) => {
    if ((img.getAttribute('src') || '').length > 5000) img.removeAttribute('src')
  })
  return '<!DOCTYPE html>' + root.outerHTML
}

function boot() {
  if (document.getElementById(ROOT_ID)) return

  const host = document.createElement('div')
  host.id = ROOT_ID
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>
      .p { position: fixed; top: 20px; right: 20px; z-index: 2147483647;
           width: 280px; max-width: calc(100vw - 24px);
           background: #1a1a2e; color: #e6e6f0; border-radius: 12px;
           box-shadow: 0 10px 40px rgba(0,0,0,.45);
           font: 14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; overflow: hidden; }
      .h { display: flex; align-items: center; justify-content: space-between;
           padding: 10px 12px; background: #6366f1; color: #fff; font-weight: 600; }
      .x { cursor: pointer; background: transparent; border: 0; color: #fff; font-size: 20px; width: 30px; height: 30px; }
      .b { padding: 12px; }
      button.go { display: block; width: 100%; min-height: 46px; margin-top: 4px; cursor: pointer;
                  border: 0; border-radius: 8px; background: #6366f1; color: #fff; font-weight: 600; font-size: 15px; }
      .s { font-size: 12px; opacity: .7; margin-top: 10px; }
    </style>
    <div class="p">
      <div class="h"><span>JourDoc Clipper</span><button class="x" title="Fermer">×</button></div>
      <div class="b">
        <button class="go">Clipper cette page</button>
        <div class="s"></div>
      </div>
    </div>`

  const status = shadow.querySelector('.s')
  const remove = () => host.remove()
  shadow.querySelector('.x').addEventListener('click', remove)

  shadow.querySelector('.go').addEventListener('click', () => {
    const html = cleanPageHtml()
    const w = window.open(`${ORIGIN}/clipper-app.html`, 'jd-clipper', 'width=400,height=720,menubar=no,toolbar=no')
    if (!w) { status.textContent = '🚫 Fenêtre bloquée — autorise les pop-ups pour ce site, puis réessaie.'; return }

    const payload = { type: 'JD_CLIP_PAGE', url: location.href, title: document.title, html }
    let sent = false
    const send = () => { if (sent) return; sent = true; try { w.postMessage(payload, ORIGIN) } catch (_) {} }
    const onMsg = (e) => {
      if (e.origin === ORIGIN && e.data && e.data.type === 'JD_CLIP_READY') {
        send(); window.removeEventListener('message', onMsg); remove()
      }
    }
    window.addEventListener('message', onMsg)
    // Filet de sécurité si la fenêtre est prête avant qu'on écoute.
    setTimeout(send, 1500)
    status.textContent = 'Fenêtre JourDoc ouverte…'
  })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
else boot()
