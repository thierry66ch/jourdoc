// server/lib/clipper/fetchPage.js — téléchargement serveur d'une page (capture de lien).
//
// Contrairement au bookmarklet (qui envoie le DOM rendu), ici on récupère le HTML
// BRUT sans exécution JS : marche sur les sites « contenu » (presse, blogs, wiki),
// échoue sur les SPA rendues côté client. UA navigateur (certains sites bloquent
// sinon), redirections suivies, timeout, garde anti-SSRF basique, gestion du charset.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// Bloque les hôtes manifestement internes (best-effort, pas une protection SSRF complète).
function isBlockedHost(h) {
  h = (h || '').toLowerCase()
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return true
  return false
}

function decode(buf, contentType) {
  let charset = (String(contentType || '').match(/charset=([^;]+)/i)?.[1] || '').trim().toLowerCase()
  // Repli : <meta charset> dans les 2 premiers Ko si absent du header
  if (!charset) {
    const head = buf.subarray(0, 2048).toString('latin1')
    charset = (head.match(/<meta[^>]+charset=["']?\s*([\w-]+)/i)?.[1] || '').toLowerCase()
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(buf)
  } catch {
    return new TextDecoder('utf-8').decode(buf)
  }
}

/**
 * @param {string} url
 * @returns {Promise<{ html: string, finalUrl: string }>}
 */
export async function fetchPage(url, { timeoutMs = 12000, maxBytes = 4 * 1024 * 1024 } = {}) {
  let u
  try { u = new URL(url) } catch { throw new Error('URL invalide') }
  if (!/^https?:$/.test(u.protocol)) throw new Error('protocole non supporté')
  if (isBlockedHost(u.hostname)) throw new Error('hôte non autorisé')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(u.href, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ct = res.headers.get('content-type') || ''
    if (ct && !/text\/html|application\/xhtml|application\/xml/i.test(ct)) {
      throw new Error(`pas une page HTML (${ct.split(';')[0].trim()})`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error('réponse vide')
    if (buf.length > maxBytes) throw new Error('page trop volumineuse')
    return { html: decode(buf, ct), finalUrl: res.url || u.href }
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('délai dépassé')
    throw e
  } finally {
    clearTimeout(timer)
  }
}
