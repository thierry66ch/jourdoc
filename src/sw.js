import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

// Prendre le contrôle immédiatement sans attendre la fermeture des onglets
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// ─── Web Share Target (Android) ────────────────────────────────────────────────
// La PWA installée reçoit un partage (lien/texte/fichiers) via POST /share (déclaré
// dans le manifeste, multipart). Un POST de navigation ne peut pas être lu par la
// page : le SW l'intercepte, stocke le contenu dans le Cache Storage, puis redirige
// vers /share (GET) que la page React lit. Cf. src/pages/ShareTarget.jsx.
const SHARE_CACHE = 'jd-share'

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/share') return

  event.respondWith((async () => {
    try {
      const form = await event.request.formData()
      const cache = await caches.open(SHARE_CACHE)

      // Fichiers (param "file" du manifeste) → un Response par fichier.
      const files = form.getAll('file').filter((f) => f && typeof f === 'object' && f.size > 0)
      let i = 0
      for (const f of files) {
        await cache.put(`/__share/file/${i}`, new Response(f, {
          headers: {
            'content-type': f.type || 'application/octet-stream',
            'x-filename': encodeURIComponent(f.name || `fichier-${i}`),
          },
        }))
        i++
      }

      const meta = {
        title: form.get('title') || '',
        text: form.get('text') || '',
        url: form.get('url') || '',
        fileCount: i,
        ts: Date.now(),
      }
      await cache.put('/__share/meta', new Response(JSON.stringify(meta), {
        headers: { 'content-type': 'application/json' },
      }))
    } catch (e) {
      // En cas d'échec on redirige quand même (la page affichera "rien reçu").
    }
    return Response.redirect('/share?received=1', 303)
  })())
})
